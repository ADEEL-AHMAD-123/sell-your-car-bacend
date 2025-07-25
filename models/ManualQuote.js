const mongoose = require("mongoose");

const manualQuoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    regNumber: { type: String, default: "MANUAL" },
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    fuelType: { type: String, required: true },
    colour: { type: String },
    weight: { type: Number },
    wheelPlan: { type: String },
    userEstimatedPrice: { type: Number },
    estimatedScrapPrice: { type: Number },
    images: [String],
    message: { type: String },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminNotes: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ManualQuote", manualQuoteSchema);
