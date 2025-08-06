const mongoose = require('mongoose');

const buildQueryFilters = (req) => {
  const {
    search,
    type,
    decision,
    collected,
  } = req.query;

  const filters = {};

  // TYPE
  if (type === 'manual' || type === 'auto') {
    filters.type = type;
  } else if (type === 'all') {
    // allow both
  } else {
    filters.type = 'manual'; // default
  }

  // DECISION
  if (decision) {
    filters.clientDecision = decision;
  }

  // COLLECTED
  if (collected !== undefined) {
    filters['collectionDetails.collected'] = collected === 'true';
  }

  // SEARCH
  if (search !== undefined && search !== '') {
    const isValidId = mongoose.Types.ObjectId.isValid(search);
    const orFilters = [{ regNumber: { $regex: search, $options: 'i' } }];

    if (isValidId) {
      orFilters.push({ _id: search }, { userId: search });
    }

    filters.$or = orFilters;
  }

  return filters;
};

module.exports = buildQueryFilters;
