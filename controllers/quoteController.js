// controllers/quoteController.js
const User = require('../models/User');
const { fetchVehicleData } = require('../utils/dvlaClient');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');

const SCRAP_RATE_PER_KG = parseFloat(process.env.SCRAP_RATE_PER_KG || 0.15);

exports.getQuote = catchAsyncErrors(async (req, res, next) => {
  const { regNumber } = req.body;

  if (!regNumber) {
    return res.status(400).json({ 
      message: 'registration number is required.',
    });
  }

  // const user = await User.findById(req.user.id);
  // if (!user || user.checksLeft <= 0) {
  //   return res.status(403).json({
  //     message: 'No checks left.',
  //   });
  // }

  const vehicle = await fetchVehicleData(regNumber);

  const weight = vehicle.revenueWeight || 0;
  const estimatedPrice = (weight * SCRAP_RATE_PER_KG).toFixed(2);

  // Deduct a check
  user.checksLeft -= 1;
  if (user.firstLogin) user.firstLogin = false;
  await user.save();

  res.status(200).json({
    message: 'Quote generated successfully',
    quote: {
      regNumber: vehicle.registrationNumber,
      postcode,
      make: vehicle.make,
      revenueWeight: weight,
      estimatedScrapPrice: estimatedPrice,
    },
    checksLeft: user.checksLeft,
  });
});
