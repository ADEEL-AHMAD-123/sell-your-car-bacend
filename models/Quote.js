// models/Quote.js
const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Vehicle details (from DVLA)
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
  typeApproval: String,
  markedForExport: Boolean,
  artEndDate: String,
  taxDueDate: String,
  monthOfFirstRegistration: String,
  yearOfManufacture: String,
  dateOfLastV5CIssued: String,
  dvlaFetchedAt: Date,


  // Manual inputs from user
  images: [String],
  userEstimatedPrice: Number,
  userProvidedWeight: Number,
  message: String,
  manualQuoteReason: String,

  // Quote type
  type: {
    type: String,
    enum: ['auto', 'manual'],
    required: true,
    default: 'auto',
  },

  estimatedScrapPrice: Number,

  // Admin review
  adminOfferPrice: Number,
  adminMessage: String,
  isReviewedByAdmin: { type: Boolean, default: false },
  reviewedAt: Date,
  
  finalPrice: Number,
  

  rejectionReason: String,
  rejectedAt: Date,
  
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


  lastManualRequestAt: Date, 
}, {
  timestamps: true, 
});

// Prevent duplicate quotes per user/reg
quoteSchema.index(
  { regNumber: 1, userId: 1 },
  { unique: true, partialFilterExpression: { regNumber: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('Quote', quoteSchema);
