const User = require("../models/User");
const Quote = require("../models/Quote");
const { fetchVehicleData } = require("../utils/dvlaClient");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const sendResponse = require("../utils/sendResponse");
const ErrorResponse = require("../utils/errorResponse");

const SCRAP_RATE_PER_KG = parseFloat(process.env.SCRAP_RATE_PER_KG || 0.15);

// @desc Generate auto quote from reg number
// @route POST /api/quote/auto
// @access Private
exports.getQuote = catchAsyncErrors(async (req, res, next) => {
  const { regNumber } = req.body;

  if (!regNumber) {
    return next(new ErrorResponse("Registration number is required.", 400));
  }

  const vehicle = await fetchVehicleData(regNumber);

  if (!vehicle || !vehicle.registrationNumber) {
    return next(
      new ErrorResponse("Vehicle not found or invalid registration.", 404)
    );
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

  let savedQuote = null;

  if (req.user && req.user._id) {
    savedQuote = await Quote.create({
      userId: req.user._id,
      ...quoteData,
    });

    // Filter only safe fields to return
    const {
      _id,
      regNumber,
      make,
      model,
      year,
      fuelType,
      colour,
      wheelPlan,
      engineCapacity,
      revenueWeight,
      co2Emissions,
      taxStatus,
      motStatus,
      euroStatus,
      realDrivingEmissions,
      estimatedScrapPrice,
      type,
      createdAt,
    } = savedQuote;

    return sendResponse(res, 200, "Quote generated successfully", {
      quote: {
        _id,
        regNumber,
        make,
        model,
        year,
        fuelType,
        colour,
        wheelPlan,
        engineCapacity,
        revenueWeight,
        co2Emissions,
        taxStatus,
        motStatus,
        euroStatus,
        realDrivingEmissions,
        estimatedScrapPrice,
        type,
        createdAt,
      },
      autoQuoteAvailable: !!estimatedPrice,
    });
  }

  // For guests: return only public fields
  return sendResponse(res, 200, "Quote generated successfully", {
    quote: quoteData,
    autoQuoteAvailable: !!estimatedPrice,
  });
});


// @desc Submit a manual quote
// @route POST /api/quote/manual-quote
// @access Private
exports.submitManualQuote = catchAsyncErrors(async (req, res, next) => {
  const {
    regNumber,
    make,
    model,
    year,
    fuelType,
    colour,
    wheelPlan,
    revenueWeight,
    userEstimatedPrice,
  } = req.body;

  if (!make || !model || !year || !fuelType) {
    return next(
      new ErrorResponse("Make, model, year, and fuel type are required.", 400)
    );
  }

  const estimatedScrapPrice = revenueWeight
    ? parseFloat((revenueWeight * SCRAP_RATE_PER_KG).toFixed(2))
    : null;

  const imageUrls = req.files?.map((file) => file.path) || [];

  const quote = await Quote.create({
    userId: req.user._id,
    regNumber: regNumber || "MANUAL",
    make,
    model,
    year,
    fuelType,
    colour,
    wheelPlan,
    revenueWeight,
    estimatedScrapPrice,
    userEstimatedPrice,
    images: imageUrls,
    type: "manual",
  });

  sendResponse(res, 201, "Manual quote submitted successfully", { quote });
});

// @desc Confirm quote with collection details
// @route PATCH /api/quote/:id/confirm
// @access Private
exports.confirmQuoteWithCollection = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { pickupDate, contactNumber, address } = req.body;

  if (!pickupDate || !contactNumber || !address) {
    return next(
      new ErrorResponse("All collection details are required.", 400)
    );
  }

  const quote = await Quote.findOne({ _id: id, userId: req.user._id });

  if (!quote) {
    return next(new ErrorResponse("Quote not found", 404));
  }

  if (quote.clientDecision !== "pending") {
    return next(
      new ErrorResponse("You have already responded to this quote.", 400)
    );
  }

  quote.clientDecision = "accepted";
  quote.collectionDetails = {
    pickupDate,
    contactNumber,
    address,
    collected: false,
  };

  await quote.save();

  sendResponse(res, 200, "Quote accepted and collection details submitted", {
    quote,
  });
});




// @desc    Get all pending manual quotes (admin only)
// @route   GET /api/admin/manual-quotes/pending
// @access  Admin
exports.getPendingManualQuotes = catchAsyncErrors(async (req, res, next) => {
  const quotes = await Quote.find({
    type: "manual",
    adminReviewed: false,
  })
    .populate("userId", "firstName lastName email")
    .sort({ createdAt: -1 });

  sendResponse(res, 200, "Pending manual quotes fetched successfully", {
    quotes,
  });
});

// @desc    Review a manual quote (admin only)
// @route   PATCH /api/admin/manual-quotes/:id/review
// @access  Admin
exports.reviewManualQuote = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { adminOfferPrice, adminMessage } = req.body;

  const quote = await Quote.findById(id);
  if (!quote || quote.type !== "manual") {
    return next(new ErrorResponse("Manual quote not found.", 404));
  }

  quote.adminOfferPrice = adminOfferPrice;
  quote.adminMessage = adminMessage;
  quote.adminReviewed = true;

  await quote.save();

  // Optional: email user notification here

  sendResponse(res, 200, "Manual quote reviewed successfully", { quote });
});

// @desc    Get all accepted manual quotes (admin only)
// @route   GET /api/admin/manual-quotes/accepted
// @access  Admin
exports.getAcceptedManualQuotes = catchAsyncErrors(async (req, res, next) => {
  const quotes = await Quote.find({
    type: "manual",
    clientDecision: "accepted",
    "collectionDetails.collected": false,
  })
    .populate("userId", "firstName lastName email")
    .sort({ createdAt: -1 });

  sendResponse(res, 200, "Accepted manual quotes fetched", { quotes });
});

 



// @desc    Mark a quote as collected (admin only)
// @route   PATCH /api/quote/:id/mark-collected
// @access  Admin
exports.markAsCollected = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const quote = await Quote.findById(id);

  if (!quote) {
    return next(new ErrorResponse('Quote not found', 404));
  }

  if (!quote.collectionDetails || quote.clientDecision !== 'accepted') {
    return next(new ErrorResponse('Collection details not available or quote not accepted.', 400));
  }

  quote.collectionDetails.collected = true;
  await quote.save();

  sendResponse(res, 200, 'Quote marked as collected', { quote });
});
