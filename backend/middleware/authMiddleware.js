const jwt = require('jsonwebtoken');

const getTokenFromCookie = (cookieHeader) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((part) => part.trim());
  const tokenPart = parts.find((part) => part.startsWith('token='));
  return tokenPart ? tokenPart.replace('token=', '') : null;
};

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
    const cookieToken = getTokenFromCookie(req.headers.cookie);
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: token missing' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
};

module.exports = { protect, requireRole };
