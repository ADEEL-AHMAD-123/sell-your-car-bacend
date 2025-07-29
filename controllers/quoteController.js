const User = require("../models/User");
const Quote = require("../models/Quote");
const { fetchVehicleData } = require("../utils/dvlaClient");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const sendResponse = require("../utils/sendResponse");
const sendEmail =require("../utils/emailService")
const ErrorResponse = require("../utils/errorResponse");
const buildQueryFilters = require('../utils/queryFilters');

const SCRAP_RATE_PER_KG = parseFloat(process.env.SCRAP_RATE_PER_KG || 0.15);

// @desc Generate auto quote from reg number
// @route POST /api/quote/auto
// @access Private
exports.getQuote = catchAsyncErrors(async (req, res, next) => {
  const { regNumber } = req.body;

  // Step 0: Validate required fields
  if (!regNumber) {
    return next(new ErrorResponse("Registration number is required.", 400));
  }

  const userId = req.user?._id;
  if (!userId) {
    return next(new ErrorResponse("Unauthorized. Please log in.", 401));
  }

  const reg = regNumber.trim().toUpperCase();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const manualExpiryThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // === STEP 1: Check recent AUTO quote ===
  const existingAutoQuote = await Quote.findOne({
    userId,
    regNumber: reg,
    type: "auto",
    createdAt: { $gte: sevenDaysAgo },
  });

  if (existingAutoQuote) {
    // CASE 1: Accepted but NOT collected
    if (
      existingAutoQuote.clientDecision === "accepted" &&
      !existingAutoQuote.collected
    ) {
      return sendResponse(res, 200, "You’ve already accepted this quote. Pending collection.", {
        quote: existingAutoQuote,
        status: "accepted_pending_collection",
      });
    }

    // CASE 2: Accepted and collected
    if (
      existingAutoQuote.clientDecision === "accepted" &&
      existingAutoQuote.collected
    ) {
      return sendResponse(res, 200, "You’ve already accepted and collected this quote.", {
        quote: existingAutoQuote,
        status: "accepted_collected",
      });
    }

    // CASE 3: Recent quote exists but not accepted yet
    return sendResponse(res, 200, "You already have a recent quote for this vehicle.", {
      quote: existingAutoQuote,
      autoQuoteAvailable: !!existingAutoQuote.estimatedScrapPrice,
      status: "cached_quote",
    });
  }

  // === STEP 2: Check MANUAL quote ===
  const existingManualQuote = await Quote.findOne({
    userId,
    regNumber: reg,
    type: "manual",
  });

  if (existingManualQuote) {
    const isStaleManual =
      existingManualQuote.createdAt < manualExpiryThreshold &&
      !existingManualQuote.clientDecision;

    // CASE 1: Manual quote exists but not reviewed yet
    if (!existingManualQuote.isReviewedByAdmin && !isStaleManual) {
      return sendResponse(
        res,
        200,
        "We’ve already received a manual quote request for this vehicle. It’s pending review.",
        {
          status: "manual_pending_review",
        }
      );
    }

    // CASE 2: Manual quote accepted but not collected
    if (
      existingManualQuote.isReviewedByAdmin &&
      existingManualQuote.clientDecision === "accepted" &&
      !existingManualQuote.collected
    ) {
      return sendResponse(
        res,
        200,
        "You’ve already accepted this manual quote. Pending collection.",
        {
          quote: existingManualQuote,
          status: "manual_accepted_pending_collection",
        }
      );
    }

    // CASE 3: Manual quote accepted and collected
    if (
      existingManualQuote.isReviewedByAdmin &&
      existingManualQuote.clientDecision === "accepted" &&
      existingManualQuote.collected
    ) {
      return sendResponse(
        res,
        200,
        "You’ve already accepted and collected this manual quote.",
        {
          quote: existingManualQuote,
          status: "manual_accepted_collected",
        }
      );
    }

    // CASE 4: Reviewed but not accepted AND still recent
    if (
      existingManualQuote.isReviewedByAdmin &&
      !existingManualQuote.clientDecision &&
      existingManualQuote.createdAt >= manualExpiryThreshold
    ) {
      return sendResponse(res, 200, "This manual quote was already reviewed.", {
        quote: existingManualQuote,
        status: "manual_reviewed",
      });
    }

    // CASE 5: Manual quote too old or expired → allow re-generation
    if (isStaleManual) {
      // fall through to step 3 to re-generate
    } else {
      // Block all other cases by default
      return sendResponse(res, 200, "This manual quote is still being processed.", {
        quote: existingManualQuote,
        status: "manual_locked",
      });
    }
  }

  // === STEP 3: No valid quote exists — fetch DVLA vehicle data ===
  const vehicle = await fetchVehicleData(reg);
  if (!vehicle || !vehicle.registrationNumber) {
    return next(new ErrorResponse("Vehicle not found or invalid registration.", 404));
  }

  const weight = vehicle.revenueWeight;
  const estimatedPrice = weight
    ? parseFloat((weight * SCRAP_RATE_PER_KG).toFixed(2))
    : null;

  const quoteData = {
    regNumber: vehicle.registrationNumber,
    make: vehicle.make,
    model: vehicle.model || null,
    fuelType: vehicle.fuelType,
    co2Emissions: vehicle.co2Emissions,
    colour: vehicle.colour,
    year: vehicle.yearOfManufacture,
    engineCapacity: vehicle.engineCapacity,
    revenueWeight: weight,
    taxStatus: vehicle.taxStatus,
    motStatus: vehicle.motStatus,
    euroStatus: vehicle.euroStatus,
    realDrivingEmissions: vehicle.realDrivingEmissions,
    wheelPlan: vehicle.wheelplan,
    estimatedScrapPrice: estimatedPrice,
    type: "auto",
  };

  // === STEP 4: Save new AUTO quote in DB ===
  const savedQuote = await Quote.findOneAndUpdate(
    { userId, regNumber: quoteData.regNumber, type: "auto" },
    { $set: { ...quoteData, userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const { _id, createdAt, ...safeFields } = savedQuote.toObject();

  // === STEP 5: Respond with generated quote ===
  return sendResponse(res, 200, "Quote generated successfully", {
    quote: {
      _id,
      ...safeFields,
      createdAt,
    },
    autoQuoteAvailable: !!estimatedPrice,
    status: "new_generated",
  });
});




// @desc    Submit a manual quote
// @route   POST /api/quote/manual-quote
// @access  Private
exports.submitManualQuote = catchAsyncErrors(async (req, res, next) => {
  const {
    regNumber,
    make,
    model,
    fuelType,
    year,
    condition,
    mileage,
    message,
    postcode,
    images,
    revenueWeight,
    userEstimatedPrice,
  } = req.body;

  const userId = req.user?._id;
  const userEmail = req.user?.email;
  const userPhone = req.user?.phone;
  const userName = `${req.user?.firstName} ${req.user?.lastName}`.trim();

  if (!userId || !userEmail) {
    return next(new ErrorResponse("Unauthorized. Please log in.", 401));
  }

  if (!regNumber || !make || !model || !fuelType || !year) {
    return next(new ErrorResponse("Missing required fields.", 400));
  }

  const reg = regNumber.trim().toUpperCase();

  const existingManualQuote = await Quote.findOne({
    userId,
    regNumber: reg,
    type: "manual",
  });

  if (existingManualQuote) {
    const responseData = { manualQuote: existingManualQuote };

    if (!existingManualQuote.isReviewedByAdmin) {
      return sendResponse(res, 200, "Manual valuation already requested, pending review", {
        ...responseData,
        status: "manual_pending_review",
      });
    }

    if (
      existingManualQuote.isReviewedByAdmin &&
      !existingManualQuote.isAccepted &&
      !existingManualQuote.isCollected
    ) {
      return sendResponse(res, 200, "Manual valuation already reviewed", {
        ...responseData,
        status: "manual_reviewed",
      });
    }

    if (existingManualQuote.isAccepted && !existingManualQuote.isCollected) {
      return sendResponse(res, 200, "Quote already accepted and collection is pending", {
        ...responseData,
        status: "manual_accepted_pending_collection",
      });
    }

    if (existingManualQuote.isAccepted && existingManualQuote.isCollected) {
      return sendResponse(res, 200, "This vehicle has already been collected", {
        ...responseData,
        status: "manual_accepted_collected",
      });
    }
  }

  const limitedImages = Array.isArray(images) ? images.slice(0, 6) : [];

  const manualQuoteData = {
    userId,
    regNumber: reg,
    make,
    model,
    fuelType,
    year,
    condition,
    mileage,
    message,
    postcode,
    revenueWeight,
    userEstimatedPrice,
    images: limitedImages,
    type: "manual",
  };

  const savedQuote = await Quote.create(manualQuoteData);

  // === Send confirmation email ===
  try {
    await sendEmail({
      to: userEmail,
      subject: "We've received your quote request",
      templateName: "manual-quote-submitted",
      templateData: {
        userName,
        userPhone,
        regNumber: reg,
        make,
        model,
        year,
        revenueWeight,
        userEstimatedPrice,

      },
    });
  } catch (emailErr) {
    console.error("Email failed to send:", emailErr.message);
  }

  const { _id, createdAt, ...safeFields } = savedQuote.toObject();

  return sendResponse(res, 200, "Manual quote submitted successfully", {
    quote: {
      _id,
      ...safeFields,
      createdAt,
    },
    status: "manual_submitted",
  });
});


// @desc Confirm quote with collection details
// @route PATCH /api/quote/:id/confirm
// @access Private
exports.confirmQuoteWithCollection = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { pickupDate, contactNumber, address } = req.body;

  // 1. Validate input
  if (!pickupDate || !contactNumber || !address) {
    return next(new ErrorResponse("All collection details are required.", 400));
  }

  const pickupDateObj = new Date(pickupDate);
  if (isNaN(pickupDateObj) || pickupDateObj <= new Date()) {
    return next(new ErrorResponse("Pickup date must be in the future.", 400));
  }

  const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
  if (!phoneRegex.test(contactNumber)) {
    return next(new ErrorResponse("Invalid contact number format.", 400));
  }

  // 2. Find and validate quote
  const quote = await Quote.findOne({ _id: id, userId: req.user._id }).populate('userId');
  if (!quote) return next(new ErrorResponse("Quote not found", 404));

  if (quote.clientDecision !== "pending") {
    return next(new ErrorResponse("You have already responded to this quote.", 400));
  }
  if (quote.collectionDetails?.pickupDate) {
    return next(new ErrorResponse("Collection details already submitted.", 400));
  }

  // 3. Save collection info
  quote.clientDecision = "accepted";
  quote.collectionDetails = {
    pickupDate: pickupDateObj,
    contactNumber,
    address,
    collected: false,
  };

  await quote.save();

  const client = quote.userId;

  // 4. Send Emails

  // ADMIN EMAIL
  await sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `Client Accepted Quote – ${quote.regNumber}`,
    templateName: "adminQuoteAccepted", // EJS: adminQuoteAccepted.ejs
    templateData: {
      quoteType: quote.type,
      reg: quote.regNumber,
      make: quote.make || "N/A",
      model: quote.model || "N/A",
      weight: quote.revenueWeight || "N/A",
      price: quote.adminOfferPrice || "N/A",
      clientName: `${client.firstName} ${client.lastName}`,
      clientEmail: client.email,
      clientPhone: client.phone || "N/A",
      pickupDate: pickupDateObj.toDateString(),
      address,
      collectionContact: contactNumber,
    },
  });

  // CLIENT EMAIL
  await sendEmail({
    to: client.email,
    subject: "Your Quote Has Been Confirmed",
    templateName: "clientConfirmation", // EJS: clientConfirmation.ejs
    templateData: {
      name: `${client.firstName} ${client.lastName}`,
      quoteType: quote.type,
      reg: quote.regNumber,
      make: quote.make || "N/A",
      model: quote.model || "N/A",
      weight: quote.revenueWeight || "N/A",
      price: quote.adminOfferPrice || "N/A",
      clientEmail: client.email,
      clientPhone: client.phone || "N/A",
      pickupDate: pickupDateObj.toDateString(),
      address,
      contactNumber,
    },
  });

  // 5. Respond
  sendResponse(res, 200, "Quote accepted and collection details submitted", {
    quote,
  });
});





 
// @desc    Get all pending manual quotes (admin only)
// @route   GET /api/admin/manual-quotes/pending
// @access  Admin
exports.getPendingManualQuotes = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filters = buildQueryFilters(req);
  filters.isReviewedByAdmin = false;

  const total = await Quote.countDocuments(filters);
  const quotes = await Quote.find(filters)
    .populate('userId', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  sendResponse(res, 200, 'Pending manual quotes fetched successfully', {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    quotes,
  });
});

// @desc    Review a manual quote (admin only)
// @route   PATCH /api/admin/manual-quotes/:id/review
// @access  Admin
exports.reviewManualQuote = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { adminOfferPrice, adminMessage } = req.body;
  console.log("body :",adminOfferPrice, adminMessage )

  if (!adminOfferPrice || !adminMessage) {
    return next(new ErrorResponse('Both adminOfferPrice and adminMessage are required.', 400));
  }

  const quote = await Quote.findById(id).populate('userId');

  if (!quote || quote.type !== 'manual') {
    return next(new ErrorResponse('Manual quote not found.', 404));
  }

  // Update quote details
  quote.adminOfferPrice = adminOfferPrice;
  quote.adminMessage = adminMessage;
  quote.isReviewedByAdmin = true;
  quote.reviewedAt = new Date();
  await quote.save();

  // Send email to user if email exists
  if (quote.userId && quote.userId.email) {
    const acceptUrl = `${process.env.FRONTEND_URL}/accept-quote/${quote._id}`;

    
    const clientName = `${quote.userId.firstName} ${quote.userId.lastname}`;



    await sendEmail({
      to: quote.userId.email,
      subject: 'Your Manual Quote Has Been Reviewed',
      templateName: 'manualQuoteReviewed',
      templateData: {
        name: clientName || 'User',
        regNumber: quote.regNumber,
        make: quote.make,
        model: quote.model,
        year: quote.year,
        weight: quote.weight || null,
        clientOfferPrice: quote.clientOfferPrice || null,
        adminOfferPrice,
        adminMessage,
        dashboardLink: `${process.env.FRONTEND_URL}/accept-quote/${quote._id}`,
      },
    });
    
  }

  sendResponse(res, 200, 'Manual quote reviewed and user notified.', {
    quote,
  });
});



// @desc    Get all accepted manual quotes (admin only)
// @route   GET /api/admin/manual-quotes/accepted
// @access  Admin
exports.getAcceptedManualQuotes = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filters = buildQueryFilters(req);
  filters.clientDecision = 'accepted';

  filters['collectionDetails.collected'] = false;

  const total = await Quote.countDocuments(filters);
  const quotes = await Quote.find(filters)
    .populate('userId', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  sendResponse(res, 200, 'Accepted manual quotes fetched successfully', {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    quotes,
  });
});

// @desc    Mark a quote as collected (admin only)
// @route   PATCH /api/quote/:id/mark-collected
// @access  Admin
exports.markAsCollected = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const quote = await Quote.findById(id);
  if (!quote) {
    return next(new ErrorResponse('Quote not found.', 404));
  }

  if (!quote.collectionDetails || quote.clientDecision !== 'accepted') {
    return next(
      new ErrorResponse('Collection details not available or quote not accepted.', 400)
    );
  }

  quote.collectionDetails.collected = true;
  await quote.save();

  sendResponse(res, 200, 'Quote marked as collected successfully', { quote });
});
