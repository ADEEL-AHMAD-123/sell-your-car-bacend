const User = require("../models/User");
const Quote = require("../models/Quote");
const ManualQuote = require("../models/ManualQuote");
const sendResponse = require("../utils/sendResponse");
const ErrorResponse = require("../utils/errorResponse");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");

// 1. Get All Users
exports.getAllUsers = catchAsyncErrors(async (req, res, next) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  sendResponse(res, 200, "All users fetched", { users });
});

// 2. Search Users by Email or Name
exports.searchUsers = catchAsyncErrors(async (req, res, next) => {
  const { query } = req.query;
  if (!query) return next(new ErrorResponse("Search query missing", 400));

  const users = await User.find({
    $or: [
      { name: { $regex: query, $options: "i" } },
      { email: { $regex: query, $options: "i" } },
    ],
  }).select("-password");

  sendResponse(res, 200, "Users matching search", { users });
});

// 3. Paginated Users
exports.getPaginatedUsers = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const users = await User.find().skip(skip).limit(limit).select("-password");
  const total = await User.countDocuments();

  sendResponse(res, 200, "Paginated users list", {
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// 4. Get Quote History for a User
exports.getUserQuotes = catchAsyncErrors(async (req, res, next) => {
  const quotes = await Quote.find({ userId: req.params.userId }).sort({
    createdAt: -1,
  });
  sendResponse(res, 200, "User quote history", { quotes });
});

// 5. Update User Info
exports.updateUser = catchAsyncErrors(async (req, res, next) => {
  const { checksLeft, role, name } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) return next(new ErrorResponse("User not found", 404));

  if (typeof checksLeft !== "undefined") user.checksLeft = checksLeft;
  if (typeof role !== "undefined") user.role = role;
  if (typeof name !== "undefined") user.name = name;

  await user.save();

  sendResponse(res, 200, "User updated", {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      checksLeft: user.checksLeft,
      role: user.role,
    },
  });
});

// 6. Delete User
exports.deleteUser = catchAsyncErrors(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return next(new ErrorResponse("User not found", 404));

  await Quote.deleteMany({ userId: req.params.id });

  sendResponse(res, 200, "User and related quotes deleted");
});

// 7. Admin Dashboard Stats
exports.getAdminStats = catchAsyncErrors(async (req, res, next) => {
  const [totalUsers, totalQuotes, activeUsers] = await Promise.all([
    User.countDocuments(),
    Quote.countDocuments(),
    User.countDocuments({ checksLeft: { $gt: 0 } }),
  ]);

  sendResponse(res, 200, "Admin stats", {
    totalUsers,
    totalQuotes,
    activeUsers,
  });
});

// 8. Daily Quote Count (last 7 days)
exports.getDailyQuoteAnalytics = catchAsyncErrors(async (req, res, next) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6); // last 7 days

  const result = await Quote.aggregate([
    { $match: { createdAt: { $gte: start } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  sendResponse(res, 200, "Daily quote analytics", { data: result });
});


