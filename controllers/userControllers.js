const User = require("../models/userModels");
const catchAsyncErrors = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const cloudinary = require("cloudinary");
const sendToken = require("../utils/jwtToken");
const userOTP = require('../models/userOtp');
const sendEmail = require('../utils/sendEmail');
const { sendWhatsAppMessage } = require('../utils/whatsapp');



// Send OTP via email

exports.sendOtpEmail = catchAsyncErrors(async (req, res, next) => {
  const { name, email, phoneNumber, countryCode, password } = req.body;

  if (!name || !email || !phoneNumber || !countryCode || !password) {
    return next(new ErrorHandler("Something is missing", 401));
  }

  // check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorHandler("User already exists", 401));
  }

  // 1️⃣ Generate 6-digit OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  // 2️⃣ Save OTP in DB (expires in 5 mins)
  await userOTP.create({ email, otp });

  // send OTP via email
  await sendEmail({
    email,
    subject: "OTP Verification",
    message: `<p>Your OTP code is: <b>${otp}</b>. It is valid for 5 minutes.</p>`
  });

  res.status(200).json({
    success: true,
    message: `OTP sent to ${email}`,
  });



})

// Send OTP via whatsapp

exports.serdOtpPhone = catchAsyncErrors(async (req, res, next) => {
  const { name, email, phoneNumber, countryCode, password } = req.body;

  if (!name || !email || !phoneNumber || !countryCode || !password) {
    return next(new ErrorHandler("Something is missing", 401));
  }

  const existingUser = await User.findOne({ phoneNumber });
  if (existingUser) {
    return next(new ErrorHandler("User already exists", 401));
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  const fullPhoneNumber = countryCode + phoneNumber;
  await userOTP.create({
    phoneNumber: fullPhoneNumber,
    otp
  });

  // Send OTP via WhatsApp
  const fullPhone = `${countryCode}${phoneNumber}`; // Example: +91 9876543210
  await sendWhatsAppMessage(fullPhone.replace("+", ""), `Your OTP is: ${otp}. It is valid for 5 minutes.`);

  res.status(200).json({
    success: true,
    message: `OTP sent to WhatsApp number ${fullPhone}`,
  });
})

// verify OTP

exports.verifyOTP = catchAsyncErrors(async (req, res, next) => {
  try {
    const { email, phoneNumber, otp, name, countryCode, password } = req.body;

    // validate request
    if ((!email && !phoneNumber) || !otp) {
      return res.status(400).json({ success: false, message: "Email or phone number with OTP is required" });
    }

    // normalize inputs
    const emailNorm = email ? String(email).trim().toLowerCase() : null;
    const otpStr = String(otp).trim();

    // normalize phone: keep only digits
    const phoneRaw = phoneNumber ? String(phoneNumber).replace(/[^\d]/g, "") : null;
    const ccDigits = countryCode ? String(countryCode).replace(/[^\d]/g, "") : null;

    // build candidate phone formats to try
    const candidates = new Set();
    if (phoneRaw) candidates.add(phoneRaw);                 // "6289547876"
    if (ccDigits && phoneRaw) candidates.add(ccDigits + phoneRaw); // "916289547876"
    if (ccDigits && phoneRaw) candidates.add("+" + ccDigits + phoneRaw); // "+916289547876"
    // sometimes phoneNumber already contains country code, include that raw
    if (phoneNumber && phoneNumber.startsWith("+")) candidates.add(phoneNumber.replace(/[^\d+]/g, ""));
    // convert Set to array
    const phoneCandidates = Array.from(candidates);

    console.log("[verifyOTP] inputs:", { email: emailNorm, phoneNumber, countryCode, otp: otpStr });
    console.log("[verifyOTP] phoneCandidates:", phoneCandidates);

    // Build OR query: try email match OR any of the phone candidate matches (either phoneNumber or fullPhoneNumber field)
    const orClauses = [];
    if (emailNorm) orClauses.push({ email: emailNorm, otp: otpStr });

    phoneCandidates.forEach((p) => {
      // try matching stored phoneNumber field
      orClauses.push({ phoneNumber: p, otp: otpStr });
      // try matching possible other field name if you used it earlier
      orClauses.push({ fullPhoneNumber: p, otp: otpStr });
      // try countryCode + phoneNumber if you stored countryCode separately
      if (ccDigits) orClauses.push({ countryCode: `+${ccDigits}`, phoneNumber: p.replace(/^\+/, ""), otp: otpStr });
    });

    if (orClauses.length === 0) {
      console.log("[verifyOTP] no orClauses built (should not happen)");
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    const query = { $or: orClauses };
    console.log("[verifyOTP] db query =>", JSON.stringify(query));

    // attempt to find the OTP doc
    const otpRecord = await userOTP.findOne(query).sort({ createdAt: -1 }).lean();
    console.log("[verifyOTP] otpRecord found =>", otpRecord);

    if (!otpRecord) {
      // extra debugging: show recent docs for these phone candidates or email
      const peekOr = [];
      if (emailNorm) peekOr.push({ email: emailNorm });
      phoneCandidates.forEach((p) => {
        peekOr.push({ phoneNumber: p });
        peekOr.push({ fullPhoneNumber: p });
      });
      const recent = peekOr.length ? await userOTP.find({ $or: peekOr }).sort({ createdAt: -1 }).limit(10).lean() : [];
      console.log("[verifyOTP] recent OTP docs for this user/email =>", recent);

      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Optional: check TTL/age (helpful for debugging)
    if (otpRecord.createdAt) {
      const ageSec = (Date.now() - new Date(otpRecord.createdAt).getTime()) / 1000;
      console.log(`[verifyOTP] otp created ${ageSec.toFixed(1)}s ago`);
    }

    // Upload profile image if present
    let profileImageUpload = null;
    if (req.files && req.files.profileImage && req.files.profileImage.tempFilePath) {
      profileImageUpload = await cloudinary.v2.uploader.upload(req.files.profileImage.tempFilePath, {
        folder: "whisp/profileImages",
        resource_type: "image",
        quality: "auto:best",
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      phoneNumber,
      countryCode,
      profileImage: profileImageUpload
        ? { public_id: profileImageUpload.public_id, url: profileImageUpload.secure_url }
        : null,
      password,
    });

    // delete only the exact OTP record we matched (safer)
    try {
      await userOTP.deleteOne({ _id: otpRecord._id });
      console.log("[verifyOTP] deleted otpRecord id:", otpRecord._id);
    } catch (delErr) {
      console.error("[verifyOTP] failed to delete otpRecord:", delErr);
    }

    // send token / success
    sendToken(user, 201, res);

  } catch (err) {
    console.error("[verifyOTP] unexpected error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});




// Login User
exports.loginUser = catchAsyncErrors(async (req, res, next) => {
  const { phoneNumber, password } = req.body;

  // Check if user is registered
  const user = await User.findOne({ phoneNumber }).select("+password");
  if (!user) {
    return next(new ErrorHandler("Invalid phone number or password", 401));
  }

  // Check if password is correct
  const isPasswordMatched = await user.comparePassword(password);
  if (!isPasswordMatched) {
    return next(new ErrorHandler("Invalid phone number or password", 401));
  }

  sendToken(user, 200, res);
});

// Logout User

exports.logout = catchAsyncErrors(async (req, res, next) => {
  res.cookie("token", null, {
    expires: new Date(Date.now()),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: "Logged out",
  });
})

// Get user details
exports.getUserDetails = catchAsyncErrors(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  res.status(200).json({
    success: true,
    user,
  });
})

// sync Contacts 

exports.syncContacts = catchAsyncErrors(async (req, res, next) => {
  try {
    const { contacts } = req.body; // array of phone numbers

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ success: false, message: "Contacts array required" });
    }

    // Clean and normalize all contacts
    const cleanedContacts = contacts.map(num =>
      num.replace(/[^0-9+]/g, "") // remove spaces, dashes, parentheses
    );

    // Fetch only the fields you need
    const users = await User.find().select("name phoneNumber countryCode email profileImage");

    // Match contacts
    const matchedUsers = users.filter(user => {
      const phoneStr = String(user.phoneNumber);
      const withCountry = `${user.countryCode}${phoneStr}`; // e.g. 916289547876
      const withoutCountry = phoneStr; // e.g. 6289547876

      return cleanedContacts.some(contact => {
        // Remove "+" in contact if present to match DB
        const normalizedContact = contact.startsWith("+")
          ? contact.slice(1)
          : contact;

        return (
          normalizedContact === withCountry ||
          normalizedContact === withoutCountry
        );
      });
    });

    res.status(200).json({
      success: true,
      count: matchedUsers.length,
      matchedUsers,
    });

  } catch (error) {
    console.error("Error syncing contacts:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
