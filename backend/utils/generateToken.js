const jwt = require('jsonwebtoken');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const generateOTP = (length = 6) => {
  const min = 10 ** (length - 1);
  const max = 9 * min;
  return Math.floor(min + Math.random() * max).toString();
};

module.exports = generateToken;
module.exports.generateToken = generateToken;
module.exports.generateOTP = generateOTP;
