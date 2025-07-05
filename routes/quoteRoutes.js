// routes/quoteRoutes.js
const express = require('express');
const router = express.Router();
const { getQuote } = require('../controllers/quoteController');
const requireAuth = require('../middleware/authMiddleware');

router.post('/get', requireAuth, getQuote);

module.exports = router;
