// File: models/Quote.js
const mongoose = require('mongoose');

// Define a schema for the nested 'VehicleRegistration' object
// This ensures all sub-fields from the API are stored as requested.
const VehicleRegistrationSchema = new mongoose.Schema({
  DateOfLastUpdate: { type: Date },
  Colour: { type: String },
  VehicleClass: { type: String },
  CertificateOfDestructionIssued: { type: Boolean },
  EngineNumber: { type: String },
  EngineCapacity: { type: String },
  TransmissionCode: { type: String },
  Exported: { type: Boolean },
  YearOfManufacture: { type: String },
  WheelPlan: { type: String },
  DateExported: { type: Date },
  Scrapped: { type: Boolean }, // Kept for business logic and validation
  Transmission: { type: String },
  DateFirstRegisteredUk: { type: Date },
  Model: { type: String }, // Kept for flexible searching and display
  GearCount: { type: Number },
  ImportNonEu: { type: Boolean },
  PreviousVrmGb: { type: String },
  GrossWeight: { type: Number },
  DoorPlanLiteral: { type: String },
  MvrisModelCode: { type: String },
  Vin: { type: String },
  Vrm: { type: String },
  DateFirstRegistered: { type: Date },
  DateScrapped: { type: Date }, // Kept for business logic and validation
  DoorPlan: { type: String },
  YearMonthFirstRegistered: { type: String },
  VinLast5: { type: String },
  VehicleUsedBeforeFirstRegistration: { type: Boolean },
  MaxPermissibleMass: { type: Number },
  Make: { type: String }, // Kept for flexible searching and display
  MakeModel: { type: String }, // Kept for display
  TransmissionType: { type: String },
  SeatingCapacity: { type: Number },
  FuelType: { type: String },
  Co2Emissions: { type: Number },
  Imported: { type: Boolean },
  MvrisMakeCode: { type: String },
  PreviousVrmNi: { type: String },
  VinConfirmationFlag: { type: String },
});

// Define a schema for other essential vehicle data, simplified and grouped
const OtherVehicleDataSchema = new mongoose.Schema({
  KerbWeight: { type: Number }, // Essential for pricing
  BodyStyle: { type: String }, 
  EuroStatus: { type: String },
  NumberOfDoors: { type: Number },
  NumberOfAxles: { type: Number },
});

// Main Quote Schema with all business logic fields and nested data
const quoteSchema = new mongoose.Schema({
  // Required identifier fields
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  regNumber: {
    type: String,
    required: true,
  },
  
  // Quote type and price fields
  type: {
    type: String,
    enum: ['auto', 'manual'],
    required: true,
    default: 'auto',
  },
  estimatedScrapPrice: { type: Number }, // Auto-generated price
  finalPrice: { type: Number }, // The final price for an accepted quote
  
  // Manual inputs from user for manual quote requests
  manualDetails: {
    images: [{ type: String }],
    userEstimatedPrice: { type: Number },
    userProvidedWeight: { type: Number },
    message: { type: String },
    manualQuoteReason: { type: String },
    lastManualRequestAt: { type: Date },
  },

  // Admin review fields
  adminOfferPrice: { type: Number },
  adminMessage: { type: String },
  isReviewedByAdmin: { type: Boolean, default: false },
  reviewedAt: { type: Date },
  
  // Decision and rejection fields
  clientDecision: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
  rejectionReason: { type: String },
  rejectedAt: { type: Date },
  acceptedAt: { type: Date }, 
  
  // Collection fields
  collectionDetails: {
    pickupDate: { type: Date },
    contactNumber: { type: String },
    address: { type: String },
    collected: { type: Boolean, default: false },
  },

  // Vehicle data from the API response
  vehicleRegistration: VehicleRegistrationSchema,
  otherVehicleData: OtherVehicleDataSchema,

}, {
  timestamps: true,
});

// --- Mongoose Indexes for improved query performance ---
// Index on userId for fast lookup of a user's quotes
quoteSchema.index({ userId: 1 });

// Index on regNumber for fast lookup by vehicle
quoteSchema.index({ regNumber: 1 });

// Compound index for the most common query: finding a specific quote for a specific user
quoteSchema.index({ userId: 1, regNumber: 1 });

// Index on clientDecision to quickly filter quotes by status
quoteSchema.index({ clientDecision: 1 });

// Index on type to quickly filter between auto and manual quotes
quoteSchema.index({ type: 1 });

const Quote = mongoose.model('Quote', quoteSchema);
module.exports = Quote;