const Message = require("../models/messageModel");
const Chat = require("../models/chatModel");
const User = require("../models/userModels");
const catchAsyncErrors = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const cloudinary = require("cloudinary");

// 3️⃣ Send a message
exports.sendMessage = catchAsyncErrors(async (req, res, next) => {
    const { content, chatId, type, location, contact, poll } = req.body;

    if (!chatId) {
        return next(new ErrorHandler("ChatId is required", 400));
    }

    // 1️⃣ Fetch chat and users
    const chat = await Chat.findById(chatId).populate("users", "_id");
    if (!chat) {
        return next(new ErrorHandler("Chat not found", 404));
    }

    // 2️⃣ Determine receivers (exclude sender)
    const receivers = chat.users
        .map(u => u._id.toString())
        .filter(id => id !== req.user._id.toString());

    if (receivers.length === 0) {
        return next(new ErrorHandler("No receivers found", 400));
    }

    let newMessage = {
        sender: req.user._id,
        chat: chatId,
        type: type || "text",

        receivers,        // 🔥 pending delivery
        deliveredTo: [],  // will be filled by ACK
        seenBy: [],
    };

    if (type === "text") {
        if (!content) return next(new ErrorHandler("Content required for text message", 400));
        newMessage.content = content;
    }

    if (type === "location" && location) {
        newMessage.location = location;
    }

    if (type === "contact" && contact) {
        newMessage.contact = contact;
    }

    if (type === "poll" && poll) {
        newMessage.poll = poll;
    }

    if (type === "media" && req.files?.file) {
        const file = req.files.file;

        // Upload to cloudinary
        const upload = await cloudinary.v2.uploader.upload(file.tempFilePath, {
            folder: "whisp/chat_media",
            resource_type: "auto", // handles image, video, pdf, etc.
        });

        newMessage.media = {
            url: upload.secure_url,
            publicId: upload.public_id,
            format: upload.resource_type, // "image" / "video" / "raw"
        };
    }

    // 6️⃣ Save TEMP message
    let message = await Message.create(newMessage);

    // 7️⃣ Populate (for socket payload)
    message = await message.populate("sender", "name profileImage");
    message = await message.populate("chat");

    // ⚠️ DO NOT treat DB as history anymore
    // latestMessage can remain (for chat list preview only)
    await Chat.findByIdAndUpdate(chatId, {
        latestMessage: message._id,
    });

    // Send push notification
    try {
        const chat = await Chat.findById(chatId).populate("users", "expoPushToken _id");
        const recipients = chat.users.filter(u => u._id.toString() !== req.user._id.toString());

        for (let recipient of recipients) {
            if (recipient.expoPushToken) {
                await fetch("https://exp.host/--/api/v2/push/send", {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Accept-encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        to: recipient.expoPushToken,
                        sound: "default",
                        title: `${message.sender.name}`,
                        body: message.type === "text" ? message.content : "📎 Sent you a file",
                        // data: { chatId: chatId },
                        data: {
                            chatId: chatId,
                            senderId: message.sender._id,
                            senderName: message.sender.name,
                            profileImage: message.sender.profileImage?.url,
                        },
                        image: message.sender.profileImage?.url,
                    }),
                });
            }
        }
    } catch (err) {
        console.error("❌ Push notification error:", err.message);
    }

    res.status(200).json({
        success: true,
        message,
    });

});




// 4️⃣ Get all messages for a chat
exports.allMessages = catchAsyncErrors(async (req, res, next) => {
    try {
        const messages = await Message.find({ chat: req.params.chatId })
            .populate("sender", "name profileImage email")
            .populate("chat");

        res.status(200).json({ success: true, messages });
    } catch (error) {
        next(new ErrorHandler(error.message, 500));
    }
});

// 5️⃣ Delete message

exports.deleteMessage = catchAsyncErrors(async (req, res, next) => {

    const { messageId } = req.params;

    const message = await Message.findById(messageId).populate("chat");

    if (!message) {
        return next(new ErrorHandler("Message not found", 404));
    }

    const chat = await Chat.findById(message.chat._id);

    const isSender =
        message.sender.toString() === req.user._id.toString();

    const isAdmin =
        chat.groupAdmins?.some(
            admin => admin.toString() === req.user._id.toString()
        );

    // permission rules
    if (chat.isGroupChat) {

        if (!isSender && !isAdmin) {
            return next(new ErrorHandler("Not allowed", 403));
        }

    } else {

        if (!isSender) {
            return next(new ErrorHandler("Not allowed", 403));
        }

    }

    // mark deleted
    message.deletedForEveryone = true;
    message.deletedBy = req.user._id;

    if (!isSender && isAdmin) {
        message.deletedByAdmin = true;
    }

    // remove payload
    message.content = null;
    message.media = null;
    message.location = null;
    message.contact = null;
    message.poll = null;
    message.payloadStripped = true;

    await message.save();

    // socket broadcast
    const io = req.app.get("io");

    if (io) {

        io.to(message.chat._id.toString()).emit(
            "message:deleted",
            {
                messageId,
                deletedBy: req.user._id,
                deletedByAdmin: message.deletedByAdmin,
                chatId: message.chat._id
            }
        );

    }

    res.status(200).json({
        success: true,
        messageId,
    });

});