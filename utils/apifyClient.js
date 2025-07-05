// utils/apifyClient.js
const { ApifyClient } = require('apify-client');

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

const ACTOR_ID = 'TI6A0VHnyRVjHXjP4'; // replace with your actual actor ID

exports.fetchVehicleReport = async (regNumber) => {
  try {
    const input = { 
      carscom_link: [
        `https://www.cars.com/shopping/results/?keyword=${encodeURIComponent(regNumber)}`
      ],
      proxy_config: { useApifyProxy: false },
      max_results: 5
    };

    // Run the actor
    const run = await client.actor(ACTOR_ID).call(input);

    // Get dataset items
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    if (!items.length) throw new Error('No results returned from Apify actor.');

    return items[0]; // return first result
  } catch (error) {
    console.error('Apify fetch error:', error.message);
    throw error;
  }
};
