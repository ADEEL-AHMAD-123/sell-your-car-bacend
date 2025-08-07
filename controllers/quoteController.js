const User = require("../models/User");
const Quote = require("../models/Quote");
const { fetchVehicleData } = require("../utils/dvlaClient");
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

  // === STEP 3: Check for a pending or reviewed manual quote
  const existingManualQuote = await Quote.findOne({
    userId,
    regNumber: reg,
    type: "manual",
  }).sort({ createdAt: -1 });

  if (existingManualQuote) {
    const { isReviewedByAdmin, adminOfferPrice } = existingManualQuote;

    if (!isReviewedByAdmin || !adminOfferPrice) {
      return sendResponse(res, 200, "Your manual quote request is still under admin review.", {
        quote: existingManualQuote,
        status: "manual_pending_review",
      });
    }

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

  if (!vehicle || !vehicle.registrationNumber) {
    return next(new ErrorResponse("Vehicle not found or invalid registration.", 404));
  }

  // === STEP 6: Decrement the DVLA check count and save the user
  user.checksLeft -= 1;
  await user.save({ validateBeforeSave: false });

  // === Get the dynamic scrap rate from the Settings model ===
  const settings = await Settings.findOne() || await Settings.create({});
  const scrapRatePerKg = settings.scrapRatePerKg;
  
  const weight = vehicle.revenueWeight;
  const estimatedPrice = weight
    ? parseFloat((weight * scrapRatePerKg).toFixed(2))
    : null;

  // === STEP 7: Build auto quote
  const quoteData = {
    regNumber: vehicle.registrationNumber,
    make: vehicle.make || undefined,
    model: vehicle.model || undefined,
    fuelType: vehicle.fuelType || undefined,
    co2Emissions: vehicle.co2Emissions || undefined,
    colour: vehicle.colour || undefined,
    year: vehicle.yearOfManufacture || undefined,
    engineCapacity: vehicle.engineCapacity || undefined,
    revenueWeight: vehicle.revenueWeight || undefined,
    taxStatus: vehicle.taxStatus || undefined,
    motStatus: vehicle.motStatus || undefined,
    euroStatus: vehicle.euroStatus || undefined,
    realDrivingEmissions: vehicle.realDrivingEmissions || undefined,
    wheelPlan: vehicle.wheelplan || undefined,
    typeApproval: vehicle.typeApproval || undefined,
    markedForExport: vehicle.markedForExport !== undefined ? vehicle.markedForExport : undefined,
    dateOfLastV5CIssued: vehicle.dateOfLastV5CIssued || undefined,
    taxDueDate: vehicle.taxDueDate || undefined,
    artEndDate: vehicle.artEndDate || undefined,
    estimatedScrapPrice: estimatedPrice,
    type: "auto",
    dvlaFetchedAt: new Date(),
    userId,
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
    // If no existing quote (auto or manual) is found, it means the user is trying
    // to submit a manual quote for a vehicle that hasn't gone through the auto-quote flow.
    // This scenario should ideally be handled by first generating an auto quote.
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

  // Priority 1: Handle accepted/collected states first, as these are terminal states.
  if (clientDecision === "accepted") {
    if (collected) {
      // Both auto and manual accepted and collected quotes are final.
      return sendResponse(res, 400, `Quote already accepted and collected for this vehicle.`, {
        quote: existingQuote,
        status: type === "auto" ? "auto_accepted_collected" : "manual_accepted_collected",
      });
    } else {
      // Both auto and manual accepted but not yet collected quotes are also final for new manual requests.
      return sendResponse(res, 400, `Quote already accepted for this vehicle. Pending collection.`, {
        quote: existingQuote,
        status: type === "auto" ? "auto_accepted_not_collected" : "manual_accepted_pending_collection",
      });
    }
  }

  // Priority 2: Handle manual quotes that are pending review or reviewed.
  // This ensures that if a manual quote is already in progress, a new manual request isn't processed.
  if (type === "manual") {
    if (!isReviewedByAdmin && clientDecision === "pending") {
      // Manual quote already requested, pending admin review.
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
      // Manual quote reviewed by admin, awaiting client decision.
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
    // If a manual quote was rejected, it would fall through to Step 3 to allow re-submission/update.
    // The `clientDecision` would be 'rejected' in that case, so the above `pending` checks wouldn't match.
  }

  // === Step 3: Update manual fields ===
  // This section will only be reached if:
  // 1. An auto quote exists and is NOT accepted/collected.
  // 2. A manual quote exists and was previously rejected (allowing re-submission/update).

  // Only update fields if they are not already present (for initial population from manual input)
  // or if a new message/images are provided.
  // Note: If the user provides `make`, `model`, etc., they will only be updated if the existing quote
  // does NOT already have these fields populated (e.g., from DVLA data).
  if (!existingQuote.make && make) existingQuote.make = make;
  if (!existingQuote.model && model) existingQuote.model = model;
  if (!existingQuote.fuelType && fuelType) existingQuote.fuelType = fuelType;
  if (!existingQuote.year && year) existingQuote.year = year;
  if (!existingQuote.wheelPlan && wheelPlan) existingQuote.wheelPlan = wheelPlan;

  if (message) existingQuote.message = message;

  if (Array.isArray(req.files) && req.files.length > 0) {
    const uploadedImages = req.files.map(file => file.path);
    // Ensure we don't exceed 6 images, append new ones
    existingQuote.images = [...(existingQuote.images || []), ...uploadedImages].slice(0, 6);
  }

  if (userEstimatedPrice !== undefined)
    existingQuote.userEstimatedPrice = userEstimatedPrice;
  if (userProvidedWeight !== undefined)
    existingQuote.userProvidedWeight = userProvidedWeight;

  // === Step 4: Automatically determine manualQuoteReason and set type to manual ===
  let resolvedReason = "user_requested_review";

  if (!existingQuote.estimatedScrapPrice) {
    resolvedReason = "auto_price_missing";
  } else if (
    typeof userEstimatedPrice === "number" &&
    existingQuote.estimatedScrapPrice !== null && // Ensure estimatedScrapPrice is not null before comparison
    userEstimatedPrice > existingQuote.estimatedScrapPrice
  ) {
    resolvedReason = "user_thinks_value_higher";
  }

  existingQuote.manualQuoteReason = resolvedReason;
  existingQuote.type = "manual"; // Explicitly set to manual as it's now a manual request
  existingQuote.lastManualRequestAt = new Date();
  existingQuote.isReviewedByAdmin = false; // Reset admin review status for new manual request
  existingQuote.clientDecision = "pending"; // Reset client decision to pending for new manual request
  existingQuote.adminOfferPrice = undefined; // Clear previous admin offer
  existingQuote.adminMessage = undefined; // Clear previous admin message
  existingQuote.rejectionReason = undefined; // Clear previous rejection reason if re-submitting

  await existingQuote.save(); // Mongoose will automatically update the `updatedAt` timestamp here.

  // === Step 5: Send emails ===
  try {
    // User confirmation email
    await sendEmail({
      to: userEmail,
      subject: "📝 Manual Quote Request Received | SellYourCar.co.uk",
      templateName: "clientConfirmation",
      templateData: {
        userName,
        userPhone: userPhone || "N/A",
        regNumber: reg,
        make: existingQuote.make || "N/A",
        model: existingQuote.model || "N/A",
        year: existingQuote.year || "N/A",
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
        make: existingQuote.make || "N/A",
        model: existingQuote.model || "N/A",
        year: existingQuote.year || "N/A",
        userEstimatedPrice,
        userProvidedWeight,
        reason: resolvedReason,
        dashboardUrl: `${process.env.FRONTEND_URL}/admin/manual-quotes`,
      },
    });
    
  } catch (emailErr) {
    console.error("Failed to send manual quote emails:", emailErr.message);
  }

  // === Step 6: Return response ===
  const { _id, createdAt, ...safeFields } = existingQuote.toObject();

  return sendResponse(res, 200, "Manual quote submitted successfully", {
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

    if (quote.clientDecision !== "pending") {
      return next(
        new ErrorResponse("You have already responded to this quote.", 400)
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
    quote.collectionDetails = {
      pickupDate: pickupDateObj,
      contactNumber,
      address,
      collected: false,
    };
    quote.finalPrice = finalPrice; // Store the final price in the schema

    await quote.save();

    const client = quote.userId;

    // 4. Format pickup date for display
    const formattedPickupDate = pickupDateObj.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
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
          make: quote.make || "N/A",
          model: quote.model || "N/A",
          weight: quote.revenueWeight || "N/A",
          price: finalPrice || "0",
          clientName: `${client.firstName} ${client.lastName}`,
          clientEmail: client.email,
          clientPhone: client.phone || "N/A",
          pickupDate: formattedPickupDate,
          address,
          collectionContact: contactNumber,
        },
      });

      // 6. Send CLIENT EMAIL
      await sendEmail({
        to: client.email,
        subject: "✅ Quote Confirmed - Collection Scheduled | SellYourCar.co.uk",
        templateName: "quoteConfirmation", 
        templateData: {
          name: `${client.firstName} ${client.lastName}`,
          quoteType: quote.type,
          reg: quote.regNumber,
          make: quote.make || "N/A",
          model: quote.model || "N/A",
          weight: quote.revenueWeight || "N/A",
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
    type: "manual", // Only manual
    isReviewedByAdmin: false,
    clientDecision: "pending",
  };

  const pipeline = [
    { $match: matchStage },

    // Join user data
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    // Search stage (each field filters only its own)
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
        ...(regNumber && { regNumber: { $regex: regNumber, $options: "i" } }),
        ...(make && { make: { $regex: make, $options: "i" } }),
        ...(model && { model: { $regex: model, $options: "i" } }),
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

  if (!adminOfferPrice || !adminMessage) {
    return next(
      new ErrorResponse(
        "Both adminOfferPrice and adminMessage are required.",
        400
      )
    );
  }

  const quote = await Quote.findById(id).populate("userId");

  if (!quote || quote.type !== "manual") {
    return next(new ErrorResponse("Manual quote not found.", 404));
  }

  // === Added check: Ensure quote is still pending client decision and not already reviewed ===
  if (quote.clientDecision !== "pending" || quote.isReviewedByAdmin) {
    return next(new ErrorResponse("This manual quote has already been reviewed or a decision has been made.", 400));
  }

  // Update quote details
  quote.adminOfferPrice = adminOfferPrice;
  quote.adminMessage = adminMessage;
  quote.isReviewedByAdmin = true;
  quote.reviewedAt = new Date();
  quote.finalPrice = adminOfferPrice; // Set final price when admin reviews a manual quote
  await quote.save();

  // Send email to user if email exists
  if (quote.userId && quote.userId.email) {
    const clientName = `${quote.userId.firstName} ${quote.userId.lastName}`;

    try {
      await sendEmail({
        to: quote.userId.email,
        subject: "🎯 Your Manual Quote is Ready! | SellYourCar.co.uk",
        templateName: "manualQuoteReviewed",
        templateData: {
          name: clientName || "Valued Customer",
          regNumber: quote.regNumber,
          make: quote.make || "N/A",
          model: quote.model || "N/A",
          year: quote.year || "N/A",
          weight: quote.revenueWeight || null,
          userEstimatedPrice: quote.userEstimatedPrice || null,
          adminOfferPrice,
          adminMessage,
          dashboardLink: `${process.env.FRONTEND_URL}/quote-result`,
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

  // Apply type filter if specified
  if (type && type !== "all") {
    matchStage.type = type;
  }

  // Initial pipeline with match
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

  // Build additional search conditions
  const searchConditions = [];

  if (regNumber.trim() !== "") {
    searchConditions.push({ regNumber: { $regex: regNumber, $options: "i" } });
  }

  if (make.trim() !== "") {
    searchConditions.push({ make: { $regex: make, $options: "i" } });
  }

  if (model.trim() !== "") {
    searchConditions.push({ model: { $regex: model, $options: "i" } });
  }

  if (customerName.trim() !== "") {
    const nameRegex = new RegExp(customerName, "i");
    searchConditions.push({
      $or: [
        { "user.firstName": nameRegex },
        { "user.lastName": nameRegex },
        { fullName: nameRegex }, // optional
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

  // Add search conditions if any
  if (searchConditions.length > 0) {
    pipeline.push({
      $match: { $and: searchConditions },
    });
  }

  // Count total
  const totalPipeline = [...pipeline, { $count: "total" }];
  const totalResult = await Quote.aggregate(totalPipeline);
  const total = totalResult[0]?.total || 0;

  // Add pagination, sorting, projection
  pipeline.push(
    { $sort: { updatedAt: -1, createdAt: -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) },
    {
      $project: {
        _id: 1,
        regNumber: 1,
        make: 1,
        model: 1,
        type: 1,
        clientDecision: 1,
        collectionDetails: 1,
        createdAt: 1,
        updatedAt: 1,
        user: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phone: 1,
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
  const { rejectionReason } = req.body; // Destructure the rejectionReason from the body

  // Find the quote for the logged-in user
  const quote = await Quote.findOne({
    _id: id,
    userId: req.user._id,
  });

  if (!quote) {
    return next(new ErrorResponse("Quote not found.", 404));
  }
  
  // New validation: Only manual quotes can be rejected
  if (quote.type !== 'manual') {
    return next(new ErrorResponse("Only manual quotes can be rejected by the client.", 400));
  }
  
  // New validation: A rejection reason is required
  if (!rejectionReason || rejectionReason.trim() === '') {
    return next(new ErrorResponse("A reason for rejection is required.", 400));
  }

  // Check if the quote is in a state where it can be rejected
  if (quote.clientDecision !== "pending" || !quote.isReviewedByAdmin) {
    return next(new ErrorResponse("This quote cannot be rejected.", 400));
  }

  // Update the clientDecision field and store the reason
  quote.clientDecision = "rejected";
  quote.rejectionReason = rejectionReason; // Save the rejection reason to the document
  await quote.save();

  // later we will send an email to the admin here to notify them
  // that a manual quote offer was rejected.

  sendResponse(res, 200, "Quote successfully rejected.", { quote });
});
