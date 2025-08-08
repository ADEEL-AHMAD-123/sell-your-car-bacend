const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
const quoteRoutes = require('./routes/quoteRoutes');
const adminRoutes = require('./routes/adminRoutes');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./middlewares/logger');

dotenv.config();

const app = express();

// --- START: Corrected CORS configuration ---
const corsOptions = {
  // Use the environment variable for the allowed origin
  origin: process.env.FRONTEND_URL,
  credentials: true,
  // A success status of 200 is safer for some legacy browsers
  optionsSuccessStatus: 200
};

// Use the CORS middleware for all routes. The middleware itself
// will handle the preflight OPTIONS requests automatically.
app.use(cors(corsOptions));
// --- END: Corrected CORS configuration ---

// Other Middlewares
app.use(cookieParser());
app.use(express.json());
app.use(logger);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/quote', quoteRoutes);
app.use('/api/admin', adminRoutes);

// Error Handler (after routes)
app.use(errorHandler);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Conditional check: Only call app.listen() for local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Vercel-specific: We always export the app instance.
module.exports = app;
