// models/Settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // The default number of DVLA checks new users receive
  defaultChecks: {
    type: Number,
    required: true,
    default: 10, 
  },
  
  // The base rate for calculating an auto quote
  scrapRatePerKg: {
    type: Number,
    required: true,
    default: 0.25, // Example scrap rate
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Settings', settingsSchema);
