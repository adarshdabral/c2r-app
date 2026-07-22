/**
 * Thin client for the private Hyperledger Fabric rewards ledger (channel1 /
 * chaincode "basic"). Every reward operation the platform performs — awarding
 * points on a completed recycle, reading a balance, fetching the on-chain audit
 * trail — goes through here.
 *
 * The ledger base URL + API key live only in the backend environment
 * (REWARDS_LEDGER_URL / REWARDS_LEDGER_API_KEY); they are NEVER shipped to the
 * mobile client. The URL is typically an ephemeral Cloudflare tunnel, so it is
 * config, not a constant — update the env when the tunnel rotates.
 *
 * Uses Node's global fetch + AbortController for a hard timeout so a slow or
 * unreachable ledger can never hang a request. Callers in the completion path
 * treat every ledger call as best-effort (see services/rewardsService.js).
 */
const logger = require('../utils/logger');

const BASE_URL = (process.env.REWARDS_LEDGER_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.REWARDS_LEDGER_API_KEY || '';
const TIMEOUT_MS = Number(process.env.REWARDS_LEDGER_TIMEOUT_MS) || 12000;

/** True only when both the URL and the key are configured. */
const isConfigured = () => Boolean(BASE_URL && API_KEY);

async function ledgerFetch(path, { method = 'GET', body } = {}) {
  if (!isConfigured()) {
    throw new Error('Rewards ledger is not configured (set REWARDS_LEDGER_URL and REWARDS_LEDGER_API_KEY)');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Ledger responded ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const getAccount = (id) => ledgerFetch(`/api/rewards/${encodeURIComponent(id)}`);
const createAccount = (id, owner, points = 0) =>
  ledgerFetch('/api/rewards', { method: 'POST', body: { id, owner, points } });
const give = (id, points) =>
  ledgerFetch(`/api/rewards/${encodeURIComponent(id)}/give`, { method: 'POST', body: { points } });
const redeem = (id, points) =>
  ledgerFetch(`/api/rewards/${encodeURIComponent(id)}/redeem`, { method: 'POST', body: { points } });
const getHistory = (id) => ledgerFetch(`/api/rewards/${encodeURIComponent(id)}/history`);

/**
 * Return the account, creating it (balance 0) if it doesn't exist yet. The
 * chaincode reports a missing asset as an HTTP 500 ("...does not exist") rather
 * than a 404, so any read miss is treated as "needs creating". If a concurrent
 * request already created it, the create fails ("already exists") and we re-read.
 */
async function ensureAccount(id, owner) {
  try {
    return await getAccount(id);
  } catch (readErr) {
    try {
      return await createAccount(id, owner, 0);
    } catch (createErr) {
      // Lost a create race (or transient) — fall back to a final read.
      logger.warn('ledger ensureAccount fell back to re-read', { id, error: createErr.message });
      return getAccount(id);
    }
  }
}

module.exports = {
  isConfigured,
  getAccount,
  createAccount,
  ensureAccount,
  give,
  redeem,
  getHistory,
};
