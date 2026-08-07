/**
 * Assistant knowledge base — a rule/intent engine, NO LLM.
 *
 * Each intent declares:
 *  - id:          stable identifier (also returned to the client)
 *  - keywords:    lowercase substrings; each hit adds to the match score
 *  - patterns:    optional regexes; a hit adds a strong score bump
 *  - reply:       string, or (ctx) => string | Promise<string>. ctx carries the
 *                 authenticated user ({ id, role, userType, name }) and lazy data
 *                 loaders so answers can be personalised without an LLM.
 *  - suggestions: follow-up prompt chips
 *  - action:      optional deep link the app can render as a CTA
 *  - roles:       optional allow-list; intent is only offered to these roles
 *
 * The scorer (services/assistantService.js) picks the highest-scoring intent and
 * falls back to `fallback` when nothing matches.
 */

const INTENTS = [
  {
    id: 'greeting',
    keywords: ['hi', 'hello', 'hey', 'good morning', 'good evening', 'namaste'],
    patterns: [/^\s*(hi|hey|hello|yo)\b/i],
    reply: (ctx) =>
      `Hi${ctx.name ? ` ${ctx.name}` : ''}! I'm the Connect2Recycle assistant. I can help you schedule a pickup, find a drop-off store, understand the OTP handover, track a request, or explain rewards and reports. What do you need?`,
    suggestions: ['How do I schedule a pickup?', 'What e-waste do you accept?', 'Track my pickup']
  },

  {
    id: 'schedule_pickup',
    keywords: ['schedule', 'book', 'pickup', 'collect', 'doorstep', 'raise a request', 'new pickup'],
    patterns: [/how.*(schedule|book|raise).*(pickup|collection)/i],
    roles: ['user'],
    reply:
      "To schedule a doorstep pickup: open Schedule Pickup, choose your e-waste categories and rough quantity, set the address and a preferred time slot, then submit. We broadcast it to the nearest verified recyclers and the first to accept is assigned. You'll get an OTP on your dashboard to hand over safely.",
    suggestions: ['How does the OTP work?', 'What e-waste do you accept?', 'Pickup vs drop-off?'],
    action: { label: 'Schedule a pickup', href: '/pickup/new' }
  },

  {
    id: 'dropoff',
    keywords: ['drop off', 'drop-off', 'dropoff', 'store', 'bring it', 'myself', 'walk in'],
    patterns: [/(drop.?off|bring).*(store|myself|center|centre)/i],
    reply:
      "A drop-off lets you bring e-waste to a specific store at a time slot you choose. Open Find Stores, pick a verified store that accepts your categories, request a slot, and the store approves it. At handover you and the store confirm a mutual OTP to complete the drop-off.",
    suggestions: ['Find a store near me', 'Pickup vs drop-off?', 'What e-waste do you accept?'],
    action: { label: 'Find stores', href: '/stores' }
  },

  {
    id: 'pickup_vs_dropoff',
    keywords: ['difference', 'vs', 'versus', 'which one', 'compare'],
    patterns: [
      /(pickup|collect).*(vs|versus|or|and).*(drop)/i,
      /(drop).*(vs|versus|or|and).*(pickup)/i,
      /difference.*(pickup|drop)/i
    ],
    reply:
      "Pickup = we come to you: you raise a request and the nearest verified recycler collects it from your address. Drop-off = you go to them: you pick a store and time slot and drop the e-waste yourself. Both finish with a mutual OTP handshake so the handover is verified.",
    suggestions: ['How do I schedule a pickup?', 'Find a store near me']
  },

  {
    id: 'accepted_waste',
    keywords: ['accept', 'what waste', 'categories', 'types', 'e-waste', 'ewaste', 'items', 'what can i recycle'],
    patterns: [/what.*(accept|recycle|waste|categories|types)/i],
    reply:
      "We accept common e-waste categories — batteries, mobile phones & tablets, laptops & computers, small and large appliances, monitors & TVs, cables & chargers, and other electronics. Each store lists exactly which categories it takes; matching is by category, so pick the ones that fit your items when you raise a request.",
    suggestions: ['How do I schedule a pickup?', 'Find a store near me']
  },

  {
    id: 'otp',
    keywords: ['otp', 'code', 'handover', 'verify', 'verification', 'handshake'],
    patterns: [/how.*(otp|code|handover|verify)/i],
    reply:
      "Every pickup and drop-off completes with a two-sided OTP handshake. Each party gets a code: the recycler enters yours and you enter theirs. The request only completes once both codes are confirmed, so neither side can close it alone. Codes are emailed and shown on your dashboard — never share them until the actual handover.",
    suggestions: ['Track my pickup', 'How do I schedule a pickup?']
  },

  {
    id: 'track_pickup',
    keywords: ['track', 'status', 'where is', 'my pickup', 'my request', 'my order', 'ongoing'],
    patterns: [/(track|status|where).*(pickup|request|order)/i, /my (pickup|request)s?/i],
    roles: ['user'],
    // Dynamic: summarise the user's most recent active pickup.
    reply: async (ctx) => {
      try {
        const latest = await ctx.data.latestPickup();
        if (!latest) {
          return "You don't have any active pickup requests right now. Want to schedule one?";
        }
        const cat = latest.wasteCategory || 'e-waste';
        return `Your most recent pickup (${cat}) is currently ${prettyStatus(latest.status)}. You can see full details and any OTP on the My Pickups screen.`;
      } catch {
        return 'You can track every request, its status, and OTPs on the My Pickups screen.';
      }
    },
    suggestions: ['How does the OTP work?', 'Schedule another pickup'],
    action: { label: 'My pickups', href: '/pickups' }
  },

  {
    id: 'rewards',
    keywords: ['reward', 'points', 'redeem', 'incentive', 'earn'],
    patterns: [/(reward|point).*(work|earn|redeem|get)/i],
    reply:
      'You earn reward points when a recycle completes (by weight recycled). Points accrue on a tamper-evident ledger and appear on your dashboard and the My Rewards screen. Keep recycling to level up your eco-tier.',
    suggestions: ['How do I schedule a pickup?', 'Track my pickup'],
    action: { label: 'My rewards', href: '/rewards' }
  },

  {
    id: 'drives',
    keywords: ['drive', 'event', 'camp', 'collection drive', 'rsvp', 'community'],
    patterns: [/(collection )?drive|e-?waste event|camp/i],
    reply:
      'Collection drives are scheduled community e-waste events hosted by recyclers or admins. Browse upcoming drives near you, RSVP to reserve a spot, and drop your e-waste at the venue during the time window. You can see events you\'ve RSVP\'d to under My events.',
    suggestions: ['Find a store near me', 'What e-waste do you accept?'],
    action: { label: 'Browse events', href: '/drives' }
  },

  {
    id: 'reports',
    keywords: ['report', 'analytics', 'compliance', 'co2', 'carbon', 'impact report', 'summary'],
    patterns: [/(impact|transaction|compliance).*(report|summary)/i],
    roles: ['user'],
    reply: (ctx) =>
      ctx.userType === 'bulk_producer'
        ? 'As a bulk producer you get auto-generated transaction reports on every completed pickup, plus monthly, quarterly, and annual impact summaries — each a downloadable PDF with CO₂ avoided, energy and water saved, and trees-equivalent. Find them on the Impact reports screen.'
        : 'Impact reports (with CO₂, energy, and trees-equivalent metrics and downloadable PDFs) are available for bulk-producer accounts. Individual recyclers can still track their lifetime impact on the dashboard.',
    suggestions: ['Track my pickup', 'How do rewards work?'],
    action: { label: 'Impact reports', href: '/reports' }
  },

  {
    id: 'dispute',
    keywords: ['dispute', 'complaint', 'issue', 'problem', 'wrong', 'report a problem', 'raise issue'],
    patterns: [/(raise|file|open).*(dispute|complaint|issue)/i],
    reply:
      'If something went wrong with a pickup or drop-off, either party can raise a dispute against that request. An admin reviews and resolves it. Open the request in question and use the raise-a-dispute option, describing what happened.',
    suggestions: ['How does the OTP work?', 'Track my pickup']
  },

  {
    id: 'account',
    keywords: ['account', 'verify email', 'not verified', 'login', 'password', 'suspended', 'register', 'sign up', 'profile'],
    patterns: [/(verify|confirm).*(email|account)/i, /(reset|forgot).*(password)/i],
    reply:
      'New accounts are verified by an email OTP after registering — enter the code to activate, or use resend if it expired. Login needs a verified, non-suspended account. You can update your details anytime on the Profile screen; use forgot-password on the login screen to reset.',
    suggestions: ['How do I schedule a pickup?', 'Talk to support']
  },

  {
    id: 'recycler_help',
    keywords: ['my store', 'accept request', 'inbox', 'assign', 'capacity', 'verify my store', 'as a recycler'],
    patterns: [/(accept|claim).*(request|pickup)/i, /my store/i],
    roles: ['recycler'],
    reply:
      "As a recycler, incoming pickup requests appear in your inbox when your store is the nearest Active + Verified match. The first to accept wins the job. Manage each store's accepted categories, capacity, and status from your stores area; complete handovers with the mutual OTP.",
    suggestions: ['How does the OTP work?', 'How do collection drives work?']
  },

  {
    id: 'contact',
    keywords: ['support', 'help', 'contact', 'human', 'agent', 'talk to', 'email you', 'phone'],
    patterns: [/(talk|speak|contact).*(human|support|agent|someone)/i],
    reply:
      "I'm a rule-based assistant, so I can't hand off to a live agent — but I can point you the right way. For account or handover problems, raise a dispute on the specific request; for anything else, reach the team at connect2recycle@gmail.com. What are you running into?",
    suggestions: ['How do I raise a dispute?', 'Verify my account']
  },

  {
    id: 'thanks',
    keywords: ['thanks', 'thank you', 'thx', 'appreciate', 'great', 'awesome'],
    patterns: [/\bthank/i],
    reply: 'Happy to help — recycle on! Ask me anything else whenever you need it.',
    suggestions: ['How do I schedule a pickup?', 'What e-waste do you accept?']
  }
];

const FALLBACK = {
  id: 'fallback',
  reply:
    "I'm not sure about that one. I can help with scheduling pickups, drop-offs, accepted e-waste, the OTP handover, tracking requests, rewards, collection drives, reports, and disputes. Try one of the suggestions below.",
  suggestions: [
    'How do I schedule a pickup?',
    'What e-waste do you accept?',
    'Pickup vs drop-off?',
    'Track my pickup'
  ]
};

// Human-readable pickup status for dynamic replies.
const prettyStatus = (s) =>
  ({
    REQUESTED: 'awaiting broadcast',
    BROADCASTED: 'broadcast to nearby recyclers',
    ACCEPTED: 'accepted by a recycler',
    EN_ROUTE: 'on the way to you',
    ARRIVED: 'at your location',
    OTP_PENDING: 'ready for OTP handover',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
  }[s] || String(s || '').toLowerCase().replace(/_/g, ' '));

// Starter prompts shown before the user types anything (role-aware).
const starterSuggestions = (role) => {
  if (role === 'recycler') {
    return ['How do incoming requests work?', 'How does the OTP work?', 'How do collection drives work?'];
  }
  if (role === 'admin') {
    return ['How do collection drives work?', 'How does the OTP work?', 'What e-waste is accepted?'];
  }
  return ['How do I schedule a pickup?', 'What e-waste do you accept?', 'Pickup vs drop-off?', 'How do rewards work?'];
};

module.exports = { INTENTS, FALLBACK, starterSuggestions, prettyStatus };
