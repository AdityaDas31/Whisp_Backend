const Chat = require('../models/chatModel');
const User = require('../models/userModels');
const catchAsyncErrors = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const Message = require('../models/messageModel');



// 1️⃣ Create or get a chat between two users
exports.accessChat = catchAsyncErrors(async (req, res, next) => {
    const { userId } = req.body; // id of the user you want to chat with

    if (!userId) {
        return next(new ErrorHandler("UserId param not sent with request", 400));
    }

    // find chat that already exists (non-group chat with both users)
    let chat = await Chat.findOne({
        isGroupChat: false,
        users: { $all: [req.user._id, userId] },
    })
        .populate("users", "-password")
        .populate("latestMessage");

    chat = await User.populate(chat, {
        path: "latestMessage.sender",
        select: "name email profileImage",
    });

    if (chat) {
        return res.status(200).json({ success: true, chat });
    }

    // if chat not exists → create new one
    const newChat = await Chat.create({
        chatName: "sender",
        isGroupChat: false,
        users: [req.user._id, userId],
    });

    const fullChat = await Chat.findById(newChat._id).populate("users", "-password");

    res.status(200).json({ success: true, chat: fullChat });
});

// 2️⃣ Fetch all chats of logged-in user
exports.fetchChats = catchAsyncErrors(async (req, res, next) => {
    try {
        let chats = await Chat.find({
            users: { $elemMatch: { $eq: req.user._id } },
        })
            .populate("users", "-password")
            .populate("groupAdmin", "-password")
            .populate("latestMessage")
            .sort({ updatedAt: -1 });

        chats = await User.populate(chats, {
            path: "latestMessage.sender",
            select: "name email profileImage",
        });

        // 🔥 ADD unreadCount per chat (backend-driven)
        const chatsWithUnread = await Promise.all(
            chats.map(async (chat) => {
                const unreadCount = await Message.countDocuments({
                    chat: chat._id,
                    sender: { $ne: req.user._id },
                    status: { $ne: "seen" },
                });

                return {
                    ...chat.toObject(),
                    unreadCount,
                };
            })
        );

        res.status(200).json({
            success: true,
            chats: chatsWithUnread,
        });
    } catch (error) {
        next(new ErrorHandler(error.message, 500));
    }
});



exports.createGroupChat = catchAsyncErrors(async (req, res, next) => {
    if (!req.body.users || !req.body.name) {
        return res.status(400).json({ message: "Please fill all the fields" });
    }

    let users = JSON.parse(req.body.users);
    if (users.length < 2) {
        return res
            .status(400)
            .json({ message: "More than 2 users are required to form a group chat" });
    }

    users.push(req.user);

    try {
        const groupChat = await Chat.create({
            chatName: req.body.name,
            users: users,
            isGroupChat: true,
            groupAdmin: req.user,
        });

        const fullGroupChat = await Chat.findById(groupChat._id)
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        res.status(200).json(fullGroupChat);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
})


exports.renameGroup = catchAsyncErrors(async (req, res, next) => {
    const { chatId, chatName } = req.body;

    try {
        const updatedChat = await Chat.findByIdAndUpdate(
            chatId,
            { chatName },
            { new: true }
        )
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        res.json(updatedChat);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
})

exports.addToGroup = catchAsyncErrors(async (req, res, next) => {
    const { chatId, userId } = req.body;

    try {
        const added = await Chat.findByIdAndUpdate(
            chatId,
            { $push: { users: userId } },
            { new: true }
        )
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        res.json(added);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
})

exports.removeFromGroup = catchAsyncErrors(async (req, res, next) => {
    const { chatId, userId } = req.body;

    try {
        const removed = await Chat.findByIdAndUpdate(
            chatId,
            { $pull: { users: userId } },
            { new: true }
        )
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        res.json(removed);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
})