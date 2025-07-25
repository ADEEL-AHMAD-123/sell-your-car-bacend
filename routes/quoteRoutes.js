// routes/quoteRoutes.js
const express = require('express');
const router = express.Router();
const { getQuote,submitManualQuote } = require('../controllers/quoteController');
const {protect} = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
router.post('/get', protect, getQuote);
router.post(
    '/manual-quote',
    protect,
    upload.array('images', 5), 
    submitManualQuote
  );

module.exports = router; 
