const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  regNumber: { type: String, required: true },
  data: { type: Object, required: true },
}, {
  timestamps: true,
});

quoteSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Quote', quoteSchema);
