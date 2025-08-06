const User = require('../models/User');
const Settings = require('../models/Settings'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const sendResponse = require('../utils/sendResponse');
const ErrorResponse = require('../utils/errorResponse');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

// Cookie options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}); 

// -------------------- Register --------------------

exports.register = catchAsyncErrors(async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return next(new ErrorResponse('All fields are required.', 400));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('User already exists.', 400));
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Fetch the default checks from the settings model
  const settings = await Settings.findOne() || await Settings.create({});

  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashedPassword,
    checksLeft: settings.defaultChecks,       // Set initial checks from settings
    originalChecks: settings.defaultChecks,  // Record the original number of checks
  });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.cookie('token', token, getCookieOptions());

  console.log(`[REGISTER] New user registered: ${user.email}`);

  sendResponse(res, 201, 'User registered successfully', {
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      checksLeft: user.checksLeft,
      originalChecks: user.originalChecks, 
      firstLogin: user.firstLogin,
    },
  });
});


// -------------------- Login --------------------
exports.login = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse('Email and password are required.', 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new ErrorResponse('Invalid credentials.', 401));
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials.', 401));
  }

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.cookie('token', token, getCookieOptions());

  console.log(`[LOGIN] User logged in: ${user.email}`);

  sendResponse(res, 200, 'Login successful', {
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      checksLeft: user.checksLeft,
      originalChecks: user.originalChecks, // Include the new field in the response
      firstLogin: user.firstLogin,
      role: user.role,
    },

  });
  
});

// -------------------- Logout --------------------
exports.logout = (req, res) => {
  res.clearCookie('token');
  console.log('[LOGOUT] User logged out.');
  sendResponse(res, 200, 'Logged out successfully');
};
