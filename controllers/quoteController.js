const User = require('../models/User');
const Quote = require('../models/Quote');
const ManualQuote = require('../models/ManualQuote');
const { fetchVehicleData } = require('../utils/dvlaClient');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const sendResponse = require('../utils/sendResponse');
const ErrorResponse = require('../utils/errorResponse');

const SCRAP_RATE_PER_KG = parseFloat(process.env.SCRAP_RATE_PER_KG || 0.15);

exports.getQuote = catchAsyncErrors(async (req, res, next) => {
  const { regNumber } = req.body;

  if (!regNumber) {
    return next(new ErrorResponse('Registration number is required.', 400));
  }

  const vehicle = await fetchVehicleData(regNumber);

  if (!vehicle || !vehicle.registrationNumber) {
    return next(new ErrorResponse('Vehicle not found or invalid registration.', 404));
  }

  const weight = vehicle.revenueWeight;
  const estimatedPrice = weight ? (weight * SCRAP_RATE_PER_KG).toFixed(2) : null;

  const quoteData = {
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make,
    model: vehicle.model || null,
    fuelType: vehicle.fuelType,
    co2Emissions: vehicle.co2Emissions,
    colour: vehicle.colour,
    yearOfManufacture: vehicle.yearOfManufacture,
    engineCapacity: vehicle.engineCapacity,
    revenueWeight: weight,
    taxStatus: vehicle.taxStatus,
    motStatus: vehicle.motStatus,
    euroStatus: vehicle.euroStatus,
    realDrivingEmissions: vehicle.realDrivingEmissions,
    wheelplan: vehicle.wheelplan,
    estimatedScrapPrice: estimatedPrice,
  };

  if (req.user && req.user._id) {
    await Quote.create({
      userId: req.user._id,
      regNumber,
      data: quoteData,
    });
  }

  sendResponse(res, 200, 'Quote generated successfully', {
    vehicle: quoteData,
    autoQuoteAvailable: !!estimatedPrice,
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
    year,
    fuelType,
    colour,
    weight,
    wheelPlan,
    userEstimatedPrice,
    message,
  } = req.body;

  if (!make || !model || !year || !fuelType) {
    return next(new ErrorResponse('Make, model, year, and fuel type are required.', 400));
  }

  let estimatedScrapPrice = null;
  if (weight) {
    estimatedScrapPrice = (weight * SCRAP_RATE_PER_KG).toFixed(2);
  }

  const imageUrls = req.files?.map(file => file.path) || [];

  const manualQuote = await ManualQuote.create({
    userId: req.user._id,
    regNumber: regNumber || 'MANUAL',
    make,
    model,
    year,
    fuelType,
    colour,
    weight,
    wheelPlan,
    userEstimatedPrice,
    message,
    estimatedScrapPrice,
    images: imageUrls, // ⬅ store URLs
  });

  sendResponse(res, 201, 'Manual quote submitted successfully', { manualQuote });
});


 