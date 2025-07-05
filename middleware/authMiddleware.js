// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check for token in Authorization header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password'); // exclude password

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user; // attach user to request
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is invalid or expired' });
  }
};

module.exports = requireAuth;
