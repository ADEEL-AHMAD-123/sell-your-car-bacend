// File: utils/vehicleApiClient.js
const axios = require('axios');
const ErrorResponse = require("../utils/errorResponse");
const dotenv = require('dotenv');
dotenv.config();

const VEHICLE_API_URL = 'https://api.checkcardetails.co.uk';
const API_KEY = process.env.VEHICLE_API_KEY;

/**
 * Normalizes the raw API response into a clean object that matches our new schema.
 */
const normalizeVehicleData = (apiData) => {
  if (!apiData || !apiData.VehicleRegistration) {
    throw new ErrorResponse('Incomplete data from API.', 500);
  }

  const vehicleRegistration = {
    // ... all the fields you need from VehicleRegistration
    DateOfLastUpdate: apiData.VehicleRegistration.DateOfLastUpdate,
    Colour: apiData.VehicleRegistration.Colour,
    VehicleClass: apiData.VehicleRegistration.VehicleClass,
    YearOfManufacture: apiData.VehicleRegistration.YearOfManufacture,
    WheelPlan: apiData.VehicleRegistration.WheelPlan,
    Transmission: apiData.VehicleRegistration.Transmission,
    Model: apiData.VehicleRegistration.Model,
    Vrm: apiData.VehicleRegistration.Vrm,
    Make: apiData.VehicleRegistration.Make,
    FuelType: apiData.VehicleRegistration.FuelType,
  };

  const otherVehicleData = {
    KerbWeight: apiData.Dimensions.KerbWeight,
    BodyStyle: apiData.SmmtDetails.BodyStyle,
    NumberOfDoors: apiData.SmmtDetails.NumberOfDoors,
  };

  return {
    vehicleRegistration,
    otherVehicleData
  };
};

/**
 * Fetches vehicle data from the new API and returns a normalized object.
 */
const fetchVehicleData = async (registrationNumber) => {
  if (!API_KEY) {
    throw new Error('API key is not set. Please provide the VEHICLE_API_KEY environment variable.');
  }

  try {
    const response = await axios.get(
      `${VEHICLE_API_URL}/vehicledata/ukvehicledata`, {
        params: {
          apikey: API_KEY,
          vrm: registrationNumber.toUpperCase()
        }
      }
    );

    const apiData = response.data;
    console.log('✅ [Vehicle API Response]', apiData);

    // This check handles cases where the API returns a 200 but the data is empty.
    if (!apiData || Object.keys(apiData).length === 0) {
      throw new ErrorResponse('Vehicle not found. The API returned no data.', 404);
    }
    
    return normalizeVehicleData(apiData);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;

    console.error('❌ [Vehicle API Error]', { status, message });
    
    // Check for specific HTTP status codes
    if (status === 404) {
      // Throw a specific 404 error with a clear message
      throw new ErrorResponse("Vehicle not found or invalid registration.", 404);
    }
    
    if (status === 401 || status === 403) {
      throw new ErrorResponse("API authentication failed. Please check the API key.", 500);
    }

    // Handle all other errors
    throw new ErrorResponse(message || 'An unexpected error occurred with the vehicle API.', status);
  }
};

module.exports = { fetchVehicleData };