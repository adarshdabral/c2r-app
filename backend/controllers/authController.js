const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const logger = require('../utils/logger');
const generateToken = require('../utils/generateToken');
const { sendOTP, sendResetPasswordEmail } = require('../utils/sendEmail');
const { generateOTP } = require('../utils/generateToken');
const {
  findUserByEmail,
  createUser,
  findUserById,
  updateUserProfile,
  updateUserOTP,
  verifyUserOTP,
  setResetToken,
  findUserByResetToken,
  updatePasswordByResetToken,
  getPasswordById,
  updatePasswordById
} = require('../models/userModel');
const { DEFAULT_USER_TYPE, isValidUserType } = require('../config/userTypes');

const register = async (req, res) => {
  try {
    const { name, email, password, role, user_type } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const userRole = role === 'recycler' ? 'recycler' : 'user';

    let userType = null;
    if (userRole === 'user') {
      if (user_type === undefined || user_type === null || user_type === '') {
        userType = DEFAULT_USER_TYPE;
      } else if (isValidUserType(user_type)) {
        userType = user_type;
      } else {
        return res.status(400).json({ message: 'Invalid user_type' });
      }
    }

    // Recyclers no longer carry a location on the user row — after verifying,
    // a recycler creates one or more Stores (each with its own coordinates)
    // via POST /api/stores.
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await createUser({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: userRole,
      userType,
      otp,
      otpExpiry
    });

    await sendOTP({ to: normalizedEmail, username: String(name).trim(), otp });
    logger.info('OTP email sent', { email: normalizedEmail });
    return res.status(201).json({ message: 'Registration successful. OTP sent to your email.' });

  } catch (error) {
    logger.error('[register]', error);
    return res.status(500).json({ message: 'Failed to register user' });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.is_verified) return res.status(400).json({ message: 'Email already verified' });
    if (user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date(user.otp_expiry) < new Date()) return res.status(400).json({ message: 'OTP expired. Request a new one.' });

    await verifyUserOTP(normalizedEmail); // clears otp, sets is_verified = true

    const token = generateToken(user.id, user.role);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      message: 'Email verified successfully',
      token,
      role: user.role,
      user_type: user.user_type ?? null,
      name: user.name
    });

  } catch (error) {
    console.error('[verifyOTP]', error);
    return res.status(500).json({ message: 'Failed to verify OTP' });
  }
};

const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.is_verified) return res.status(400).json({ message: 'Email already verified' });

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await updateUserOTP(normalizedEmail, otp, otpExpiry);
    await sendOTP({ to: normalizedEmail, username: user.name, otp });

    return res.status(200).json({ message: 'New OTP sent to your email' });

  } catch (error) {
    console.error('[resendOTP]', error);
    return res.status(500).json({ message: 'Failed to resend OTP' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Block unverified users
    if (!user.is_verified) {
      return res.status(403).json({ message: 'Please verify your email before logging in' });
    }

    // Block suspended accounts (admin action).
    if (user.is_suspended) {
      return res.status(403).json({ message: 'Your account has been suspended. Contact support.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.role);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.status(200).json({
      token,
      role: user.role,
      user_type: user.user_type ?? null,
      name: user.name
    });
  } catch (error) {
    console.error('[login]', error);
    return res.status(500).json({ message: 'Failed to login' });
  }
};

const getProfile = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized user context missing' });
    }

    const user = await findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      name: user.name,
      email: user.email,
      role: user.role,
      user_type: user.user_type ?? null
    });
  } catch (error) {
    console.error('[getProfile ERROR]', error);
    return res.status(500).json({ message: 'Failed to fetch profile' });
  }
};

const updateProfile = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized user context missing' });
    }
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'name and email are required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser && existingUser.id !== req.user.id) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    await updateUserProfile(req.user.id, {
      name: String(name).trim(),
      email: normalizedEmail
    });
    const updated = await findUserById(req.user.id);
    return res.status(200).json({
      name: updated.name,
      email: updated.email,
      role: updated.role,
      user_type: updated.user_type ?? null
    });
  } catch (error) {
    console.error('[updateProfile]', error);
    return res.status(500).json({ message: 'Failed to update profile' });
  }
};

// Step 1 of reset: email a single-use link. Always responds 200 regardless of
// whether the email exists, so the endpoint can't be used to enumerate accounts.
const forgotPassword = async (req, res) => {
  const genericMessage =
    'If an account exists for that email, a reset link has been sent.';
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);

    // Only verified, active accounts get a link — but never reveal which.
    if (user && user.is_verified && !user.is_suspended) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await setResetToken(normalizedEmail, token, tokenExpiry);

      const base = process.env.CORS_ORIGIN || 'http://localhost:3000';
      const resetLink = `${base}/reset-password?token=${token}`;
      try {
        await sendResetPasswordEmail({ to: normalizedEmail, username: user.name, resetLink });
        logger.info('password reset email sent', { email: normalizedEmail });
      } catch (mailErr) {
        logger.error('[forgotPassword] email send failed', mailErr);
      }
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    logger.error('[forgotPassword]', error);
    return res.status(500).json({ message: 'Failed to process request' });
  }
};

// Step 2 of reset: exchange a valid, unexpired token for a new password.
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await findUserByResetToken(token);
    if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await updatePasswordByResetToken(token, hashedPassword);

    return res.status(200).json({ message: 'Password updated. You can now sign in.' });
  } catch (error) {
    logger.error('[resetPassword]', error);
    return res.status(500).json({ message: 'Failed to reset password' });
  }
};

// Authenticated change-password: verify the current password before swapping.
const changePassword = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthorized user context missing' });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const currentHash = await getPasswordById(req.user.id);
    if (!currentHash) return res.status(404).json({ message: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, currentHash);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    const sameAsOld = await bcrypt.compare(newPassword, currentHash);
    if (sameAsOld) {
      return res.status(400).json({ message: 'New password must differ from the current one' });
    }

    await updatePasswordById(req.user.id, await bcrypt.hash(newPassword, 10));
    return res.status(200).json({ message: 'Password updated' });
  } catch (error) {
    logger.error('[changePassword]', error);
    return res.status(500).json({ message: 'Failed to change password' });
  }
};

const logout = async (req, res) => {
  res.clearCookie('token');
  return res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  changePassword,
  logout
};

