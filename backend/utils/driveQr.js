const crypto = require('crypto');

/**
 * Stateless drive check-in tokens. A token encodes (driveId, userId) with an
 * HMAC signature keyed by JWT_SECRET, so it can't be forged and needs no extra
 * storage. The token is what an attendee shows (as a QR) and an organizer scans
 * or enters to check them in.
 */
const secret = () => process.env.JWT_SECRET || 'ctr-dev-secret';

const sign = (driveId, userId) =>
  crypto.createHmac('sha256', secret()).update(`${driveId}:${userId}`).digest('hex').slice(0, 16);

const makeToken = (driveId, userId) => `CTRDRV.${driveId}.${userId}.${sign(driveId, userId)}`;

const verifyToken = (token) => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'CTRDRV') return null;
  const driveId = Number(parts[1]);
  const userId = Number(parts[2]);
  if (!Number.isInteger(driveId) || !Number.isInteger(userId)) return null;
  // Constant-time comparison of the signature.
  const expected = sign(driveId, userId);
  const a = Buffer.from(parts[3]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { driveId, userId };
};

module.exports = { makeToken, verifyToken };
