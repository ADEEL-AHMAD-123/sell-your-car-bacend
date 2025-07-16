// routes/quoteRoutes.js
const express = require('express');
const router = express.Router();
const { getQuote } = require('../controllers/quoteController');
const requireAuth = require('../middlewares/authMiddleware');

router.post('/get', requireAuth, getQuote);

module.exports = router;
