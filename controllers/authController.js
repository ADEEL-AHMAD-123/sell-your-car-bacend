// authController.js file
const User = require('../models/User');
const Settings = require('../models/Settings');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const sendResponse = require('../utils/sendResponse');
const ErrorResponse = require('../utils/errorResponse');
const crypto = require('crypto');
const sendEmail = require('../utils/emailService');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
const FRONTEND_URL = process.env.FRONTEND_URL; 

// Helper function for cookie options
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // `secure` must be true in production to use `sameSite: 'None'`
    secure: isProduction,
    // Use `SameSite=None` for cross-origin requests in production,
    // and `SameSite=Lax` for local development.
    sameSite: isProduction ? 'None' : 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, 
  };
};

// -------------------- Register & Verification --------------------

/**
 * Handles user registration, creates a new user, and sends a verification email.
 * It uses the 'verificationEmail' template and passes the verification URL and user data.
 */
exports.register = catchAsyncErrors(async (req, res, next) => {
  const { firstName, lastName, email, password, phone } = req.body;

  if (!firstName || !lastName || !email || !password || !phone) {
    return next(new ErrorResponse('All fields are required.', 400));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('User already exists.', 400));
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const settings = await Settings.findOne() || await Settings.create({});
  const emailVerificationToken = crypto.randomBytes(20).toString('hex');

  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashedPassword,
    phone,
    checksLeft: settings.defaultChecks,
    originalChecks: settings.defaultChecks,
    'verificationToken.email': emailVerificationToken,
    'verificationToken.phone': 'temp-phone-token',
    'isVerified.email': false,
    'isVerified.phone': false,
  });
  

  const verificationURL = `${FRONTEND_URL}/verify-email/${emailVerificationToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Email Verification for SellYourCar',
      templateName: 'verificationEmail', 
      templateData: {
        verificationURL,
        user: { firstName: user.firstName, lastName: user.lastName }
      }
    });

    sendResponse(res, 201, 'User registered successfully. A verification email has been sent to your inbox.', {});
    
  } catch (err) {
    console.error(`[EMAIL ERROR] Email could not be sent: ${err.message}`);
    await User.deleteOne({ _id: user._id });
    return next(new ErrorResponse('Error sending verification email. Please try again.', 500));
  }
});


/**
 * Verifies a user's email using the token from the verification link.
 * If the token is invalid, it prompts the user to request a new one.
 */
exports.verifyEmail = catchAsyncErrors(async (req, res, next) => {
  const { token } = req.params;

  const user = await User.findOne({
    'verificationToken.email': token
  });
  
  // New: Check if the user is already verified before throwing a token error.
  if (!user) {
    // If the user is not found, we check if a user with that token (even if it's been cleared)
    // has a verified email. This prevents an error message when a user clicks the link twice.
    const alreadyVerifiedUser = await User.findOne({
      'isVerified.email': true,
      'verificationToken.email': null
    });
    if (alreadyVerifiedUser) {
        return sendResponse(res, 200, 'Your email is already verified. You can now log in.', {});
    }

    // If no user is found and the email is not already verified, the token is invalid.
    return next(new ErrorResponse('Invalid or expired verification token. Please request a new verification email.', 400));
  }

  user.isVerified.email = true;
  user.verificationToken.email = null;
  await user.save();
  
  sendResponse(res, 200, 'Email verified successfully. You can now log in.', {});
});

/**
 * Allows a user to request a new email verification link.
 */
exports.resendVerificationEmail = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return next(new ErrorResponse('No user found with that email address.', 404));
  }

  if (user.isVerified.email) {
    return next(new ErrorResponse('This email is already verified.', 400));
  }

  const emailVerificationToken = crypto.randomBytes(20).toString('hex');
  user.verificationToken.email = emailVerificationToken;
  await user.save({ validateBeforeSave: false });


  const verificationURL = `${FRONTEND_URL}/verify-email/${emailVerificationToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'New Email Verification Link for SellYourCar',
      templateName: 'verificationEmail',
      templateData: {
        verificationURL,
        user: { firstName: user.firstName, lastName: user.lastName }
      }
    });

    sendResponse(res, 200, 'A new verification email has been sent to your inbox.', {});
  } catch (err) {
    console.error(`[EMAIL ERROR] Email could not be sent: ${err.message}`);
    return next(new ErrorResponse('Error sending verification email. Please try again.', 500));
  }
});


// -------------------- Login --------------------

/**
 * Handles user login by checking credentials and email verification status.
 * Phone verification is not required for initial login.
 */
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
  
  // Only check for email verification. Phone verification is not a strict requirement for login.
  if (!user.isVerified.email) {
    return next(new ErrorResponse('Please verify your email address to log in.', 403));
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
      phone: user.phone,
      checksLeft: user.checksLeft,
      originalChecks: user.originalChecks,
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

// -------------------- Get Logged-in User --------------------
exports.getLoggedInUser = catchAsyncErrors(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) {
    return next(new ErrorResponse('User not found.', 404));
  }
  
  sendResponse(res, 200, 'User data fetched successfully.', { user });
});

// -------------------- Forgot Password --------------------

/**
 * Handles password reset requests and sends a reset link via email.
 * It uses the 'passwordReset' template and passes the reset URL and user data.
 */
exports.forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return next(new ErrorResponse('No user found with that email address.', 404));
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });


  const resetURL = `${FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Token',
      templateName: 'passwordReset', 
      templateData: {
        resetURL,
        user: { firstName: user.firstName, lastName: user.lastName }
      }
    });

    sendResponse(res, 200, 'Password reset email sent.', {});
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    console.error(`[EMAIL ERROR] Password reset email could not be sent: ${err.message}`);
    return next(new ErrorResponse('Error sending password reset email. Please try again later.', 500));
  }
});


// -------------------- Reset Password (from email link) --------------------

/**
 * Resets the user's password using a valid reset token.
 * Note: This function does not send an email itself; the updatePassword
 * function will send a security notification after the change.
 */
exports.resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;

  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired password reset token.', 400));
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendResponse(res, 200, 'Password updated successfully.', {});
});

// -------------------- Update Password (when logged in) --------------------

/**
 * Allows a logged-in user to change their password and sends a security notification email.
 * It uses the 'passwordChanged' template and passes the user's first and last name.
 */
exports.updatePassword = catchAsyncErrors(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found.', 404));
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return next(new ErrorResponse('Incorrect current password.', 401));
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  // Send a security notification email
  try {
    await sendEmail({
      to: user.email,
      subject: 'Your Password Has Been Changed',
      templateName: 'passwordChanged',
      templateData: {
        user: { firstName: user.firstName, lastName: user.lastName }
      }
    });
  } catch (err) {
    console.error(`[EMAIL ERROR] Password changed notification email could not be sent: ${err.message}`);
    // We don't block the user's password change if the email fails, we just log the error.
  }

  sendResponse(res, 200, 'Password updated successfully.', {});
});


// -------------------- Phone Verification --------------------

/**
 * Initiates the phone verification process by generating and sending an OTP.
 * This should be called by an authenticated user after logging in.
 * Note: You would need to integrate with an SMS service like Twilio here.
 */
exports.sendPhoneVerificationOTP = catchAsyncErrors(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found.', 404));
  }

  if (user.isVerified.phone) {
    return next(new ErrorResponse('Phone number is already verified.', 400));
  }
  
  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes from now

  user.verificationToken.phone = hashedOtp;
  user.verificationToken.phoneExpire = otpExpire;
  await user.save({ validateBeforeSave: false });

  // Here, you would integrate with your SMS service to send the OTP.
  // const message = `Your SellYourCar verification code is: ${otp}`;
  // await sendSMS(user.phone, message); // Placeholder for an SMS sending function

  console.log(`[PHONE VERIFICATION] OTP sent to ${user.phone}: ${otp}`);

  sendResponse(res, 200, 'Phone verification OTP has been sent.', {});
});

/**
 * Verifies the user's phone number with the OTP.
 */
exports.verifyPhone = catchAsyncErrors(async (req, res, next) => {
  const { otp } = req.body;
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found.', 404));
  }

  if (!user.verificationToken.phone || user.verificationToken.phoneExpire < Date.now()) {
    return next(new ErrorResponse('Invalid or expired OTP.', 400));
  }

  const isMatch = await bcrypt.compare(otp, user.verificationToken.phone);
  if (!isMatch) {
    return next(new ErrorResponse('Invalid or incorrect OTP.', 400));
  }

  user.isVerified.phone = true;
  user.verificationToken.phone = null;
  user.verificationToken.phoneExpire = null;
  await user.save();

  sendResponse(res, 200, 'Phone number verified successfully.', {});
});