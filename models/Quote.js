// models/Quote.js
const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Vehicle details
  regNumber: { type: String, required: true },
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

  // Manual quote specific
  condition: String,
  mileage: Number,
  postcode: String,
  images: [String],
  userEstimatedPrice: Number,
  message: String,

  // Quote type
  type: {
    type: String,
    enum: ['auto', 'manual'],
    required: true,
  },

  estimatedScrapPrice: Number,

  // Admin fields
  adminOfferPrice: Number,
  adminMessage: String,
  isReviewedByAdmin: { type: Boolean, default: false },
  reviewedAt: Date,

  clientDecision: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },

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

// Prevent duplicate quotes for same user & regNumber
quoteSchema.index(
  { regNumber: 1, userId: 1 },
  { unique: true, partialFilterExpression: { regNumber: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('Quote', quoteSchema);
