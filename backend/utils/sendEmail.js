const transporter = require("../config/email");
const {
  otpTemplate,
  verificationTemplate,
  resetPasswordTemplate,
  pickupRequestTemplate,
  pickupOtpTemplate,
  dropOffRequestTemplate,
  dropOffApprovedTemplate,
  dropOffOtpTemplate,
} = require("./emailTemplates");

const sendOTP = async ({ to, username, otp }) => {
  console.log("📧 sendOTP called — to:", to, "| otp:", otp);
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Your OTP Code",
    html: otpTemplate(otp, username),
  });
};

const sendVerificationEmail = async ({ to, username, verificationLink }) => {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Verify Your Email Address",
    html: verificationTemplate(verificationLink, username),
  });
};

const sendResetPasswordEmail = async ({ to, username, resetLink }) => {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Reset Your Password",
    html: resetPasswordTemplate(resetLink, username),
  });
};

// Notifies a recycler that a pickup request was broadcast to one of their
// stores. Best-effort: callers fire-and-forget so a mail failure never blocks
// the broadcast (the recycler can still see the request in their inbox).
const sendPickupRequestNotification = async ({ to, username, details }) => {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "New pickup request near you",
    html: pickupRequestTemplate(details, username),
  });
};

// Delivers the on-arrival OTP to the user; the recycler enters it to complete.
const sendPickupOTP = async ({ to, username, otp, context }) => {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Your pickup verification code",
    html: pickupOtpTemplate(otp, context || {}, username),
  });
};

// Notifies a store's recycler that a user requested a drop-off (best-effort).
const sendDropOffRequestNotification = async ({ to, username, details }) => {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "New drop-off request",
    html: dropOffRequestTemplate(details, username),
  });
};

// Booking confirmation to the user once the recycler approves (best-effort).
const sendDropOffApproved = async ({ to, username, details }) => {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Your drop-off is confirmed",
    html: dropOffApprovedTemplate(details, username),
  });
};

// Delivers the on-site OTP to the user; the recycler enters it to complete.
const sendDropOffOTP = async ({ to, username, otp, context }) => {
  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Your drop-off verification code",
    html: dropOffOtpTemplate(otp, context || {}, username),
  });
};

module.exports = {
  sendOTP,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendPickupRequestNotification,
  sendPickupOTP,
  sendDropOffRequestNotification,
  sendDropOffApproved,
  sendDropOffOTP,
};