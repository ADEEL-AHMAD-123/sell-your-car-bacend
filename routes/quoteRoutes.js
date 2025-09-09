const express = require('express');
const router = express.Router();

const {
  getQuote,
  submitManualQuote,
  getPendingManualQuotes,
  reviewManualQuote,
  confirmQuoteWithCollection,
  markAsCollected,
  getAcceptedQuotes,
  rejectQuote,
  getCollectedQuotes,
  getPendingAutoQuotes,
  getRejectedQuotes,  
  deleteQuoteByAdmin
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

// Client rejects a reviewed quote offer
router.patch('/:id/reject', protect, rejectQuote);

// =================== ADMIN ROUTES ===================


// Delete a quote by ID
router.delete('/:id', protect, adminOnly, deleteQuoteByAdmin);

// Get all pending manual quote requests
router.get('/pending-manual', protect, adminOnly, getPendingManualQuotes);

// Get all pending auto quotes
router.get('/pending-auto', protect, adminOnly, getPendingAutoQuotes);

// Get all rejected quotes
router.get('/rejected', protect, adminOnly, getRejectedQuotes);

// Review manual quote (approve and assign offer)
router.patch('/review-manual/:id', protect, adminOnly, reviewManualQuote);

// Get All accepted quotes(manual and auto both)
router.get('/accepted', protect, adminOnly, getAcceptedQuotes);

// Get all collected quotes
router.get('/collected', protect, adminOnly, getCollectedQuotes);

// Mark collection as completed
router.patch('/collection-status/:id', protect, adminOnly, markAsCollected);


module.exports = router;
