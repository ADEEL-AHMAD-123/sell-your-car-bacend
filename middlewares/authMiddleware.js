// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse'); // Make sure to import this

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware: Require login
const protect = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    // Pass the error to the errorHandler
    return next(new ErrorResponse('Not authenticated', 401));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new ErrorResponse('User not found', 401));
    }

    req.user = user;
    next();
  } catch (err) {
    // Pass the caught error to the errorHandler
    return next(new ErrorResponse('Invalid or expired token', 401));
  }
};

// Middleware: Admin only
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Admins only' });
  }
  next();
};

module.exports = { protect, adminOnly };