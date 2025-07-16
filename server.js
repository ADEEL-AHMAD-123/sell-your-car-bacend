const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
const quoteRoutes = require('./routes/quoteRoutes');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./middlewares/logger'); 

dotenv.config();

const app = express();

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(logger); //logging middleware 

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/quote', quoteRoutes);

// Error Handler (after routes)
app.use(errorHandler);

// Connect & Start
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));
