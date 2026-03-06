const CallLog = require("../models/CallLogModel");
const catchAsyncErrors = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");


// ================= CREATE CALL =================
exports.createCall = catchAsyncErrors(async (req, res, next) => {

    const { callId, callerId, receiverId, type } = req.body;

    const call = await CallLog.create({
        callId,
        callerId,
        receiverId,
        type,
        status: "ringing",
    });

    res.status(201).json({
        success: true,
        call,
    });
});


// ================= ACCEPT CALL =================
exports.acceptCall = catchAsyncErrors(async (req, res, next) => {

    const { callId } = req.body;

    const call = await CallLog.findOneAndUpdate(
        { callId },
        {
            status: "connected",
            startedAt: new Date(),
        },
        { new: true }
    );

    if (!call) {
        return next(new ErrorHandler("Call not found", 404));
    }

    res.status(200).json({
        success: true,
        call,
    });
});


// ================= END CALL =================
exports.endCall = catchAsyncErrors(async (req, res, next) => {

    const { callId } = req.body;

    const call = await CallLog.findOne({ callId });

    if (!call) {
        return next(new ErrorHandler("Call not found", 404));
    }

    const endedAt = new Date();

    const duration = Math.floor(
        (endedAt - call.startedAt) / 1000
    );

    call.status = "completed";
    call.endedAt = endedAt;
    call.duration = duration;

    await call.save();

    res.status(200).json({
        success: true,
        call,
    });
});


// ================= REJECT CALL =================
exports.rejectCall = catchAsyncErrors(async (req, res, next) => {

    const { callId } = req.body;

    const call = await CallLog.findOneAndUpdate(
        { callId },
        {
            status: "rejected",
            endedAt: new Date(),
        },
        { new: true }
    );

    if (!call) {
        return next(new ErrorHandler("Call not found", 404));
    }

    res.status(200).json({
        success: true,
        call,
    });
});


// ================= GET CALL HISTORY =================
exports.getCallHistory = catchAsyncErrors(async (req, res, next) => {

    const { userId } = req.params;

    const calls = await CallLog.find({
        $or: [
            { callerId: userId },
            { receiverId: userId },
        ],
    })
        .populate("callerId", "name profileImage")
        .populate("receiverId", "name profileImage")
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        calls,
    });
});


// ================= DELETE CALL LOG =================
exports.deleteCallLog = catchAsyncErrors(async (req, res, next) => {

    const { callId } = req.params;

    const call = await CallLog.findOneAndDelete({ callId });

    if (!call) {
        return next(new ErrorHandler("Call log not found", 404));
    }

    res.status(200).json({
        success: true,
        message: "Call log deleted successfully",
    });
});