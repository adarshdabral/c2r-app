/**
 * Consumer chatbot action handlers. Each is an independent, self-describing
 * capability the assistant can execute by calling existing models/services.
 *
 * Handler contract:
 *   { id, roles, confirm, title, keywords, patterns,
 *     prepare?(ctx) -> { ok, params?, confirmText?, reply?, suggestions? },
 *     execute(ctx, params) -> { reply, data?, suggestions? } }
 *
 * `confirm:true` actions run prepare() first (to resolve a concrete target and a
 * confirmation prompt); execute() runs only after the user confirms.
 */
const pickupModel = require('../../../models/pickupRequestModel');
const driveModel = require('../../../models/collectionDriveModel');
const storeModel = require('../../../models/storeModel');
const addressModel = require('../../../models/addressModel');
const personalizationModel = require('../../../models/personalizationModel');
const rewardEngine = require('../../rewardEngine');
const notificationService = require('../../notificationService');
const { prettyStatus } = require('../../../config/assistantKnowledge');

const ACTIVE_PICKUP = ['REQUESTED', 'BROADCASTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'OTP_PENDING'];

const coordsFor = async (userId) => {
  const addrs = await addressModel.listAddresses(userId).catch(() => []);
  const a = addrs.find((x) => x.isDefault) || addrs[0];
  return a && a.latitude != null && a.longitude != null
    ? { lat: Number(a.latitude), lng: Number(a.longitude) }
    : null;
};

const latestActivePickup = async (userId) => {
  const { rows } = await pickupModel.listForUser(userId, { limit: 10 });
  return (rows || []).find((r) => ACTIVE_PICKUP.includes(r.status)) || null;
};

module.exports = [
  {
    id: 'track_pickup',
    roles: ['user'],
    confirm: false,
    title: 'Track pickup',
    keywords: ['track', 'status', 'where is my pickup', 'my pickup', 'pickup status'],
    patterns: [/(track|status).*(pickup|request|order)/i],
    async execute(ctx) {
      const p = await latestActivePickup(ctx.user.id);
      if (!p) {
        const { rows } = await pickupModel.listForUser(ctx.user.id, { limit: 1 });
        if (!rows || !rows.length) {
          return { reply: "You don't have any pickups yet. Want to schedule one?", suggestions: ['Schedule a pickup'] };
        }
        return { reply: `Your last pickup (${rows[0].wasteCategory || 'e-waste'}) is ${prettyStatus(rows[0].status)}.` };
      }
      return {
        reply: `Your ${p.wasteCategory || 'e-waste'} pickup is currently ${prettyStatus(p.status)}.`,
        data: { pickupId: p.id, status: p.status },
        suggestions: ['View my pickups'],
      };
    },
  },

  {
    id: 'cancel_pickup',
    roles: ['user'],
    confirm: true,
    title: 'Cancel pickup',
    keywords: ['cancel', 'call off', 'stop my pickup'],
    patterns: [/cancel.*(pickup|request)/i],
    async prepare(ctx) {
      const p = await latestActivePickup(ctx.user.id);
      if (!p) return { ok: false, reply: 'You have no active pickup to cancel.' };
      return {
        ok: true,
        params: { pickupId: p.id },
        confirmText: `Cancel your ${p.wasteCategory || 'e-waste'} pickup (currently ${prettyStatus(p.status)})?`,
      };
    },
    async execute(ctx, params) {
      await pickupModel.cancelRequest(params.pickupId, ctx.user.id);
      notificationService.notifySafe({
        userId: ctx.user.id,
        category: 'pickup',
        type: 'pickup_cancelled',
        title: 'Pickup cancelled',
        body: 'Your pickup request was cancelled via the assistant.',
        data: { href: '/pickups', refType: 'pickup', refId: params.pickupId },
      });
      return { reply: 'Done — your pickup has been cancelled.', suggestions: ['Schedule a pickup'] };
    },
  },

  {
    id: 'find_recyclers',
    roles: ['user'],
    confirm: false,
    title: 'Find recyclers',
    keywords: ['find recycler', 'nearby recycler', 'nearest recycler', 'recyclers near', 'find store', 'nearby store'],
    patterns: [/(find|nearby|nearest).*(recycler|store)/i],
    async execute(ctx) {
      const coords = await coordsFor(ctx.user.id);
      if (!coords) {
        return { reply: 'Add a saved address so I can find recyclers near you.', action: { label: 'Add address', href: '/profile' } };
      }
      const { rows } = await storeModel.getNearestStores(coords.lat, coords.lng, { limit: 3 });
      if (!rows.length) return { reply: 'No verified recyclers found near you yet.' };
      const list = rows.map((s) => `• ${s.storeName}${s.distanceKm != null ? ` (${s.distanceKm} km)` : ''}`).join('\n');
      return { reply: `Recyclers near you:\n${list}`, data: { stores: rows.map((s) => ({ id: s.id, name: s.storeName })) }, action: { label: 'View stores', href: '/stores' } };
    },
  },

  {
    id: 'find_drives',
    roles: ['user'],
    confirm: false,
    title: 'Find collection drives',
    keywords: ['find drive', 'collection drive', 'events near', 'nearby drive', 'drives near'],
    patterns: [/(find|nearby|upcoming).*(drive|event)/i],
    async execute(ctx) {
      const coords = await coordsFor(ctx.user.id);
      const drives = await driveModel.listForUser(ctx.user.id, { status: 'UPCOMING', ...(coords || {}), limit: 3 });
      if (!drives.length) return { reply: 'No upcoming collection drives right now — check back soon!', action: { label: 'Browse events', href: '/drives' } };
      const list = drives.map((d) => `• ${d.title} — ${String(d.scheduledDate).slice(0, 10)}`).join('\n');
      return { reply: `Upcoming drives:\n${list}`, data: { drives: drives.map((d) => ({ id: d.id, title: d.title })) }, action: { label: 'Browse events', href: '/drives' } };
    },
  },

  {
    id: 'join_drive',
    roles: ['user'],
    confirm: true,
    title: 'Join a drive',
    keywords: ['join drive', 'rsvp', 'sign up for drive', 'attend drive'],
    patterns: [/(join|rsvp|attend).*(drive|event)/i],
    async prepare(ctx) {
      const coords = await coordsFor(ctx.user.id);
      const drives = await driveModel.listForUser(ctx.user.id, { status: 'UPCOMING', ...(coords || {}), limit: 5 });
      const next = drives.find((d) => d.myRsvp !== 'GOING');
      if (!next) return { ok: false, reply: 'No upcoming drives to join (or you\'ve joined them all).' };
      return { ok: true, params: { driveId: next.id, title: next.title }, confirmText: `Join "${next.title}" on ${String(next.scheduledDate).slice(0, 10)}?` };
    },
    async execute(ctx, params) {
      await driveModel.rsvp(params.driveId, ctx.user.id);
      rewardEngine.awardSafe(ctx.user.id, 'drive_joined', { refType: 'drive', refId: params.driveId });
      notificationService.notifySafe({
        userId: ctx.user.id,
        category: 'drive',
        type: 'drive_joined',
        title: `You're going to ${params.title}`,
        data: { href: '/drives', refType: 'drive', refId: params.driveId },
      });
      return { reply: `You're in! See you at "${params.title}".`, action: { label: 'View events', href: '/drives' } };
    },
  },

  {
    id: 'view_rewards',
    roles: ['user'],
    confirm: false,
    title: 'View rewards',
    keywords: ['my rewards', 'my points', 'reward balance', 'how many points'],
    patterns: [/(my|view).*(reward|point)/i],
    async execute(ctx) {
      try {
        const profile = await rewardEngine.getProfile(ctx.user.id);
        return {
          reply: `You have ${profile.pointsBalance} points (level ${profile.level}, ${profile.streakCount}-day streak). ${profile.badges.length} badge(s) earned.`,
          data: { points: profile.pointsBalance, level: profile.level },
          action: { label: 'My rewards', href: '/rewards' },
        };
      } catch {
        return { reply: 'Rewards aren\'t active right now.' };
      }
    },
  },

  {
    id: 'view_activity',
    roles: ['user'],
    confirm: false,
    title: 'View activity',
    keywords: ['my activity', 'activity history', 'recent activity', 'what did i do'],
    patterns: [/(my|recent|view).*(activity|history)/i],
    async execute(ctx) {
      const recent = await personalizationModel.recentActivity(ctx.user.id, 5);
      if (!recent.length) return { reply: 'No activity yet — schedule a pickup to get started!' };
      const list = recent.map((r) => `• ${r.type === 'pickup' ? 'Pickup' : 'Drop-off'} (${r.category}) — ${prettyStatus(r.status)}`).join('\n');
      return { reply: `Your recent activity:\n${list}`, action: { label: 'Activity history', href: '/activity' } };
    },
  },
];
