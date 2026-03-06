const mongoose = require("mongoose");

const callLogSchema = new mongoose.Schema({
    callId: {
        type: String,
        required: true,
        index: true,
    },
    callerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },

    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    type: {
        type: String,
        enum: ["voice", "video"],
        default: "voice",
    },

    status: {
        type: String,
        enum: [
            "ringing",
            "connected",
            "completed",
            "rejected",
            "missed",
        ],
        default: "ringing",
    },
    startedAt: {
      type: Date,
    },

    endedAt: {
      type: Date,
    },

    duration: {
      type: Number,
      default: 0,
      min: 0
    },
},
{ timestamps: true }
);

module.exports = mongoose.model("CallLog", callLogSchema);