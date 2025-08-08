// seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');

const User = require('./models/User'); // Adjust path to your User model
const Quote = require('./models/Quote'); // Adjust path to your Quote model
const Settings = require('./models/Settings'); // Adjust path to your Settings model

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_db_name'; // Replace with your connection string

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected for seeding.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Function to generate a random user
const createRandomUser = () => {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email().toLowerCase(),
    phone: faker.phone.number('###-###-####'),
    password: 'password123', // In a real app, you would hash this
    role: faker.helpers.arrayElement(['user', 'user', 'user', 'admin']), // More users than admins
    checksLeft: faker.number.int({ min: 0, max: 10 }),
    originalChecks: 10, // Assuming a default of 10
    firstLogin: false,
  };
};

// Function to generate a random quote
const createRandomQuote = (userId) => {
  const quoteType = faker.helpers.arrayElement(['auto', 'manual']);
  const clientDecision = faker.helpers.arrayElement(['pending', 'accepted', 'rejected']);

  return {
    userId,
    regNumber: faker.vehicle.vin().substring(0, 7),
    make: faker.vehicle.manufacturer(),
    model: faker.vehicle.model(),
    year: faker.date.past().getFullYear().toString(),
    fuelType: faker.vehicle.fuel(),
    colour: faker.vehicle.color(),
    dvlaFetchedAt: faker.date.past(),

    images: faker.helpers.arrayElements([
      faker.image.urlLoremFlickr({ category: 'car' }),
      faker.image.urlLoremFlickr({ category: 'car' })
    ], { min: 0, max: 2 }),
    userEstimatedPrice: faker.number.float({ min: 100, max: 500, precision: 0.01 }),
    message: faker.lorem.sentence(),

    type: quoteType,
    estimatedScrapPrice: faker.number.float({ min: 100, max: 500, precision: 0.01 }),

    adminOfferPrice: quoteType === 'manual' ? faker.number.float({ min: 100, max: 600, precision: 0.01 }) : undefined,
    adminMessage: quoteType === 'manual' ? faker.lorem.sentence() : undefined,
    isReviewedByAdmin: quoteType === 'manual' ? faker.datatype.boolean() : false,

    clientDecision: clientDecision,

    rejectionReason: clientDecision === 'rejected' ? faker.lorem.sentence() : undefined,
    
    finalPrice: clientDecision === 'accepted' ? faker.number.float({ min: 100, max: 600, precision: 0.01 }) : undefined,

    collectionDetails: clientDecision === 'accepted' ? {
      pickupDate: faker.date.future(),
      contactNumber: faker.phone.number('###-###-####'),
      address: faker.location.streetAddress(true),
      collected: faker.datatype.boolean(),
    } : undefined,

    lastManualRequestAt: quoteType === 'manual' ? faker.date.past() : undefined,
  };
};

// Main seeding function
const seedDB = async () => {
  try {
    // Clear existing data
    await User.deleteMany({});
    await Quote.deleteMany({});
    await Settings.deleteMany({});
    console.log('Old data cleared.');

    // Seed Settings
    const settings = await Settings.create({
      defaultChecks: 10,
      scrapRatePerKg: 0.25,
    });
    console.log('Settings seeded.');

    // Seed Users
    const users = [];
    for (let i = 0; i < 12; i++) {
      users.push(createRandomUser());
    }
    const createdUsers = await User.insertMany(users);
    console.log(`${createdUsers.length} users seeded.`);

    // Seed Quotes
    const quotes = [];
    for (let i = 0; i < 20; i++) {
      const randomUser = faker.helpers.arrayElement(createdUsers);
      quotes.push(createRandomQuote(randomUser._id));
    }
    await Quote.insertMany(quotes);
    console.log(`${quotes.length} quotes seeded.`);

    console.log('Database seeding complete!');
    mongoose.connection.close();
  } catch (error) {
    console.error('Database seeding failed:', error);
    mongoose.connection.close();
    process.exit(1);
  }
};

seedDB();