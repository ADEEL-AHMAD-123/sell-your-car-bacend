// File: utils/vehicleApiClient.js
const axios = require('axios');
const ErrorResponse = require("../utils/errorResponse");
const dotenv = require('dotenv');
dotenv.config();

// The base URL for the API.
const VEHICLE_API_URL = 'https://api.checkcardetails.co.uk';
const API_KEY = process.env.VEHICLE_API_KEY;

/**
 * Normalizes the raw API response into a clean object that matches our new schema.
 * @param {object} apiData - The raw response from the Check Car Details API.
 * @returns {object} A normalized object with only the necessary fields.
 */
const normalizeVehicleData = (apiData) => {
  if (!apiData || !apiData.VehicleRegistration) {
    throw new ErrorResponse('Incomplete data from API.', 500);
  }

  // Extract all fields from the VehicleRegistration object
  const vehicleRegistration = {
    DateOfLastUpdate: apiData.VehicleRegistration.DateOfLastUpdate,
    Colour: apiData.VehicleRegistration.Colour,
    VehicleClass: apiData.VehicleRegistration.VehicleClass,
    CertificateOfDestructionIssued: apiData.VehicleRegistration.CertificateOfDestructionIssued,
    EngineNumber: apiData.VehicleRegistration.EngineNumber,
    EngineCapacity: apiData.VehicleRegistration.EngineCapacity,
    TransmissionCode: apiData.VehicleRegistration.TransmissionCode,
    Exported: apiData.VehicleRegistration.Exported,
    YearOfManufacture: apiData.VehicleRegistration.YearOfManufacture,
    WheelPlan: apiData.VehicleRegistration.WheelPlan,
    DateExported: apiData.VehicleRegistration.DateExported,
    Scrapped: apiData.VehicleRegistration.Scrapped,
    Transmission: apiData.VehicleRegistration.Transmission,
    DateFirstRegisteredUk: apiData.VehicleRegistration.DateFirstRegisteredUk,
    Model: apiData.VehicleRegistration.Model,
    GearCount: apiData.VehicleRegistration.GearCount,
    ImportNonEu: apiData.VehicleRegistration.ImportNonEu,
    PreviousVrmGb: apiData.VehicleRegistration.PreviousVrmGb,
    GrossWeight: apiData.VehicleRegistration.GrossWeight,
    DoorPlanLiteral: apiData.VehicleRegistration.DoorPlanLiteral,
    MvrisModelCode: apiData.VehicleRegistration.MvrisModelCode,
    Vin: apiData.VehicleRegistration.Vin,
    Vrm: apiData.VehicleRegistration.Vrm,
    DateFirstRegistered: apiData.VehicleRegistration.DateFirstRegistered,
    DateScrapped: apiData.VehicleRegistration.DateScrapped,
    DoorPlan: apiData.VehicleRegistration.DoorPlan,
    YearMonthFirstRegistered: apiData.VehicleRegistration.YearMonthFirstRegistered,
    VinLast5: apiData.VehicleRegistration.VinLast5,
    VehicleUsedBeforeFirstRegistration: apiData.VehicleRegistration.VehicleUsedBeforeFirstRegistration,
    MaxPermissibleMass: apiData.VehicleRegistration.MaxPermissibleMass,
    Make: apiData.VehicleRegistration.Make,
    MakeModel: apiData.VehicleRegistration.MakeModel,
    TransmissionType: apiData.VehicleRegistration.TransmissionType,
    SeatingCapacity: apiData.VehicleRegistration.SeatingCapacity,
    FuelType: apiData.VehicleRegistration.FuelType,
    Co2Emissions: apiData.VehicleRegistration.Co2Emissions,
    Imported: apiData.VehicleRegistration.Imported,
    MvrisMakeCode: apiData.VehicleRegistration.MvrisMakeCode,
    PreviousVrmNi: apiData.VehicleRegistration.PreviousVrmNi,
    VinConfirmationFlag: apiData.VehicleRegistration.VinConfirmationFlag,
  };

  // Extract and simplify other key data points
  const otherVehicleData = {
    KerbWeight: apiData.Dimensions.KerbWeight,
    BodyStyle: apiData.SmmtDetails.BodyStyle,
    EuroStatus: apiData.General.EuroStatus,
    NumberOfDoors: apiData.SmmtDetails.NumberOfDoors,
    NumberOfAxles: apiData.Dimensions.NumberOfAxles,
  };

  return {
    vehicleRegistration,
    otherVehicleData
  };
};

/**
 * Fetches vehicle data from the new API and returns a normalized object.
 * @param {string} registrationNumber - The vehicle registration number (VRM).
 * @returns {Promise<object>} A promise that resolves to the normalized vehicle data.
 */
const fetchVehicleData = async (registrationNumber) => {
  if (!API_KEY) {
    throw new Error('API key is not set. Please provide the VEHICLE_API_KEY environment variable.');
  }

  try {
    // Corrected the URL path based on your API documentation example.
    const response = await axios.get(
      `${VEHICLE_API_URL}/vehicledata/ukvehicledata`, {
        params: {
          apikey: API_KEY, // The documentation uses 'apikey', so this is also updated.
          vrm: registrationNumber.toUpperCase()
        }
      }
    );

    const apiData = response.data;
    console.log('✅ [Vehicle API Response]', apiData);

    // Check for a valid response before normalizing
    if (!apiData || !apiData.VehicleRegistration?.Make) {
      throw new ErrorResponse('Vehicle not found or data is incomplete.', 404);
    }

    // Normalize the data to match our schema before returning
    return normalizeVehicleData(apiData);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch vehicle data.';

    console.error('❌ [Vehicle API Error]', {
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
