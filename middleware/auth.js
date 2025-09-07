const ErrorHandler = require("../utils/errorhandler");
const catchAsyncError = require("./catchAsyncError");
const jwt = require('jsonwebtoken');
const User = require("../models/userModels");

exports.isAuthenticatedUser = catchAsyncError(async (req, res, next) => {
    let token;

    // 1. First try to get token from cookie
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    // 2. Then check Authorization header if no cookie
    else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    const decodedData = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decodedData.id);
    next();
});

// exports.isAuthenticatedUserWeb = catchAsyncError(async (req, res, next) => {
//     const { token } = req.cookies;
//     if(!token){
//         return next(new ErrorHandler("Please Login to access this resource",401));
//     }
//     const decodeData = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = await User.findById(decodeData.id);
//     next();
// })


exports.authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(new ErrorHandler(`Role: ${req.user.role} is not allowed to access this resouce`, 403));
        }
        next();
    };
}