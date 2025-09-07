const monsgoose = require('mongoose');

const userOtpSchema = new monsgoose.Schema({
    email: {
        type: String,
    },
    phoneNumber:{
        type: String,
    },
    otp: {
        type: String,
        require: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300, // OTP will auto-delete after 5 minutes
    },
},

);


module.exports = monsgoose.model("userOTP", userOtpSchema);