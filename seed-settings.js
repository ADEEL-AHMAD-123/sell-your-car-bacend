// seed-settings.js
require('dotenv').config();
const mongoose = require('mongoose');

const Settings = require('./models/Settings'); // Adjust path to your Settings model

const MONGODB_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected for seeding settings.'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Main seeding function
const seedSettings = async () => {
  try {
    // ⚠️ CRITICAL STEP: Delete all existing settings to ensure only one document exists.
    await Settings.deleteMany({});
    console.log('Existing settings cleared.');

    // Create a new default settings document based on your model's defaults.
    const newSettings = await Settings.create({});

    console.log('Default settings seeded successfully:');
    console.log(newSettings);

    mongoose.connection.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Database seeding failed:', error);
    mongoose.connection.close();
    process.exit(1);
  }
};

seedSettings();