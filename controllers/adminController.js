// controllers/adminController.js
const User = require("../models/User");
const Quote = require("../models/Quote");
const sendResponse = require("../utils/sendResponse");
const ErrorResponse = require("../utils/errorResponse");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const Settings = require('../models/Settings');
const mongoose =require("mongoose");

/**
 * @desc    Get all users (for admin view) with pagination, filtering, searching, and sorting
 * @route   GET /api/admin/users
 * @access  Admin
 * @param   {object} req.query - Query parameters for filtering, pagination, search, and sort
 * - page: Current page number (default: 1)
 * - limit: Number of users per page (default: 10)
 * - sort: Field to sort by (e.g., 'createdAt', 'email', 'lastName')
 * - order: Sort order ('asc' or 'desc', default: 'desc')
 * - nameSearch: Search term for firstName or lastName
 * - emailSearch: Search term for email
 * - role: Filter by user role ('user' or 'admin')
 * @returns {object} Paginated list of users and metadata
 */
exports.getUsers = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const sortField = req.query.sort || 'createdAt';
  const sortOrder = req.query.order === 'asc' ? 1 : -1; // 1 for ascending, -1 for descending

  // === UPDATED: Separate search parameters ===
  const nameSearch = req.query.nameSearch;
  const emailSearch = req.query.emailSearch;
  const roleFilter = req.query.role;

  let query = {};
  let searchConditions = [];

  // === NEW: Handle name search (firstName, lastName) ===
  if (nameSearch) {
    // Split the search query into individual words
    const nameKeywords = nameSearch.trim().split(/\s+/).filter(Boolean);

    if (nameKeywords.length > 0) {
      // Create an $or condition for each keyword to match in firstName or lastName
      const keywordConditions = nameKeywords.map(keyword => {
        const regex = new RegExp(keyword, 'i');
        return {
          $or: [
            { firstName: regex },
            { lastName: regex }
          ]
        };
      });
      // Combine all keyword conditions with $and, so all keywords must match somewhere
      searchConditions.push({ $and: keywordConditions });
    }
  }

  // === NEW: Handle email search with validation ===
  if (emailSearch) {
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(emailSearch)) {
      // Return 400 Bad Request if email format is invalid
      return next(new ErrorResponse("Invalid email format for search.", 400));
    }
    searchConditions.push({ email: new RegExp(emailSearch, 'i') });
  }

  // Combine all search conditions with $and if multiple are present
  if (searchConditions.length > 0) {
    query.$and = searchConditions;
  }

  // Build role filter
  if (roleFilter && ['user', 'admin'].includes(roleFilter.toLowerCase())) {
    query.role = roleFilter.toLowerCase();
  }

  // Get total count of users matching the query (for pagination metadata)
  const totalUsers = await User.countDocuments(query);

  // Fetch users with pagination, sorting, and filtering
  const users = await User.find(query)
    .select('-password') // Exclude passwords for security
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit);

  sendResponse(res, 200, "Users fetched successfully.", {
    users,
    currentPage: page,
    totalPages: Math.ceil(totalUsers / limit),
    totalUsers,
    limit,
  });
});

/**
 * @desc    Get a single user by ID (for admin view)
 * @route   GET /api/admin/users/:id
 * @access  Admin
 * @returns {object} The user document
 */
exports.getUser = catchAsyncErrors(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) {
    return next(new ErrorResponse(`User not found with id: ${req.params.id}`, 404));
  }
  sendResponse(res, 200, "User fetched successfully.", { user });
});

/**
 * @desc    Update a user's details (admin only)
 * @route   PUT /api/admin/users/:id
 * @access  Admin
 * @param   {object} req.body - Fields to update (firstName, lastName, role)
 * @returns {object} The updated user document
 */
exports.updateUser = catchAsyncErrors(async (req, res, next) => {
  // Only destructure firstName, lastName, and role for this endpoint
  const { firstName, lastName, role, ...otherFields } = req.body; // otherFields will capture any unexpected fields
  const userId = req.params.id;

  const user = await User.findById(userId);

  if (!user) {
    return next(new ErrorResponse(`User not found with id: ${userId}`, 404));
  }

  const updateFields = {};

  // Handle firstName update
  if (firstName !== undefined) {
    updateFields.firstName = firstName;
  }
  // Handle lastName update
  if (lastName !== undefined) {
    updateFields.lastName = lastName;
  }
  // Handle role update
  if (role !== undefined) {
    updateFields.role = role;
  }

  // Ensure there's at least one field to update
  if (Object.keys(updateFields).length === 0) {
    return next(new ErrorResponse("No valid fields provided for update.", 400));
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: updateFields },
    { new: true, runValidators: true }
  ).select('-password');

  if (!updatedUser) {
    return next(new ErrorResponse(`User not found with id: ${userId}`, 404));
  }

  sendResponse(res, 200, "User updated successfully.", { user: updatedUser });
});

/**
 * @desc    Refill a user's checksLeft by a specified amount, capped by originalChecks (admin only)
 * @route   PATCH /api/admin/users/:id/refill-checks
 * @access  Admin
 * @param   {object} req.body - Contains the 'refillAmount' (number of checks to add)
 * @returns {object} The updated user document
 */
exports.refillUserChecks = catchAsyncErrors(async (req, res, next) => {
  const userId = req.params.id;
  const { refillAmount } = req.body;



  // Validate refillAmount
  if (refillAmount === undefined || isNaN(refillAmount) || refillAmount < 0 || !Number.isInteger(Number(refillAmount))) {
    return next(new ErrorResponse("Refill amount must be a non-negative integer.", 400));
  }

  const user = await User.findById(userId);

  if (!user) {
    return next(new ErrorResponse(`User not found with id: ${userId}`, 404));
  }

  // Calculate the new checksLeft, ensuring it doesn't exceed originalChecks
  let newChecksLeft = user.checksLeft + Number(refillAmount);
  if (newChecksLeft > user.originalChecks) {
    newChecksLeft = user.originalChecks; // Cap at originalChecks
  }

  user.checksLeft = newChecksLeft;

  
  await user.save({ validateBeforeSave: false }); // Skip validation for faster update

  sendResponse(res, 200, "User checks refilled successfully.", { user });
});



/**
 * @desc    Delete a user (admin only)
 * @route   DELETE /api/admin/users/:id
 * @access  Admin
 * @returns {object} Success message
 */
exports.deleteUser = catchAsyncErrors(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    return next(new ErrorResponse(`User not found with id: ${req.params.id}`, 404));
  }
  sendResponse(res, 200, "User deleted successfully.", null);
});




// @desc    Get overall statistics and analytics (admin only)
// @route   GET /api/admin/analytics/overview
// @access  Admin
exports.getAnalyticsOverview = catchAsyncErrors(async (req, res, next) => {
  // Use aggregation to calculate multiple stats efficiently
  const analyticsData = await Quote.aggregate([
    {
      $facet: {
        totalQuotes: [{ $count: "count" }],
        quoteCountsByType: [
          { $group: { _id: "$type", count: { $sum: 1 } } },
        ],
        quoteCountsByDecision: [
          { $group: { _id: "$clientDecision", count: { $sum: 1 } } },
        ],
        quotesAccepted: [
          { $match: { clientDecision: "accepted" } },
          { $count: "count" },
        ],
        quotesCollected: [
          { $match: { clientDecision: "accepted", "collectionDetails.collected": true } },
          { $count: "count" },
        ],
        quotesAcceptedFromManual: [
          { $match: { clientDecision: "accepted", type: "manual" } },
          { $count: "count" },
        ],
        // --- UPDATED: Calculate total revenue AND average revenue per quote on the backend ---
        revenueData: [
          {
            $match: {
              clientDecision: "accepted",
              "collectionDetails.collected": true,
              finalPrice: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$finalPrice" },
              avgRevenuePerQuote: { $avg: "$finalPrice" },
            },
          },
        ],
        // --- END OF UPDATE ---
        userStats: [
          {
            $group: {
              _id: "$userId",
              quoteCount: { $sum: 1 },
            },
          },
          {
            $group: {
              _id: null,
              usersWithQuotes: { $sum: 1 },
              averageQuotesPerUser: { $avg: "$quoteCount" },
            },
          },
        ],
        monthlyQuotes: [
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              total: { $sum: 1 },
              accepted: {
                $sum: {
                  $cond: [{ $eq: ["$clientDecision", "accepted"] }, 1, 0],
                },
              },
              collected: {
                $sum: {
                  $cond: [{ $eq: ["$collectionDetails.collected", true] }, 1, 0],
                },
              },
              monthlyRevenue: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ["$clientDecision", "accepted"] }, { $eq: ["$collectionDetails.collected", true] }] },
                    "$finalPrice",
                    0
                  ],
                },
              },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ],
        performanceMetrics: [
          {
            $match: {
              type: "manual",
              isReviewedByAdmin: true,
            },
          },
          {
            $group: {
              _id: null,
              averageManualReviewTimeMs: {
                $avg: { $subtract: ["$reviewedAt", "$lastManualRequestAt"] },
              },
              avgPriceDifference: {
                // Corrected to use finalPrice instead of adminOfferPrice
                $avg: { $subtract: ["$finalPrice", "$estimatedScrapPrice"] },
              },
            },
          },
        ],
      },
    },
  ]);

  // Updated aggregation to group users into 'checks left' vs 'no checks left'
  const dvlaChecksDistributionAggregation = await User.aggregate([
    {
      $group: {
        _id: { hasChecksLeft: { $gt: ["$checksLeft", 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  
  const totalUsers = await User.countDocuments();
  const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } });

  // Map the new aggregation result to a cleaner format for the frontend
  const dvlaChecksDistribution = dvlaChecksDistributionAggregation.map(item => ({
    hasChecksLeft: item._id.hasChecksLeft,
    count: item.count,
  }));

  const totalAutoQuotes = analyticsData[0]?.quoteCountsByType.find(q => q._id === 'auto')?.count || 0;
  const totalManualQuotes = analyticsData[0]?.quoteCountsByType.find(q => q._id === 'manual')?.count || 0;
  const quotesAcceptedFromManual = analyticsData[0]?.quotesAcceptedFromManual[0]?.count || 0;

  const stats = {
    totalQuotes: analyticsData[0]?.totalQuotes[0]?.count || 0,
    quoteCountsByType: analyticsData[0]?.quoteCountsByType || [],
    quoteCountsByDecision: analyticsData[0]?.quoteCountsByDecision || [],
    quotesAccepted: analyticsData[0]?.quotesAccepted[0]?.count || 0,
    quotesCollected: analyticsData[0]?.quotesCollected[0]?.count || 0,
    // --- UPDATED: Retrieve the new, pre-calculated value from the backend ---
    totalRevenue: analyticsData[0]?.revenueData[0]?.total || 0,
    avgRevenuePerQuote: analyticsData[0]?.revenueData[0]?.avgRevenuePerQuote || 0,
    // --- END OF UPDATE ---
    totalUsers,
    usersWithQuotes: analyticsData[0]?.userStats[0]?.usersWithQuotes || 0,
    newUsersThisMonth,
    averageQuotesPerUser: analyticsData[0]?.userStats[0]?.averageQuotesPerUser?.toFixed(2) || 0,
    monthlyQuotes: analyticsData[0]?.monthlyQuotes || [],
    averageManualReviewTime: ((analyticsData[0]?.performanceMetrics[0]?.averageManualReviewTimeMs || 0) / (1000 * 60 * 60)).toFixed(2) + " hours",
    averageFinalPriceVsEstimatedDifference: analyticsData[0]?.performanceMetrics[0]?.avgPriceDifference?.toFixed(2) || 0,
    dvlaChecksDistribution,
    manualQuoteRequestConversion: totalAutoQuotes > 0
      ? ((totalManualQuotes / totalAutoQuotes) * 100).toFixed(2)
      : "0.00",
    manualQuoteAcceptedConversion: totalManualQuotes > 0
      ? ((quotesAcceptedFromManual / totalManualQuotes) * 100).toFixed(2)
      : "0.00",
  };

  sendResponse(res, 200, "Analytics data fetched successfully", stats);
});







/**
 * @desc    Get current global settings
 * @route   GET /api/admin/settings
 * @access  Admin
 * @returns {object} Settings document
 */
exports.getSettings = catchAsyncErrors(async (req, res, next) => {
  // Find the single settings document. If it doesn't exist, create a default one.
  const settings = await Settings.findOne() || await Settings.create({});
  sendResponse(res, 200, "Settings fetched successfully.", settings);
});

/**
 * @desc    Update global settings
 * @route   PUT /api/admin/settings
 * @access  Admin
 * @param   {object} req.body - Contains the fields to update (defaultChecks, scrapRatePerKg)
 * @returns {object} The updated settings document
 */
exports.updateSettings = catchAsyncErrors(async (req, res, next) => {
  const { defaultChecks, scrapRatePerKg } = req.body;

  // === Improvements: Input Validation ===
  // Ensure defaultChecks is a non-negative integer
  if (defaultChecks !== undefined) {
    if (isNaN(defaultChecks) || defaultChecks < 0 || !Number.isInteger(Number(defaultChecks))) {
      return next(new ErrorResponse("defaultChecks must be a non-negative integer.", 400));
    }
  }

  // Ensure scrapRatePerKg is a non-negative number
  if (scrapRatePerKg !== undefined) {
    if (isNaN(scrapRatePerKg) || scrapRatePerKg < 0) {
      return next(new ErrorResponse("scrapRatePerKg must be a non-negative number.", 400));
    }
  }

  // Ensure at least one field is provided for update
  if (defaultChecks === undefined && scrapRatePerKg === undefined) {
    return next(new ErrorResponse("Please provide at least one field to update.", 400));
  }
  
  // === Improvements: Use findOneAndUpdate with upsert ===
  // This approach is more robust and prevents race conditions if the document
  // doesn't exist and multiple requests try to create it simultaneously.
  const updatedSettings = await Settings.findOneAndUpdate(
    {}, // Query to find a single document
    { 
      $set: {
        ...(defaultChecks !== undefined && { defaultChecks }),
        ...(scrapRatePerKg !== undefined && { scrapRatePerKg }),
      },
    },
    {
      new: true, // Return the updated document
      upsert: true, // Create a new document if one is not found
      runValidators: true, // Run schema validators on the update
    }
  );

  sendResponse(res, 200, "Settings updated successfully.", updatedSettings);
});


// @desc    Search quotes by admin
// @route   GET /api/admin/quotes/search
// @access  Admin
exports.searchQuotesByAdmin = catchAsyncErrors(async (req, res, next) => {
  const { quoteId, clientEmail, username, regNumber } = req.query;

  // At least one search parameter is required
  if (!quoteId && !clientEmail && !username && !regNumber) {
    return next(new ErrorResponse("Please provide at least one search criterion (Quote ID, Client Email, Username, or Reg Number).", 400));
  }

  const queryConditions = [];
  let userIds = [];

  // Search by Quote ID (exact match)
  if (quoteId) {
    if (!mongoose.Types.ObjectId.isValid(quoteId)) {
      return next(new ErrorResponse("Invalid Quote ID format. Must be a valid MongoDB ObjectId.", 400));
    }
    // If quoteId is provided, it's an exact match and takes precedence
    const quote = await Quote.findById(quoteId).populate('userId');
    if (quote) {
      return sendResponse(res, 200, "Quote found successfully.", { quotes: [quote] });
    } else {
      return sendResponse(res, 200, "No quote found with the provided ID.", { quotes: [] });
    }
  }

  // Search by Client Email or Username (requires finding user IDs first)
  if (clientEmail || username) {
    const userQuery = {};
    if (clientEmail) {
      userQuery.email = { $regex: clientEmail, $options: 'i' };
    }
    if (username) {
      // Searches against firstName or lastName
      userQuery.$or = [
        { firstName: { $regex: username, $options: 'i' } },
        { lastName: { $regex: username, $options: 'i' } }
      ];
    }
    
    const users = await User.find(userQuery).select('_id');
    if (users.length > 0) {
      userIds = users.map(user => user._id);
      queryConditions.push({ userId: { $in: userIds } });
    } else {
      // If no users found for email/username, no quotes will match
      return sendResponse(res, 200, "No quotes found matching the provided criteria.", { quotes: [] });
    }
  }

  // Search by Reg Number (case-insensitive partial match)
  if (regNumber) {
    queryConditions.push({ regNumber: { $regex: regNumber, $options: 'i' } });
  }

  // Combine conditions using $and for multiple criteria (excluding quoteId, which is handled above)
  const finalQuery = queryConditions.length > 0 ? { $and: queryConditions } : {};

  const quotes = await Quote.find(finalQuery).populate('userId');

  sendResponse(res, 200, "Quotes fetched successfully.", { quotes });
});
