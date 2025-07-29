// utils/queryFilters.js
const mongoose = require('mongoose');

const buildQueryFilters = (req) => {
  const {
    search = '',
    type = 'manual',
    decision,
    collected,
  } = req.query;

  const filters = { type };

  if (decision) filters.clientDecision = decision;
  if (collected !== undefined) {
    filters['collectionDetails.collected'] = collected === 'true';
  }

  if (search) {
    const isValidId = mongoose.Types.ObjectId.isValid(search);
    filters.$or = [
      { regNumber: { $regex: search, $options: 'i' } },
      ...(isValidId ? [{ _id: search }, { userId: search }] : []),
    ];
  }

  return filters;
};

module.exports = buildQueryFilters;
