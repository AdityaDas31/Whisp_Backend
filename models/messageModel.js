const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chat",
            required: true,
        },
        type: {
            type: String,
            enum: ["text", "location", "contact", "poll", "media"],
            default: "text",
        },
        content: {
            type: String,
            trim: true,
        },
        media: {
            url: String,        // Cloudinary URL
            publicId: String,   // Cloudinary public_id (for deletion if needed)
            format: String,     // image / video / audio / document
        },
        location: {
            latitude: Number,
            longitude: Number,
            link: String,
        },
        contact: {
            name: String,
            phoneNumber: String,
            email: String,
        },
        poll: {
            topic: String,
            options: [String],
            votes: [
                {
                    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                    optionIndex: Number,
                },
            ],
        },
        receivers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],

        deliveredTo: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],

        seenBy: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],
        payloadStripped: {
            type: Boolean,
            default: false,
        }
    },
    { timestamps: true }
);


module.exports = mongoose.model("Message", messageSchema);