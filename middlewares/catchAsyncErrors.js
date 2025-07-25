// Wrap async functions to catch errors
const catchAsyncErrors = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = catchAsyncErrors;
