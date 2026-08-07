/**
 * Recycler + admin chatbot action handlers (read-only, no confirmation needed).
 * Manufacturer/organization product actions are intentionally NOT built —
 * see the `products_coming_soon` extension point below.
 */
const pickupModel = require('../../../models/pickupRequestModel');
const storeModel = require('../../../models/storeModel');
const analyticsModel = require('../../../models/analyticsModel');
const { prettyStatus } = require('../../../config/assistantKnowledge');

const TODAY = () => new Date().toISOString().slice(0, 10);
const isToday = (d) => d && String(new Date(d).toISOString()).slice(0, 10) === TODAY();

module.exports = [
  {
    id: 'todays_schedule',
    roles: ['recycler'],
    confirm: false,
    title: "Today's schedule",
    keywords: ['today schedule', "today's schedule", 'my schedule', 'my pickups today', 'route today'],
    patterns: [/(today|my).*(schedule|route|pickups)/i],
    async execute(ctx) {
      const inbox = await pickupModel.listForRecycler(ctx.user.id, { scope: 'active' });
      const assigned = (inbox || []).filter((r) =>
        ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'OTP_PENDING'].includes(r.status)
      );
      if (!assigned.length) {
        const open = (inbox || []).filter((r) => r.status === 'BROADCASTED').length;
        return { reply: `No accepted pickups on your schedule. ${open} open request(s) waiting.`, action: { label: 'Open requests', href: '/recycler/pickups' } };
      }
      const list = assigned
        .slice(0, 6)
        .map((r) => `• ${r.pickupAddress} — ${r.wasteCategory} (${prettyStatus(r.status)})`)
        .join('\n');
      return { reply: `Your active pickups:\n${list}`, data: { count: assigned.length }, action: { label: 'My pickups', href: '/recycler/pickups' } };
    },
  },

  {
    id: 'view_stores',
    roles: ['recycler'],
    confirm: false,
    title: 'My stores',
    keywords: ['my stores', 'manage store', 'my store', 'store status'],
    patterns: [/(my|manage).*(store)/i],
    async execute(ctx) {
      const stores = await storeModel.listStoresByRecycler(ctx.user.id);
      if (!stores.length) return { reply: 'You have no stores yet. Add one to start receiving pickups.', action: { label: 'My stores', href: '/recycler/stores' } };
      const verified = stores.filter((s) => s.verificationStatus === 'Verified').length;
      return { reply: `You run ${stores.length} store(s), ${verified} verified.`, action: { label: 'Manage stores', href: '/recycler/stores' } };
    },
  },

  {
    id: 'platform_health',
    roles: ['admin'],
    confirm: false,
    title: 'Platform health',
    keywords: ['platform health', 'analytics', 'platform stats', 'how is the platform', 'overview'],
    patterns: [/(platform|view).*(health|analytics|stats|overview)/i],
    async execute() {
      const h = await analyticsModel.platformHealth();
      return {
        reply: `Platform health: ${h.users} users (${h.recyclers} recyclers), ${h.stores} stores (${h.storesPending} pending verification), ${h.pickupsToday} pickups today, ${h.openDisputes} open disputes.`,
        data: h,
        action: { label: 'Open dashboard', href: '/admin' },
      };
    },
  },

  {
    id: 'manage_users',
    roles: ['admin'],
    confirm: false,
    title: 'Manage users',
    keywords: ['manage users', 'manage recyclers', 'suspend user', 'verify recycler', 'user management'],
    patterns: [/manage.*(user|recycler)/i],
    async execute() {
      return { reply: 'Open the admin dashboard to manage users and verify recyclers.', action: { label: 'Manage users', href: '/admin' } };
    },
  },

  {
    id: 'manage_feature_flags',
    roles: ['admin'],
    confirm: false,
    title: 'Feature flags',
    keywords: ['feature flag', 'enable feature', 'disable feature', 'platform features', 'toggle feature'],
    patterns: [/(feature flag|platform feature|toggle.*feature)/i],
    async execute() {
      return { reply: 'Manage platform features under Settings → Platform Features in the admin dashboard.', action: { label: 'Platform Features', href: '/admin' } };
    },
  },

  // Extension point: manufacturer/organization product capabilities. Not built —
  // returns a friendly "coming soon" without breaking the action architecture.
  {
    id: 'products_coming_soon',
    roles: ['user'],
    confirm: false,
    title: 'Products',
    keywords: ['register product', 'product analytics', 'product lifecycle', 'product recovery', 'my products'],
    patterns: [/(register|track).*(product)/i, /product (analytics|lifecycle|recovery)/i],
    async execute() {
      return { reply: 'Product registration and lifecycle analytics are coming soon. I\'ll be able to help with that once the Products module ships.' };
    },
  },
];
