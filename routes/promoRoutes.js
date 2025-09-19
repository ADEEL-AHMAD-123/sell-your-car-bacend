const express = require("express");
const router = express.Router();
const { sendPromotionalEmail, unsubscribe } = require("../controllers/promoController");
const { protect, adminOnly } = require("../middlewares/authMiddleware");

// Route for sending promotional emails
router.post("/sendPromotionalEmail", protect, adminOnly, sendPromotionalEmail);

// Route for unsubscribing from promotional emails via a GET request
router.get("/unsubscribe", unsubscribe);

module.exports = router;
