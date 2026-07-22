const otpTemplate = (otp, username = "User") => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Your OTP Code</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#333;">Hello, ${username}!</h2>
          <p style="color:#555;font-size:15px;">Use the OTP below. Valid for <strong>10 minutes</strong>.</p>
          <div style="text-align:center;margin:32px 0;">
            <span style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#4f46e5;">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;">If you didn't request this, ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const verificationTemplate = (verificationLink, username = "User") => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Verify Your Email</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#333;">Welcome, ${username}!</h2>
          <p style="color:#555;font-size:15px;">Please verify your email address.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${verificationLink}" style="background:#4f46e5;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
              Verify Email
            </a>
          </div>
          <p style="color:#888;font-size:13px;">Expires in <strong>24 hours</strong>.</p>
          <p style="color:#aaa;font-size:12px;word-break:break-all;">Or copy: ${verificationLink}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const resetPasswordTemplate = (resetLink, username = "User") => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Reset Your Password</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#333;">Password Reset Request</h2>
          <p style="color:#555;font-size:15px;">Hi ${username}, click below to reset your password.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${resetLink}" style="background:#dc2626;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
              Reset Password
            </a>
          </div>
          <p style="color:#888;font-size:13px;">Expires in <strong>1 hour</strong>.</p>
          <p style="color:#aaa;font-size:12px;word-break:break-all;">Or copy: ${resetLink}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const pickupRequestTemplate = (
  { storeName, wasteCategory, wasteQuantity, pickupAddress, distanceKm, expiresInMinutes },
  username = "Recycler"
) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>New Pickup Request</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#333;">New pickup request nearby</h2>
          <p style="color:#555;font-size:15px;">Hi ${username}, a new pickup has been broadcast to <strong>${storeName}</strong>. First to accept wins.</p>
          <table style="width:100%;margin:20px 0;font-size:14px;color:#444;">
            <tr><td style="padding:6px 0;color:#888;">Waste</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${wasteCategory} · ${wasteQuantity} kg</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Pickup address</td><td style="padding:6px 0;text-align:right;">${pickupAddress}</td></tr>
            ${distanceKm != null ? `<tr><td style="padding:6px 0;color:#888;">Distance</td><td style="padding:6px 0;text-align:right;">${distanceKm} km</td></tr>` : ""}
          </table>
          <p style="color:#888;font-size:13px;">Respond within <strong>${expiresInMinutes} minutes</strong> — otherwise it goes to the next nearest store.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const pickupOtpTemplate = (otp, { storeName, recyclerName } = {}, username = "User") => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Pickup Verification Code</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#333;">Your pickup is here</h2>
          <p style="color:#555;font-size:15px;">Hi ${username}, ${recyclerName ? `<strong>${recyclerName}</strong>` : "your recycler"}${storeName ? ` from <strong>${storeName}</strong>` : ""} has arrived. Share this code to confirm the pickup:</p>
          <div style="text-align:center;margin:32px 0;">
            <span style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#16a34a;">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;">Only share this code once you've handed over your recycling.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const dropOffRequestTemplate = (
  { userName, wasteCategory, wasteQuantity, scheduledDate, timeSlot, storeName },
  recyclerName = "Recycler"
) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>New Drop-off Request</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#333;">New drop-off request</h2>
          <p style="color:#555;font-size:15px;">Hi ${recyclerName}, ${userName || "a customer"} would like to drop off recycling at <strong>${storeName}</strong>. Approve it to confirm the slot.</p>
          <table style="width:100%;margin:20px 0;font-size:14px;color:#444;">
            <tr><td style="padding:6px 0;color:#888;">Waste</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${wasteCategory} · ${wasteQuantity} kg</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Date</td><td style="padding:6px 0;text-align:right;">${scheduledDate}</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Time slot</td><td style="padding:6px 0;text-align:right;">${timeSlot}</td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const dropOffApprovedTemplate = (
  { storeName, wasteCategory, wasteQuantity, scheduledDate, timeSlot },
  username = "User"
) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Drop-off Confirmed</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#16a34a;">Your drop-off is confirmed</h2>
          <p style="color:#555;font-size:15px;">Hi ${username}, <strong>${storeName}</strong> has approved your drop-off. Here are your booking details:</p>
          <table style="width:100%;margin:20px 0;font-size:14px;color:#444;">
            <tr><td style="padding:6px 0;color:#888;">Waste</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${wasteCategory} · ${wasteQuantity} kg</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Date</td><td style="padding:6px 0;text-align:right;">${scheduledDate}</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Time slot</td><td style="padding:6px 0;text-align:right;">${timeSlot}</td></tr>
          </table>
          <p style="color:#888;font-size:13px;">Bring your recycling to the store during your slot. You'll get a code to confirm the handover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const dropOffOtpTemplate = (otp, { storeName } = {}, username = "User") => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Drop-off Verification Code</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td>
          <h2 style="color:#333;">Confirm your drop-off</h2>
          <p style="color:#555;font-size:15px;">Hi ${username}, share this code with the staff${storeName ? ` at <strong>${storeName}</strong>` : ""} to confirm your drop-off:</p>
          <div style="text-align:center;margin:32px 0;">
            <span style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#16a34a;">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;">Only share this code once you've handed over your recycling.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

module.exports = {
  otpTemplate,
  verificationTemplate,
  resetPasswordTemplate,
  pickupRequestTemplate,
  pickupOtpTemplate,
  dropOffRequestTemplate,
  dropOffApprovedTemplate,
  dropOffOtpTemplate
};