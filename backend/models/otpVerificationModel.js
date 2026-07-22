const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { generateOTP } = require('../utils/generateToken');

/* ============================== CONFIG ============================== */
// Tunable via env (CLAUDE.md — no separate config service).
const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS) || 600; // 10 minutes
const MAX_OTP_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;

/* ============================== ENTITIES ============================== */
// The two request types that share this OTP layer. The table names come ONLY
// from this internal map (never user input), so interpolating them into SQL is
// safe. `recyclerCol` differs: pickups assign a recycler dynamically, drop-offs
// denormalise the store owner.
const ENTITIES = {
  pickup: { table: 'pickup_requests', recyclerCol: 'assigned_recycler_id' },
  dropoff: { table: 'dropoff_requests', recyclerCol: 'recycler_id' }
};

const getEntity = (type) => {
  const e = ENTITIES[type];
  if (!e) throw new Error(`Unknown OTP entity type: ${type}`);
  return e;
};

/* ============================== AUDIT LOG ============================== */
// Records one OTP attempt. Uses the provided connection so the log row commits
// atomically with the state change it describes (no orphaned/!missing entries).
const logAttempt = async (conn, { requestType, requestId, actor, actorUserId, target, result, attemptNo = 0 }) => {
  await conn.execute(
    `INSERT INTO otp_verification_log
      (request_type, request_id, actor, actor_user_id, target, result, attempt_no)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [requestType, requestId, actor, actorUserId ?? null, target, result, attemptNo]
  );
};

// Verification history for one request (newest first). For involved parties/admin.
const getHistory = async (requestType, requestId) => {
  getEntity(requestType); // validate type
  const [rows] = await db.query(
    `SELECT id, request_type, request_id, actor, actor_user_id, target, result, attempt_no, created_at
     FROM otp_verification_log
     WHERE request_type = ? AND request_id = ?
     ORDER BY created_at DESC, id DESC`,
    [requestType, requestId]
  );
  return rows.map((r) => ({
    id: r.id,
    requestType: r.request_type,
    requestId: r.request_id,
    actor: r.actor,
    actorUserId: r.actor_user_id,
    target: r.target,
    result: r.result,
    attemptNo: r.attempt_no,
    createdAt: r.created_at
  }));
};

/* ============================== GENERATION ============================== */
/**
 * Generates a fresh pair of OTPs for a request and arms the verification window:
 * resets the attempt counter and both "verified" flags, and sets otp_expiry to
 * now + TTL (computed in SQL so it is immune to app/DB timezone skew). Caller is
 * responsible for the surrounding status transition (-> OTP_PENDING).
 *
 * @returns {{ otpUser, otpRecycler, ttlSeconds }} otpUser is emailed to the
 *   user; otpRecycler is shown to the recycler (each side relays its code to the
 *   other, who enters it).
 */
const armVerification = async (conn, requestType, requestId) => {
  getEntity(requestType);
  const otpUser = generateOTP();
  const otpRecycler = generateOTP();
  await conn.execute(
    `UPDATE ${getEntity(requestType).table}
       SET otp_user = ?, otp_recycler = ?,
           otp_expiry = DATE_ADD(NOW(), INTERVAL ? SECOND),
           otp_attempts = 0, user_otp_verified = 0, recycler_otp_verified = 0
     WHERE id = ?`,
    [otpUser, otpRecycler, OTP_TTL_SECONDS, requestId]
  );
  return { otpUser, otpRecycler, ttlSeconds: OTP_TTL_SECONDS };
};

/* ============================== VERIFICATION ============================== */
/**
 * Verifies one side of the mutual OTP handshake, atomically.
 *
 *   actor 'recycler' -> submits the USER's OTP  (target user_otp)
 *   actor 'user'     -> submits the RECYCLER's OTP (target recycler_otp)
 *
 * Enforces the full security layer under a row lock: ownership, status must be
 * OTP_PENDING, expiry, and the shared retry limit. Every attempt is audited.
 * Completion is two-sided: the request only transitions to COMPLETED once BOTH
 * flags are set, which is what prevents one-sided completion (fraud).
 *
 * @returns {{ completed, userOtpVerified, recyclerOtpVerified }}
 * @throws  ApiError on not-found/forbidden/wrong-status/expired/locked/incorrect
 */
const verifyOtp = async ({ requestType, requestId, actor, actorUserId, code }) => {
  const entity = getEntity(requestType);
  const isRecycler = actor === 'recycler';
  const target = isRecycler ? 'user_otp' : 'recycler_otp';

  const conn = await db.getConnection();
  let committed = false;
  // Some validation failures still need their audit row persisted (EXPIRED,
  // LOCKED, FAIL). For those we commit and stash the error to throw after the
  // connection is released — so the catch never rolls back a committed audit.
  let deferredError = null;
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT *, (otp_expiry IS NOT NULL AND otp_expiry < NOW()) AS expired
       FROM ${entity.table} WHERE id = ? FOR UPDATE`,
      [requestId]
    );
    const row = rows[0];
    if (!row) throw ApiError.notFound('Request not found');

    // Ownership: only the assigned recycler / owning user may submit.
    const ownerId = isRecycler ? row[entity.recyclerCol] : row.user_id;
    if (ownerId !== actorUserId) {
      throw ApiError.forbidden('You are not a party to this request');
    }

    if (row.status !== 'OTP_PENDING') {
      throw ApiError.badRequest('This request is not awaiting OTP verification');
    }

    // Expiry — does not consume an attempt; the recycler must re-arm.
    if (row.expired) {
      await logAttempt(conn, { requestType, requestId, actor, actorUserId, target, result: 'EXPIRED', attemptNo: row.otp_attempts });
      deferredError = ApiError.badRequest('OTP has expired. Ask the recycler to resend a new code.');
    } else if (row.otp_attempts >= MAX_OTP_ATTEMPTS) {
      // Retry limit (shared counter across both sides).
      await logAttempt(conn, { requestType, requestId, actor, actorUserId, target, result: 'LOCKED', attemptNo: row.otp_attempts });
      deferredError = new ApiError(429, 'Too many incorrect attempts. Ask the recycler to resend a new code.');
    } else {
      const expected = isRecycler ? row.otp_user : row.otp_recycler;
      const submitted = String(code || '').trim();

      if (!submitted || submitted !== expected) {
        // Wrong code: consume an attempt, audit FAIL/LOCKED, surface remaining.
        const attemptNo = row.otp_attempts + 1;
        await conn.execute(`UPDATE ${entity.table} SET otp_attempts = ? WHERE id = ?`, [attemptNo, requestId]);
        const locked = attemptNo >= MAX_OTP_ATTEMPTS;
        await logAttempt(conn, { requestType, requestId, actor, actorUserId, target, result: locked ? 'LOCKED' : 'FAIL', attemptNo });
        const remaining = Math.max(0, MAX_OTP_ATTEMPTS - attemptNo);
        deferredError = ApiError.badRequest(
          locked
            ? 'Incorrect OTP. Verification locked — ask the recycler to resend a new code.'
            : `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        );
      } else {
        // Correct code: set this side's flag.
        const flagCol = isRecycler ? 'user_otp_verified' : 'recycler_otp_verified';
        await conn.execute(`UPDATE ${entity.table} SET ${flagCol} = 1 WHERE id = ?`, [requestId]);
        await logAttempt(conn, { requestType, requestId, actor, actorUserId, target, result: 'SUCCESS', attemptNo: row.otp_attempts });

        const userOtpVerified = isRecycler ? true : Boolean(row.user_otp_verified);
        const recyclerOtpVerified = isRecycler ? Boolean(row.recycler_otp_verified) : true;
        const completed = userOtpVerified && recyclerOtpVerified;

        // Two-sided completion: only when BOTH codes have been verified.
        if (completed) {
          await conn.execute(
            `UPDATE ${entity.table}
               SET status = 'COMPLETED', completion_timestamp = NOW(),
                   otp_user = NULL, otp_recycler = NULL
             WHERE id = ?`,
            [requestId]
          );
        }
        await conn.commit();
        committed = true;
        return { completed, userOtpVerified, recyclerOtpVerified };
      }
    }

    await conn.commit();
    committed = true;
    throw deferredError;
  } catch (err) {
    if (!committed) await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  OTP_TTL_SECONDS,
  MAX_OTP_ATTEMPTS,
  ENTITIES,
  armVerification,
  verifyOtp,
  logAttempt,
  getHistory
};
