const axios = require('axios');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.status || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose invalid ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // Mongoose duplicate key
  if (err.code && err.code === 11000) {
    statusCode = 400;
    message = `Duplicate field value entered: ${JSON.stringify(err.keyValue)}`;
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }

  // Axios (DVLA or external API) error
  if (axios.isAxiosError(err)) {
    statusCode = err.response?.status || 500;
    message =
      err.response?.data?.message ||
      err.response?.data?.errors?.[0]?.detail ||
      'External API error';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
