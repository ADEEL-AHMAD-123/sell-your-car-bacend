// /middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ErrorResponse = require("../utils/errorResponse");

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware: Require login
const protect = async (req, res, next) => {
  console.log("--- Inside protect middleware ---");
  console.log("Incoming headers:", req.headers);
  console.log("Parsed cookies:", req.cookies);

  let token; // 1. Check for token in cookies first

  if (req.cookies?.token) {
    token = req.cookies.token;
    console.log("Token found in cookies.");
  } // 2. If no cookie, check for token in the Authorization header

  if (
    !token &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
    console.log("Token found in Authorization header.");
  } // If still no token, send an error

  if (!token) {
    console.error("Error: Token not found in cookies or headers.");
    return next(new ErrorResponse("Not authenticated", 401));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.error("Error: User not found for decoded token ID.");
      return next(new ErrorResponse("User not found", 401));
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Error: Invalid or expired token.", err);
    return next(new ErrorResponse("Invalid or expired token", 401));
  }
};

// Middleware: Admin only
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied: Admins only" });
  }
  next();
};

module.exports = { protect, adminOnly };
