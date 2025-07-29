// routes/quoteRoutes.js
const express = require('express');
const router = express.Router();

const {
  getQuote,
  submitManualQuote,
  getPendingManualQuotes,
  reviewManualQuote,
  confirmQuoteWithCollection,
  markAsCollected,
  getAcceptedManualQuotes
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

// Client confirms quote by submitting collection details (decision + pickup info)
router.patch("/:id/confirm", protect, confirmQuoteWithCollection);


// =================== ADMIN ROUTES ===================

// Get all pending manual quote requests
router.get('/pending-manual', protect, adminOnly, getPendingManualQuotes);

// Review manual quote (approve and assign offer)
router.patch('/review-manual/:id', protect, adminOnly, reviewManualQuote);

// Get accepted manual quotes
router.get('/accepted-manual', protect, adminOnly, getAcceptedManualQuotes);

// Mark collection as completed
router.patch('/collection-status/:id', protect, adminOnly, markAsCollected);

module.exports = router;
