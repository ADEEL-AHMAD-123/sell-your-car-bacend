const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  searchUsers,
  getPaginatedUsers,
  updateUser,
  deleteUser,
  getUserQuotes,
  getAdminStats,
  getDailyQuoteAnalytics,
  getPendingManualQuotes,
  reviewManualQuote
} = require('../controllers/adminController');

const { protect, adminOnly } = require('../middlewares/authMiddleware');

// Protect all routes & restrict to admin
router.use(protect, adminOnly);

// Users
router.get('/users', getAllUsers);
router.get('/users/search', searchUsers);
router.get('/users/paginated', getPaginatedUsers);
router.put('/user/:id', updateUser);
router.delete('/user/:id', deleteUser);

// Quotes
router.get('/quotes/:userId', getUserQuotes);

// Manual Quotes (Admin)
router.get('/manual-quotes/pending', getPendingManualQuotes);
router.put('/manual-quotes/review/:id', reviewManualQuote);

// Analytics
router.get('/stats', getAdminStats);
router.get('/analytics/daily-quotes', getDailyQuoteAnalytics);

module.exports = router;
