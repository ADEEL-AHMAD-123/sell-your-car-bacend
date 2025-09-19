// scripts/revert_users_subscription.js

const mongoose = require('mongoose');
const User = require('./models/User.js');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

async function revertSubscription() {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGO_URI is not defined in the .env file.');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    // This command finds ALL users and sets their marketing.isSubscribed field to false.
    const updateResult = await User.updateMany(
      {},
      { $set: { 'marketing.isSubscribed': false } }
    );

    console.log('\n--- Reversion Results ---');
    console.log(`Documents matched: ${updateResult.matchedCount}`);
    console.log(`Documents modified: ${updateResult.modifiedCount}`);
    console.log('-------------------------');

    if (updateResult.modifiedCount > 0) {
      console.log('🎉 Reversion successful! All user subscriptions have been set to false.');
    } else {
      console.log('✅ No documents were modified.');
    }
  } catch (err) {
    console.error('❌ Reversion failed:', err);
  } finally {
    console.log('Disconnecting from MongoDB.');
    await mongoose.disconnect();
  }
}

revertSubscription();