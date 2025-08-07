const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser, 
  updateUser,
  deleteUser,
  getAnalyticsOverview,
  getSettings,
  updateSettings,
  refillUserChecks,
  searchQuotesByAdmin
} = require('../controllers/adminController');

const { protect, adminOnly } = require('../middlewares/authMiddleware');

// Protect all routes & restrict to admin
router.use(protect, adminOnly);

// Users
router.get('/users', getUsers);
router.get('/users/:id', getUser); 
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/refill-checks', refillUserChecks);
// Analytics
router.get('/analytics/overview', getAnalyticsOverview);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

router.get('/quotes/search', searchQuotesByAdmin); 


module.exports = router;
