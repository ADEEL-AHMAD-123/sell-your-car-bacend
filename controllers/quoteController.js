// controllers/quoteController.js
const User = require('../models/User');
const { fetchVehicleReport } = require('../utils/apifyClient');

exports.getQuote = async (req, res) => {
  const { regNumber, postcode } = req.body;
  if (!regNumber || !postcode) return res.status(400).json({ message: 'Both registration and postcode are required.' });

  const user = await User.findById(req.user.id);
  if (user.checksLeft <= 0) return res.status(403).json({ message: 'No checks left.' });

  try {
    const report = await fetchVehicleReport(regNumber);

    user.checksLeft -= 1;
    if (user.firstLogin) user.firstLogin = false;
    await user.save();

    return res.json({
      message: 'Vehicle report retrieved',
      quote: { regNumber, postcode, valuation: 'N/A', report }, // Apify probably doesn't return valuation directly
      checksLeft: user.checksLeft
    });
  } catch (err) {
    console.error('Apify error', err.message);
    return res.status(500).json({ message: 'Failed to fetch vehicle info.' });
  }
};
