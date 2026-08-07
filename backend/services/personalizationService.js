/**
 * Personalization service — assembles a role-aware "home" bundle from the user's
 * own history plus existing geo/store/drive models. Pure read/compose; it never
 * writes and never blocks (each sub-fetch is guarded so a partial failure still
 * returns a useful bundle). Gated by the `personalization` feature flag at the
 * route layer.
 */
const personalizationModel = require('../models/personalizationModel');
const addressModel = require('../models/addressModel');
const storeModel = require('../models/storeModel');
const driveModel = require('../models/collectionDriveModel');
const { findUserById } = require('../models/userModel');
const { isEnabled } = require('./featureService');
const { isRewardsEnabled } = require('../models/settingsModel');
const rewardModel = require('../models/rewardModel');
const catalogModel = require('../models/rewardCatalogModel');
const logger = require('../utils/logger');

const RECOMMENDED_LIMIT = 5;
const DRIVE_REMINDER_DAYS = 14;

const firstName = (name) => (name ? String(name).trim().split(/\s+/)[0] : null);
const safe = async (p, fallback) => {
  try {
    return await p;
  } catch (err) {
    logger.warn('personalization sub-fetch failed (ignored)', { error: err.message });
    return fallback;
  }
};

// Role/user-type quick actions — the shortcuts most relevant to each persona.
function quickActionsFor(role, userType) {
  if (role === 'recycler') {
    return [
      { label: 'Incoming pickups', href: '/recycler/pickups', icon: 'Inbox' },
      { label: 'My stores', href: '/recycler/stores', icon: 'Store' },
      { label: 'Host a drive', href: '/recycler/drives', icon: 'CalendarHeart' },
    ];
  }
  if (role === 'admin') {
    return [
      { label: 'Overview', href: '/admin', icon: 'LayoutDashboard' },
      { label: 'Verify stores', href: '/admin', icon: 'ShieldCheck' },
    ];
  }
  // role === 'user' — vary by persona.
  const schedule = { label: 'Schedule a pickup', href: '/pickup/new', icon: 'CalendarClock' };
  const stores = { label: 'Find stores', href: '/stores', icon: 'MapPin' };
  const dropoff = { label: 'Drop-off', href: '/dropoff', icon: 'PackageCheck' };
  const reports = { label: 'Impact reports', href: '/reports', icon: 'BarChart3' };
  switch (userType) {
    case 'bulk_producer':
      return [schedule, reports, dropoff];
    case 'small_business':
      return [schedule, stores, reports];
    case 'manufacturer':
      return [stores, schedule, reports];
    default:
      return [schedule, stores, dropoff];
  }
}

// Best-effort reward nudge: "N points to your next reward". Read-only; skipped
// when rewards is off/inactive. Never modifies reward state.
async function rewardTip(userId) {
  try {
    if (!(await isEnabled('rewards')) || !(await isRewardsEnabled())) return null;
    const account = await rewardModel.getAccount(userId);
    const balance = account ? account.pointsBalance : 0;
    const catalog = await catalogModel.listCatalog();
    if (!catalog.length) return null;
    const affordable = catalog.filter((i) => balance >= i.pointsCost);
    if (affordable.length) {
      const best = affordable.sort((a, b) => b.pointsCost - a.pointsCost)[0];
      return { balance, message: `You can redeem "${best.name}" now`, href: '/rewards' };
    }
    const next = catalog.sort((a, b) => a.pointsCost - b.pointsCost)[0];
    return {
      balance,
      message: `${next.pointsCost - balance} points to unlock "${next.name}"`,
      href: '/rewards',
    };
  } catch {
    return null;
  }
}

// Rule-based suggested actions from the user's current state (top few).
function suggestedActions({ defaultAddress, hasActivePickup, nearbyDrives, favorite, tip }) {
  const actions = [];
  if (!defaultAddress) {
    actions.push({ key: 'add_address', label: 'Add your address', hint: 'Set a preferred pickup location', href: '/profile' });
  }
  if (!hasActivePickup) {
    actions.push({ key: 'schedule', label: 'Schedule a pickup', hint: 'Doorstep collection, auto-matched', href: '/pickup/new' });
  }
  if (nearbyDrives && nearbyDrives.length) {
    actions.push({ key: 'join_drive', label: 'Join a drive near you', hint: `${nearbyDrives.length} upcoming nearby`, href: '/drives' });
  }
  if (favorite) {
    actions.push({ key: 'favorite', label: `Recycle with ${favorite.storeName} again`, hint: 'Your most-used store', href: `/stores/${favorite.storeId}` });
  }
  if (tip) {
    actions.push({ key: 'rewards', label: 'Check your rewards', hint: tip.message, href: '/rewards' });
  }
  return actions.slice(0, 4);
}

const trimStore = (s) => ({
  id: s.id,
  storeName: s.storeName,
  city: s.city,
  rating: s.rating,
  distanceKm: s.distanceKm ?? null,
  acceptedWasteTypes: s.acceptedWasteTypes || [],
});

/**
 * Build the personalized home bundle for a user.
 * @param {{id:number, role:string}} authUser
 */
async function getHome(authUser) {
  const user = await findUserById(authUser.id);
  const role = authUser.role;
  const userType = (user && user.user_type) || null;
  const greeting = firstName(user && user.name);

  // Recycler/admin get a lighter, valid bundle (their consoles are elsewhere).
  if (role !== 'user') {
    return {
      role,
      userType,
      greeting,
      quickActions: quickActionsFor(role, userType),
      suggestedActions: [],
      recommendedRecyclers: [],
      nearbyDrives: [],
      driveReminders: [],
      frequentWasteTypes: [],
      preferredTimeSlots: [],
      favoriteRecycler: null,
      recentActivity: [],
      stats: null,
      rewardTip: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const addresses = await safe(addressModel.listAddresses(authUser.id), []);
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0] || null;
  const coords =
    defaultAddress && defaultAddress.latitude != null && defaultAddress.longitude != null
      ? { lat: Number(defaultAddress.latitude), lng: Number(defaultAddress.longitude) }
      : null;

  const [freq, slots, favorite, recent, hasActive, stats] = await Promise.all([
    safe(personalizationModel.frequentWasteTypes(authUser.id), []),
    safe(personalizationModel.preferredTimeSlots(authUser.id), []),
    safe(personalizationModel.favoriteRecycler(authUser.id), null),
    safe(personalizationModel.recentActivity(authUser.id), []),
    safe(personalizationModel.hasActivePickup(authUser.id), false),
    safe(personalizationModel.stats(authUser.id), { completed: 0, totalKg: 0 }),
  ]);

  // Recommended recyclers = nearest Active+Verified stores to the preferred
  // address (getNearestStores already filters to eligible stores).
  const recommended = coords
    ? await safe(
        storeModel.getNearestStores(coords.lat, coords.lng, { limit: RECOMMENDED_LIMIT }).then((r) => r.rows),
        []
      )
    : [];

  const nearbyDrives = await safe(
    driveModel.listForUser(authUser.id, { status: 'UPCOMING', ...(coords || {}), limit: 5 }),
    []
  );

  // Drive reminders = drives the user RSVP'd to that are upcoming within N days.
  const myDrives = await safe(driveModel.myDrives(authUser.id), []);
  const cutoff = new Date(Date.now() + DRIVE_REMINDER_DAYS * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const driveReminders = myDrives.filter((d) => {
    const day = d.scheduledDate ? String(d.scheduledDate).slice(0, 10) : null;
    return d.status === 'UPCOMING' && day && day >= today && day <= cutoff;
  });

  const tip = await rewardTip(authUser.id);

  return {
    role,
    userType,
    greeting,
    quickActions: quickActionsFor(role, userType),
    suggestedActions: suggestedActions({ defaultAddress, hasActivePickup: hasActive, nearbyDrives, favorite, tip }),
    recommendedRecyclers: recommended.map(trimStore),
    nearbyDrives,
    driveReminders,
    frequentWasteTypes: freq,
    preferredTimeSlots: slots,
    favoriteRecycler: favorite,
    recentActivity: recent,
    preferredAddress: defaultAddress
      ? { id: defaultAddress.id, label: defaultAddress.label, address: defaultAddress.address }
      : null,
    savedLocationCount: addresses.length,
    stats,
    rewardTip: tip,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getHome };
