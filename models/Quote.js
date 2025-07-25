const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Basic details (used for both manual & auto)
  regNumber: { type: String },
  make: String,
  model: String,
  year: String,
  fuelType: String,
  colour: String,
  wheelPlan: String,
  engineCapacity: String,
  revenueWeight: Number,
  co2Emissions: Number,
  taxStatus: String,
  motStatus: String,
  euroStatus: String,
  realDrivingEmissions: String,

  // For image uploads (manual only)
  images: [String],

  // Type of quote: 'auto' | 'manual'
  type: {
    type: String,
    enum: ['auto', 'manual'],
    required: true,
  },

  // Calculated or user-provided
  estimatedScrapPrice: Number,
  userEstimatedPrice: Number, // only for manual
  message: String, // for manual

  // Admin offer
  adminOfferPrice: Number,
  adminMessage: String,
  adminReviewed: { type: Boolean, default: false },

  // Client decision
  clientDecision: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },

  // Collection details if accepted
  collectionDetails: {
    pickupDate: Date,
    contactNumber: String,
    address: String,
    collected: { type: Boolean, default: false },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Quote', quoteSchema);
