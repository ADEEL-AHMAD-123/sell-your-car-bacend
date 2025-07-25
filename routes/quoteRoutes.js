// routes/quoteRoutes.js
const express = require('express');
const router = express.Router();

const {
  getQuote,
  submitManualQuote,
  getPendingManualQuotes,
  reviewManualQuote,
  updateClientDecision,
  submitCollectionDetails,
  markAsCollected,
} = require('../controllers/quoteController');

const { protect, adminOnly } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');

// =================== USER ROUTES ===================

// Get auto quote using registration Number
router.post('/get', protect, getQuote);

// Submit manual quote request with images
router.post(
  '/manual-quote',
  protect,
  upload.array('images', 5),
  submitManualQuote
);

// Accept or reject quote
router.patch('/client-decision/:id', protect, updateClientDecision);

// Submit collection details after accepting quote
router.patch('/collection-details/:id', protect, submitCollectionDetails);

// =================== ADMIN ROUTES ===================

// Get all pending manual quote requests
router.get('/pending-manual', protect, adminOnly, getPendingManualQuotes);

// Review manual quote (approve and assign offer)
router.patch('/review-manual/:id', protect, adminOnly, reviewManualQuote);

// Mark collection as completed
router.patch('/collection-status/:id', protect, adminOnly, markAsCollected);

module.exports = router;
