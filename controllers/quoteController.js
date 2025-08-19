const User = require("../models/User");
const Quote = require("../models/Quote");
const { fetchVehicleData } = require("../utils/vehicleApiClient.js");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const sendResponse = require("../utils/sendResponse");
const sendEmail = require("../utils/emailService");
const ErrorResponse = require("../utils/errorResponse");
const Settings = require("../models/Settings");

// @desc Generate auto quote from reg number
// @route POST /api/quote/auto
// @access Private
exports.getQuote = catchAsyncErrors(async (req, res, next) => {
  const { regNumber } = req.body;
  const user = req.user;

  if (!regNumber) {
    return next(new ErrorResponse("Registration number is required.", 400));
  }

  const userId = user?._id;
  if (!userId) {
    return next(new ErrorResponse("Unauthorized. Please log in.", 401));
  }

  const reg = regNumber.trim().toUpperCase();

  // === STEP 1: Check if any accepted + collected quote exists
  const acceptedQuote = await Quote.findOne({
    userId,
    regNumber: reg,
    clientDecision: "accepted",
  }).sort({ createdAt: -1 });

  if (acceptedQuote) {
    const collected = acceptedQuote.collectionDetails?.collected;
    if (collected) {
      return sendResponse(res, 200, "You’ve already accepted and collected a quote for this vehicle.", {
        quote: acceptedQuote,
        status: "accepted_collected",
      });
    }

    return sendResponse(res, 200, "You’ve already accepted a quote. Pending collection.", {
      quote: acceptedQuote,
      status: "accepted_pending_collection",
    });
  }

  // === STEP 2: Check if auto quote exists
  const existingAutoQuote = await Quote.findOne({
    userId,
    regNumber: reg,
    type: "auto",
  });

  if (existingAutoQuote) {
    return sendResponse(res, 200, "You already have a quote for this vehicle.", {
      quote: existingAutoQuote,
      autoQuoteAvailable: !!existingAutoQuote.estimatedScrapPrice,
      status: "cached_quote",
    });
  }

  // === STEP 3: Check for a pending, reviewed, or rejected manual quote
  const existingManualQuote = await Quote.findOne({
    userId,
    regNumber: reg,
    type: "manual",
  }).sort({ createdAt: -1 });

  if (existingManualQuote) {
    const { isReviewedByAdmin, adminOfferPrice, clientDecision } = existingManualQuote;

    // Handle rejected case first
    if (clientDecision === 'rejected') {
      return sendResponse(res, 200, "Your previous manual quote was rejected. You can submit a new request.", {
        quote: existingManualQuote,
        status: "manual_previously_rejected",
      });
    }
    
    // Logic for pending review
    if (!isReviewedByAdmin) {
      return sendResponse(res, 200, "Your manual quote request is still under admin review.", {
        quote: existingManualQuote,
        status: "manual_pending_review",
      });
    }

    // Logic for reviewed but not decided
    if (isReviewedByAdmin && adminOfferPrice) {
      return sendResponse(res, 200, "A reviewed manual quote is awaiting your response.", {
        quote: existingManualQuote,
        status: "manual_reviewed",
      });
    }
  }

  // === STEP 4: Check user's remaining DVLA checks before fetching data
  if (user.checksLeft <= 0) {
    return sendResponse(res, 403, "You have exhausted your free DVLA checks. Please contact our support team to get more.", {
      status: "dvla_checks_exhausted",
    });
  }

  // === STEP 5: Fetch DVLA data
  const vehicle = await fetchVehicleData(reg);

  // The vehicle object is now nested. Access Vrm to check if the vehicle was found.
  if (!vehicle || !vehicle.vehicleRegistration?.Vrm) {
    return next(new ErrorResponse("Vehicle not found or invalid registration.", 404));
  }

  // === STEP 6: Decrement the DVLA check count and save the user
  user.checksLeft -= 1;
  await user.save({ validateBeforeSave: false });

  // === Get the dynamic scrap rate from the Settings model ===
  const settings = await Settings.findOne() || await Settings.create({});
  const scrapRatePerKg = settings.scrapRatePerKg;

  // Access the weight from the new nested object
  const weight = vehicle.otherVehicleData?.KerbWeight;
  const estimatedPrice = weight
    ? parseFloat((weight * scrapRatePerKg).toFixed(2))
    : null;

  // === STEP 7: Build auto quote using the new nested schema structure
  const quoteData = {
    userId,
    regNumber: vehicle.vehicleRegistration.Vrm,
    type: "auto",
    estimatedScrapPrice: estimatedPrice,
    dvlaFetchedAt: new Date(),
    // Assign the normalized vehicle data directly to the nested fields
    vehicleRegistration: vehicle.vehicleRegistration,
    otherVehicleData: vehicle.otherVehicleData,
  };

  // === STEP 8: Save or update auto quote
  const savedQuote = await Quote.findOneAndUpdate(
    { userId, regNumber: quoteData.regNumber, type: "auto" },
    { $set: quoteData },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const { _id, createdAt, ...safeFields } = savedQuote.toObject();

  return sendResponse(res, 200, "Quote generated successfully", {
    quote: {
      _id,
      ...safeFields,
      createdAt,
    },
    autoQuoteAvailable: !!estimatedPrice,
    status: "new_generated",
  });
});


// @desc    Submit a manual quote
// @route   POST /api/quote/manual-quote
// @access  Private
exports.submitManualQuote = catchAsyncErrors(async (req, res, next) => {
  const {
    regNumber,
    make,
    model,
    fuelType,
    year,
    wheelPlan,
    message,
    images,
    weight,
    userEstimatedPrice,
  } = req.body;

  const userId = req.user?._id;
  const userEmail = req.user?.email;
  const userPhone = req.user?.phone;
  const userName = `${req.user?.firstName} ${req.user?.lastName}`.trim();
  const userProvidedWeight = weight;

  if (!userId || !userEmail) {
    return next(new ErrorResponse("Unauthorized. Please log in.", 401));
  }

  if (!regNumber) {
    return next(new ErrorResponse("Registration number is required.", 400));
  }

  const reg = regNumber.trim().toUpperCase();

  // Step 1: Find existing quote
  const existingQuote = await Quote.findOne({ userId, regNumber: reg });

  if (!existingQuote) {
    return next(
      new ErrorResponse("No existing quote found for this vehicle. Please generate an auto-quote first.", 404)
    );
  }

  const {
    type,
    isReviewedByAdmin,
    clientDecision,
    collected,
  } = existingQuote;

  // === Step 2: Handle known cases and prevent further updates if the quote is in a state that disallows new manual requests ===
  
  const initialClientDecision = clientDecision;

  if (clientDecision === "accepted") {
    if (collected) {
      return sendResponse(res, 400, `Quote already accepted and collected for this vehicle.`, {
        quote: existingQuote,
        status: type === "auto" ? "auto_accepted_collected" : "manual_accepted_collected",
      });
    } else {
      return sendResponse(res, 400, `Quote already accepted for this vehicle. Pending collection.`, {
        quote: existingQuote,
        status: type === "auto" ? "auto_accepted_not_collected" : "manual_accepted_pending_collection",
      });
    }
  }

  if (type === "manual") {
    if (!isReviewedByAdmin && clientDecision === "pending") {
      return sendResponse(
        res,
        200,
        "Your manual quote request is already pending admin review. No further changes can be submitted at this time.",
        {
          quote: existingQuote,
          status: "manual_pending_review",
        }
      );
    }

    if (isReviewedByAdmin && clientDecision === "pending") {
      return sendResponse(
        res,
        200,
        "Your manual quote has been reviewed and is awaiting your decision. No further changes can be submitted at this time.",
        {
          quote: existingQuote,
          status: "manual_reviewed",
        }
      );
    }
  }

  // === Step 3: Update manual fields ===
  // Note: These fields are now being set on the nested 'vehicleRegistration' object
  if (!existingQuote.vehicleRegistration.Make && make) existingQuote.vehicleRegistration.Make = make;
  if (!existingQuote.vehicleRegistration.Model && model) existingQuote.vehicleRegistration.Model = model;
  if (!existingQuote.vehicleRegistration.FuelType && fuelType) existingQuote.vehicleRegistration.FuelType = fuelType;
  if (!existingQuote.vehicleRegistration.YearOfManufacture && year) existingQuote.vehicleRegistration.YearOfManufacture = year;
  if (!existingQuote.vehicleRegistration.WheelPlan && wheelPlan) existingQuote.vehicleRegistration.WheelPlan = wheelPlan;

  if (message) existingQuote.manualDetails.message = message;
  
  if (Array.isArray(req.files) && req.files.length > 0) {
    const uploadedImages = req.files.map(file => file.path);
    // Ensure we don't exceed 6 images, append new ones
    existingQuote.manualDetails.images = [...(existingQuote.manualDetails.images || []), ...uploadedImages].slice(0, 6);
  }

  if (userEstimatedPrice !== undefined)
    existingQuote.manualDetails.userEstimatedPrice = userEstimatedPrice;
  if (userProvidedWeight !== undefined)
    existingQuote.manualDetails.userProvidedWeight = userProvidedWeight;

  // === Step 4: Automatically determine manualQuoteReason and set type to manual ===
  let resolvedReason = "user_requested_review";

  if (!existingQuote.estimatedScrapPrice) {
    resolvedReason = "auto_price_missing";
  } else if (
    typeof userEstimatedPrice === "number" &&
    existingQuote.estimatedScrapPrice !== null && 
    userEstimatedPrice > existingQuote.estimatedScrapPrice
  ) {
    resolvedReason = "user_thinks_value_higher";
  }

  existingQuote.manualDetails.manualQuoteReason = resolvedReason;
  existingQuote.type = "manual"; 
  existingQuote.manualDetails.lastManualRequestAt = new Date();
  existingQuote.isReviewedByAdmin = false;
  existingQuote.clientDecision = "pending";
  existingQuote.adminOfferPrice = undefined;
  existingQuote.adminMessage = undefined;
  existingQuote.rejectionReason = undefined;
  existingQuote.rejectedAt = undefined;

  await existingQuote.save();

  // === Step 5: Send emails ===
  try {
    // User confirmation email
    await sendEmail({
      to: userEmail,
      subject: "📝 Manual Quote Request Received | sellyourcar.info",
      templateName: "clientConfirmation",
      templateData: {
        userName,
        userPhone: userPhone || "N/A",
        regNumber: reg,
        make: existingQuote.vehicleRegistration.Make || "N/A",
        model: existingQuote.vehicleRegistration.Model || "N/A",
        year: existingQuote.vehicleRegistration.YearOfManufacture || "N/A",
        userEstimatedPrice,
        userProvidedWeight,
        reason: resolvedReason,
      },
    });

    // Admin notification email
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `🔍 New Manual Quote Request: ${reg} - Review Required`,
      templateName: "manual-quote-admin",
      templateData: {
        userName,
        userPhone: userPhone || "N/A",
        userEmail,
        regNumber: reg,
        make: existingQuote.vehicleRegistration.Make || "N/A",
        model: existingQuote.vehicleRegistration.Model || "N/A",
        year: existingQuote.vehicleRegistration.YearOfManufacture || "N/A",
        userEstimatedPrice,
        userProvidedWeight,
        reason: resolvedReason,
        dashboardUrl: `${process.env.FRONTEND_URL}/dashboard/manual-quotes`,
        ourOfferPrice: existingQuote.estimatedScrapPrice,
        kerbWeight: existingQuote.otherVehicleData.KerbWeight 
      },
    });
    
  } catch (emailErr) {
    console.error("Failed to send manual quote emails:", emailErr.message);
  }

  // === Step 6: Return response ===
  const { _id, createdAt, ...safeFields } = existingQuote.toObject();

  const responseMessage = initialClientDecision === "rejected" 
    ? "Manual quote resubmitted successfully" 
    : "Manual quote submitted successfully";

  return sendResponse(res, 200, responseMessage, {
    quote: {
      _id,
      ...safeFields,
      createdAt,
    },
    status: "manual_info_appended",
  });
});





// @desc Confirm quote with collection details
// @route PATCH /api/quote/:id/confirm
// @access Private
exports.confirmQuoteWithCollection = catchAsyncErrors(
  async (req, res, next) => {
    const { id } = req.params;
    const { pickupDate, contactNumber, address } = req.body;

    // 1. Validate input
    if (!pickupDate || !contactNumber || !address) {
      return next(
        new ErrorResponse("All collection details are required.", 400)
      );
    }

    const pickupDateObj = new Date(pickupDate);
    if (isNaN(pickupDateObj) || pickupDateObj <= new Date()) {
      return next(new ErrorResponse("Pickup date must be in the future.", 400));
    }

    const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
    if (!phoneRegex.test(contactNumber)) {
      return next(new ErrorResponse("Invalid contact number format.", 400));
    }

    // 2. Find and validate quote
    const quote = await Quote.findOne({
      _id: id,
      userId: req.user._id,
    }).populate("userId");
    
    if (!quote) return next(new ErrorResponse("Quote not found", 404));

    if (quote.clientDecision === "accepted") {
      return next(
        new ErrorResponse("You have already accepted this quote.", 400)
      );
    }
    
    if (quote.collectionDetails?.pickupDate) {
      return next(
        new ErrorResponse("Collection details already submitted.", 400)
      );
    }

    // 3. Determine and save the final price
    const finalPrice = quote.type === "manual" && quote.adminOfferPrice 
      ? quote.adminOfferPrice 
      : quote.estimatedScrapPrice;

    // Set the final price and client decision before saving
    quote.clientDecision = "accepted";
    quote.acceptedAt = new Date(); // New line: Set the acceptedAt timestamp
    quote.collectionDetails = {
      pickupDate: pickupDateObj,
      contactNumber,
      address,
      collected: false,
    };
    quote.finalPrice = finalPrice; // Store the final price in the schema

    await quote.save();

    const client = quote.userId;

    // 4. Format pickup date and accepted date for display
    const formattedPickupDate = pickupDateObj.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Format the acceptedAt date with full date and time
    const formattedAcceptedAt = new Date(quote.acceptedAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    try {
      // 5. Send ADMIN EMAIL
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `🎉 Quote Accepted - ${quote.regNumber} - Collection Required`,
        templateName: "adminQuoteAccepted",
        templateData: {
          quoteType: quote.type,
          reg: quote.regNumber,
          // Accessing make and model from the nested vehicleRegistration object
          make: quote.vehicleRegistration.Make || "N/A",
          model: quote.vehicleRegistration.Model || "N/A",
          // Add the year of manufacture
          year: quote.vehicleRegistration.YearOfManufacture || "N/A",
          // Accessing weight from the nested otherVehicleData object
          weight: quote.otherVehicleData.KerbWeight || "N/A",
          price: finalPrice || "0",
          clientName: `${client.firstName} ${client.lastName}`,
          clientEmail: client.email,
          clientPhone: client.phone || "N/A",
          pickupDate: formattedPickupDate,
          acceptedAt: formattedAcceptedAt, // New line: Add the formatted accepted date
          address,
          collectionContact: contactNumber,
          // Add the dashboard URL for the button
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard/accepted-quotes`,
        },
      });

      // 6. Send CLIENT EMAIL
      await sendEmail({
        to: client.email,
        subject: "✅ Quote Confirmed - Collection Scheduled | sellyourcar.info",
        templateName: "quoteConfirmation", 
        templateData: {
          name: `${client.firstName} ${client.lastName}`,
          quoteType: quote.type,
          reg: quote.regNumber,
          // Accessing make and model from the nested vehicleRegistration object
          make: quote.vehicleRegistration.Make || "N/A",
          model: quote.vehicleRegistration.Model || "N/A",
          // Add the year of manufacture
          year: quote.vehicleRegistration.YearOfManufacture || "N/A",
          // Accessing weight from the nested otherVehicleData object
          weight: quote.otherVehicleData.KerbWeight || "N/A",
          price: finalPrice || "0",
          clientEmail: client.email,
          clientPhone: client.phone || "N/A",
          pickupDate: formattedPickupDate,
          address,
          contactNumber,
        },
      });

    } catch (emailError) {
      console.error("Failed to send confirmation emails:", emailError.message);
      // Don't fail the entire operation if email fails
    }

    // 7. Respond
    sendResponse(res, 200, "Quote accepted and collection details submitted", {
      quote,
    });
  }
);




// @desc    Get all pending manual quotes (admin only)
// @route   GET /api/admin/manual-quotes/pending
// @access  Admin
exports.getPendingManualQuotes = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const {
    customerName = "",
    customerEmail = "",
    customerPhone = "",
    regNumber = "",
    make = "",
    model = "",
  } = req.query;

  const matchStage = {
    type: "manual",
    isReviewedByAdmin: false,
    clientDecision: "pending",
  };

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        ...(customerName && {
          $or: [
            { "user.firstName": { $regex: customerName, $options: "i" } },
            { "user.lastName": { $regex: customerName, $options: "i" } },
          ],
        }),
        ...(customerEmail && {
          "user.email": { $regex: customerEmail, $options: "i" },
        }),
        ...(customerPhone && {
          "user.phone": { $regex: customerPhone, $options: "i" },
        }),
        // Now searching on the nested fields
        ...(regNumber && { regNumber: { $regex: regNumber, $options: "i" } }),
        ...(make && { "vehicleRegistration.Make": { $regex: make, $options: "i" } }),
        ...(model && { "vehicleRegistration.Model": { $regex: model, $options: "i" } }),
      },
    },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await Quote.aggregate(pipeline);
  const total = result[0]?.metadata[0]?.total || 0;
  const quotes = result[0]?.data || [];

  sendResponse(res, 200, "Pending manual quotes fetched successfully", {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    quotes,
  });
});

// @desc    Review a manual quote (admin only)
// @route   PATCH /api/admin/manual-quotes/:id/review
// @access  Admin
exports.reviewManualQuote = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { adminOfferPrice, adminMessage } = req.body;

  if (!adminOfferPrice) {
    return next(
      new ErrorResponse(
        "Admin offer price is required.",
        400
      )
    );
  }

  const quote = await Quote.findById(id).populate("userId");

  if (!quote || quote.type !== "manual") {
    return next(new ErrorResponse("Manual quote not found.", 404));
  }

  if (quote.clientDecision !== "pending" || quote.isReviewedByAdmin) {
    return next(new ErrorResponse("This manual quote has already been reviewed or a decision has been made.", 400));
  }

  quote.adminOfferPrice = adminOfferPrice;
  if (adminMessage) {
    quote.adminMessage = adminMessage;
  } else {
    quote.adminMessage = undefined;
  }
  quote.isReviewedByAdmin = true;
  quote.reviewedAt = new Date();
  quote.finalPrice = adminOfferPrice; 
  await quote.save();

  if (quote.userId && quote.userId.email) {
    const clientName = `${quote.userId.firstName} ${quote.userId.lastName}`;

    try {
      await sendEmail({
        to: quote.userId.email,
        subject: "🎯 Your Manual Quote is Ready! | sellyourcar.info",
        templateName: "manualQuoteReviewed",
        templateData: {
          name: clientName || "Valued Customer",
          regNumber: quote.regNumber,
          // Accessing make, model, year from the new nested object
          make: quote.vehicleRegistration.Make || "N/A",
          model: quote.vehicleRegistration.Model || "N/A",
          year: quote.vehicleRegistration.YearOfManufacture || "N/A",
          // Accessing weight from the new nested object
          weight: quote.otherVehicleData.KerbWeight || null,
          userEstimatedPrice: quote.manualDetails.userEstimatedPrice || null,
          adminOfferPrice,
          adminMessage,
          dashboardLink: `${process.env.FRONTEND_URL}`,
        },
      });
    } catch (emailError) {
      console.error("Failed to send manual quote reviewed email:", emailError.message);
    }
  }

  sendResponse(res, 200, "Manual quote reviewed and user notified.", {
    quote,
  });
});


// @desc    Get all accepted quotes (manual or auto)
// @route   GET /api/admin/quotes/accepted
// @access  Admin
exports.getAcceptedQuotes = catchAsyncErrors(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    type,
    regNumber = "",
    make = "",
    model = "",
    customerName = "",
    customerEmail = "",
    customerPhone = "",
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const matchStage = {
    clientDecision: "accepted",
    "collectionDetails.collected": false,
  };

  if (type && type !== "all") {
    matchStage.type = type;
  }

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
  ];

  const searchConditions = [];

  if (regNumber.trim() !== "") {
    searchConditions.push({ regNumber: { $regex: regNumber, $options: "i" } });
  }

  // Now searching on the nested fields
  if (make.trim() !== "") {
    searchConditions.push({ "vehicleRegistration.Make": { $regex: make, $options: "i" } });
  }

  // Now searching on the nested fields
  if (model.trim() !== "") {
    searchConditions.push({ "vehicleRegistration.Model": { $regex: model, $options: "i" } });
  }

  if (customerName.trim() !== "") {
    const nameRegex = new RegExp(customerName, "i");
    searchConditions.push({
      $or: [
        { "user.firstName": nameRegex },
        { "user.lastName": nameRegex },
        { fullName: nameRegex }, 
      ],
    });
  }

  if (customerEmail.trim() !== "") {
    searchConditions.push({
      "user.email": { $regex: customerEmail, $options: "i" },
    });
  }

  if (customerPhone.trim() !== "") {
    searchConditions.push({
      "user.phone": { $regex: customerPhone, $options: "i" },
    });
  }

  if (searchConditions.length > 0) {
    pipeline.push({
      $match: { $and: searchConditions },
    });
  }

  const totalPipeline = [...pipeline, { $count: "total" }];
  const totalResult = await Quote.aggregate(totalPipeline);
  const total = totalResult[0]?.total || 0;

  pipeline.push(
    { $sort: { updatedAt: -1, createdAt: -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) },

    {
      $set: {
        user: {
          _id: "$user._id",
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          email: "$user.email",
          phone: "$user.phone",
        },
      },
    }
  );

  const quotes = await Quote.aggregate(pipeline);

  sendResponse(res, 200, "Accepted quotes fetched successfully", {
    total,
    page: Number(page),
    totalPages: Math.ceil(total / limit),
    quotes,
  });
});



// @desc    Mark a quote as collected (admin only)
// @route   PATCH /api/quote/:id/mark-collected
// @access  Admin
exports.markAsCollected = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const quote = await Quote.findById(id);
  if (!quote) {
    return next(new ErrorResponse("Quote not found.", 404));
  }

  if (!quote.collectionDetails || quote.clientDecision !== "accepted") {
    return next(
      new ErrorResponse(
        "Collection details not available or quote not accepted.",
        400
      )
    );
  }

  quote.collectionDetails.collected = true;
  await quote.save();

  sendResponse(res, 200, "Quote marked as collected successfully", { quote });
});


// @desc    Client rejects a reviewed quote offer
// @route   PATCH /api/quote/:id/reject
// @access  Private
exports.rejectQuote = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;

  const quote = await Quote.findOne({
    _id: id,
    userId: req.user._id,
  }).populate("userId");

  if (!quote) {
    return next(new ErrorResponse("Quote not found.", 404));
  }
  
  if (quote.clientDecision === "accepted") {
    return next(new ErrorResponse("This quote has already been accepted and cannot be rejected.", 400));
  }
  
  if (quote.type !== 'manual') {
    return next(new ErrorResponse("Only manual quotes can be rejected by the client.", 400));
  }

  if (!quote.isReviewedByAdmin) {
    return next(new ErrorResponse("This quote has not yet been reviewed and cannot be rejected.", 400));
  }

  if (!rejectionReason || rejectionReason.trim() === '') {
    return next(new ErrorResponse("A reason for rejection is required.", 400));
  }

  quote.clientDecision = "rejected";
  quote.rejectionReason = rejectionReason;
  quote.rejectedAt = new Date();
  await quote.save();

  const client = quote.userId;
  // This now checks the new adminOfferPrice field first for manual quotes, falling back to auto price.
  const price = quote.adminOfferPrice || quote.estimatedScrapPrice; 

  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `❌ Quote Rejected - ${quote.regNumber}`,
      templateName: "adminQuoteRejected",
      templateData: {
        quoteType: quote.type,
        reg: quote.regNumber,
        // Accessing make, model, weight from the nested objects
        make: quote.vehicleRegistration.Make || "N/A",
        model: quote.vehicleRegistration.Model || "N/A",
        weight: quote.otherVehicleData.KerbWeight || "N/A",
        price: price || "0",
        rejectionReason: quote.rejectionReason,
        clientName: `${client.firstName} ${client.lastName}`,
        clientEmail: client.email,
        clientPhone: client.phone || "N/A",
      },
    });
  } catch (emailError) {
    console.error("Failed to send rejection email:", emailError.message);
  }

  sendResponse(res, 200, "Quote successfully rejected.", { quote });
});
