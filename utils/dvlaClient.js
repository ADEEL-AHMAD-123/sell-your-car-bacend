const axios = require('axios');

const DVLA_API_URL = 'https://uat.driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
const API_KEY = process.env.DVLA_API_KEY;

const fetchVehicleData = async (registrationNumber) => {
  try {
    const response = await axios.post(
      DVLA_API_URL,
      { registrationNumber: registrationNumber.toUpperCase() },
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ [DVLA Response]', response.data);
    return response.data;
  } catch (error) {
    const status = error.response?.status || 500;
    const message =
      error.response?.data?.errors?.[0]?.detail ||
      error.response?.data?.message ||
      'Failed to fetch vehicle data from DVLA.';

    console.error('❌ [DVLA Error]', {
      status,
      message,
      raw: error.response?.data || error.message
    });

    const err = new Error(message);
    err.statusCode = status;
    throw err;
  }
};

module.exports = { fetchVehicleData };
