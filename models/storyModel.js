const mongoose = require("mongoose");

const storySchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },

    // media is optional (not needed for text status)
    media: {
        url: {
            type: String,
            default: null,
        },

        publicId: {
            type: String,
            default: null,
        },

        format: {
            type: String,
            enum: ["image", "video", "audio", "document", "text"],
            required: true,
        },
    },

    // caption OR text content
    caption: {
        type: String,
        default: "",
        maxlength: 1000,
    },

    // optional text status styling
    textStyle: {
        backgroundColor: {
            type: String,
            default: null,
        },
        textColor: {
            type: String,
            default: null,
        },
        font: {
            type: String,
            default: null,
        },
    },

    viewers: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true
            },
            viewedAt: {
                type: Date,
                default: Date.now,
            },
        },
    ],

    privacy: {
        type: String,
        enum: [
            "public",          // everyone
            "contacts",        // only contacts
            "only",            // only selected users
            "except",          // everyone except selected
        ],
        default: "public",
    },


    allowedUsers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }
    ],


    excludedUsers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }
    ],


    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },

    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },

});

// for fast queries
storySchema.index({ userId: 1, expiresAt: 1, createdAt: -1 });

storySchema.index({ expiresAt: 1 });


module.exports = mongoose.model("Story", storySchema);
