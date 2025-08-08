// middlewares/errorHandler.js 
const axios = require('axios');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Logging
  console.error('ERROR:', {
    message,
    stack: err.stack,
    errorType: err.name,
    route: `${req.method} ${req.originalUrl}`,
  });

  // Mongoose errors
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  if (err.code === 11000) {
    statusCode = 400;
    message = `Duplicate field: ${JSON.stringify(err.keyValue)}`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired.';
  }

  // Axios errors
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
    stack: err.stack,
  });
};

module.exports = errorHandler;
