const User = require("../models/User");
const sendPromoEmail = require("../utils/promoEmailService"); 
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const sendResponse = require("../utils/sendResponse");
const ErrorResponse = require("../utils/errorResponse");
const crypto = require('crypto');

/**
 * Sends a promotional email to all subscribed users.
 */
exports.sendPromotionalEmail = catchAsyncErrors(async (req, res, next) => {
  const { subject, body } = req.body;

  if (!subject || !body) {
    return next(new ErrorResponse("Subject and body are required.", 400));
  } 

  const users = await User.find({ "marketing.isSubscribed": true }).select("firstName lastName email");

  if (users.length === 0) {
    return sendResponse(res, 200, "No subscribed users found.");
  }

  const emailPromises = users.map(async (user) => {
    try {
      const unsubscribeToken = user.getUnsubscribeToken();
      await user.save({ validateBeforeSave: false });

      // The unsubscribe URL now uses a query parameter for the token.
      const unsubscribeURL = `${process.env.FRONTEND_URL}/unsubscribe?token=${unsubscribeToken}`;

      await sendPromoEmail({
        to: user.email,
        subject,
        templateName: "promotionalEmail",
        templateData: {
          user: { firstName: user.firstName, lastName: user.lastName },
          content: body,
          unsubscribeURL,
        },
      });
      console.log(`[PROMO EMAIL] Sent to ${user.email}`);
    } catch (err) {
      console.error(`[PROMO EMAIL ERROR] Failed to send to ${user.email}: ${err.message}`);
    }
  });

  await Promise.all(emailPromises);

  sendResponse(res, 200, "Promotional emails sent successfully to all subscribed users.");
});


/**
 * Unsubscribes a user from marketing emails.
 * This is a public endpoint and does not require authentication.
 */
exports.unsubscribe = catchAsyncErrors(async (req, res, next) => {

  console.log('Unsubscribe request received with query:', req.query);
  // Hash the token from the URL query to match the one in the database
  const { token } = req.query;
  
  if (!token) {
    return next(new ErrorResponse("Unsubscribe token is missing.", 400));
  }
  
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    "marketing.unsubscribeToken": hashedToken,
  });

  if (!user) {
    // If the token is invalid or expired, respond with an error.
    return next(new ErrorResponse("Invalid or expired unsubscribe token.", 404));
  }

  // Set the user's subscription status to false and clear the token
  user.marketing.isSubscribed = false;
  user.marketing.unsubscribeToken = undefined;
  await user.save({ validateBeforeSave: false });

  
  res.status(200).json({
    success: true,
    message: "You have been successfully unsubscribed from our marketing emails."
  });
});
