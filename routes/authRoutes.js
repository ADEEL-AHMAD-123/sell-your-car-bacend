const express = require('express');
const router = express.Router();

const { 
  register, 
  login, 
  logout, 
  getLoggedInUser, 
  verifyEmail,       
  resendVerificationEmail,
  forgotPassword,    
  resetPassword,     
  updatePassword,
  sendPhoneVerificationOTP, 
  verifyPhone
} = require('../controllers/authController');

const { protect, adminOnly } = require('../middlewares/authMiddleware');

// @route   POST /api/auth/register
// Registers a new user and sends a verification email.
router.post('/register', register);

// @route   GET /api/auth/verifyemail/:token
// Verifies the user's email address using a token from the link.
router.get('/verifyemail/:token', verifyEmail);

// @route POST /api/auth/resendVerificationEmail
// Allows a user to request a new email verification link.
router.post('/resendVerificationEmail', resendVerificationEmail);

// @route   POST /api/auth/login
router.post('/login', login);

// @route   POST /api/auth/logout
// Logs out the currently authenticated user.
router.post('/logout', logout);

// @route   GET /api/auth/me
// Gets the profile of the currently logged-in user.
router.get('/me', protect, getLoggedInUser);

// @route   POST /api/auth/forgotpassword
// Sends a password reset email to the user.
router.post('/forgotpassword', forgotPassword);

// @route   PUT /api/auth/resetpassword/:token
// Resets the user's password using the token from the email.
router.put('/resetpassword/:token', resetPassword);

// @route   PUT /api/auth/updatepassword
// Allows a logged-in user to change their password.
router.put('/updatepassword', protect, updatePassword);

// @route POST /api/auth/sendPhoneVerificationOTP
// Sends a phone verification OTP to the user.
router.post('/sendPhoneVerificationOTP', protect, sendPhoneVerificationOTP);

// @route POST /api/auth/verifyPhone
// Verifies the user's phone number with the OTP.
router.post('/verifyPhone', protect, verifyPhone);

module.exports = router;
