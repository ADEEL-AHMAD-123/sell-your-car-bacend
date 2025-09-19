// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  checksLeft: {
    type: Number,
    default: 2,
  },
  originalChecks: {
    type: Number,
    default: 2,
  },
  firstLogin: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    email: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: Boolean,
      default: false,
    },
  },
  verificationToken: {
    email: String,
    phone: String,
  },
  // New field for marketing communication
  marketing: {
    isSubscribed: {
      type: Boolean,
      default: true,
    },
    unsubscribeToken: String,
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, {
  timestamps: true,
});

// Method to generate a password reset token
userSchema.methods.getResetPasswordToken = function() {
  // Generate a random token
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Hash the token and set it to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Set the expire time (e.g., 10 minutes from now)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  
  return resetToken;
};

// Add a new method to generate a marketing unsubscribe token
userSchema.methods.getUnsubscribeToken = function() {
  const unsubscribeToken = crypto.randomBytes(20).toString('hex');
  this.marketing.unsubscribeToken = crypto
    .createHash('sha256')
    .update(unsubscribeToken)
    .digest('hex');
  return unsubscribeToken;
};

module.exports = mongoose.model('User', userSchema);