const express = require('express');
const { isAuthenticatedUser } = require("../middleware/auth");
const { reagisterUser, getUserDetails, loginUser, logout, verifyOTP, serdOtp, sendOtpEmail, serdOtpPhone, syncContacts, savePushToken } = require('../controllers/userControllers');

const router = express.Router();



router.route("/register").post(sendOtpEmail);
router.route("/register/phone").post(serdOtpPhone);
router.route("/register/verify").post(verifyOTP);
router.route("/login").post(loginUser);
router.route("/sync").post(isAuthenticatedUser, syncContacts);
router.route("/save-push-token").post(isAuthenticatedUser, savePushToken)

router.route("/profile").get(isAuthenticatedUser, getUserDetails);
router.route("/logout").get(logout);






module.exports = router;