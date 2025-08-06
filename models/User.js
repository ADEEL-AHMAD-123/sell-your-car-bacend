// models/User.js
const mongoose = require('mongoose');

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
   // === Field to track the original number of checks ===
  // Reason: To correctly analyze the distribution of checks left in a multi-tier system.
  // Benefit: Gives admins a clearer picture of user segments and their usage patterns.
  originalChecks: {
    type: Number,
    default: 2,
  },

  firstLogin: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema);
