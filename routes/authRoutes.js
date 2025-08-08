// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, login,logout } = require('../controllers/authController');

// @route   POST /api/auth/register
router.post('/register', register);

// @route   POST /api/auth/login
router.post('/login', login);

router.post('/logout', logout);

module.exports = router;
