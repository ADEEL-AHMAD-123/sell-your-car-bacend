// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, login,logout,getLoggedInUser } = require('../controllers/authController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');
// @route   POST /api/auth/register
router.post('/register', register);

// @route   POST /api/auth/login
router.post('/login', login);

router.get('/me', protect,getLoggedInUser);

router.post('/logout', logout);


module.exports = router;
