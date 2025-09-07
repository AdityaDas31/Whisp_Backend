const Message = require("../models/messageModel");
const Chat = require("../models/chatModel");
const User = require("../models/userModels");
const catchAsyncErrors = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");



// 3️⃣ Send a message
exports.sendMessage = catchAsyncErrors(async (req, res, next) => {
    const { content, chatId } = req.body;

    if (!content || !chatId) {
        return next(new ErrorHandler("Invalid data passed into request", 400));
    }

    let newMessage = {
        sender: req.user._id,
        content: content,
        chat: chatId,
        status: "sent"
    };

    try {
        let message = await Message.create(newMessage);

        message = await message.populate("sender", "name profileImage");
        message = await message.populate("chat");
        message = await User.populate(message, {
            path: "chat.users",
            select: "name profileImage email",
        });

        // update chat latestMessage
        await Chat.findByIdAndUpdate(req.body.chatId, { latestMessage: message });

        res.status(200).json({ success: true, message });
    } catch (error) {
        next(new ErrorHandler(error.message, 500));
    }
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

// 5️⃣ Mark message(s) as read

exports.markAsRead = catchAsyncErrors(async (req, res, next) => {
    const { chatId } = req.body;

    if (!chatId) {
        return next(new ErrorHandler("chatId is required", 400));
    }

    try {
        // Mark all messages in this chat as read by the current user
        const updated = await Message.updateMany(
            { chat: chatId, readBy: { $ne: req.user._id } }, // only unread for this user
            { $addToSet: { readBy: req.user._id } } // push if not exists
        );

        res.status(200).json({ success: true, updatedCount: updated.modifiedCount });
    } catch (error) {
        next(new ErrorHandler(error.message, 500));
    }
});

exports.deleteMessage = catchAsyncErrors(async (req, res, next) => {
    const message = await Message.findById(req.params.id);

    if (!message) {
        return next(new ErrorHandler("Message not found", 404));
    }

    if (message.sender.toString() !== req.user._id.toString()) {
        return next(new ErrorHandler("You can only delete your own messages", 403));
    }

    await message.deleteOne();

    res.status(200).json({
        success: true,
        message: "Message deleted successfully",
    });
})

exports.updateMessage = catchAsyncErrors(async (req, res, next) => {
    const message = await Message.findById(req.params.id);

    if (!message) {
        return next(new ErrorHandler("Message not found", 404));
    }

    if (message.sender.toString() !== req.user._id.toString()) {
        return next(new ErrorHandler("You can only edit your own messages", 403));
    }

    message.content = req.body.content || message.content;
    await message.save();

    res.status(200).json({
        success: true,
        message,
    });
})