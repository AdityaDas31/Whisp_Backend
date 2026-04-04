const Chat = require('../models/chatModel');
const User = require('../models/userModels');
const catchAsyncErrors = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const Message = require('../models/messageModel');
const cloudinary = require("cloudinary");



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
            // .populate("groupAdmin", "-password")
            .populate("groupAdmins", "name profileImage email")
            .populate("leftUsers.user", "name profileImage")
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


// 3️⃣ Create a new group chat


exports.createGroupChat = catchAsyncErrors(async (req, res, next) => {

    try {

        const name = req.body.name;

        // parse string to array
        const users = JSON.parse(req.body.users);


        if (!name)
            return next(new ErrorHandler("Group name required", 400));

        if (!users || users.length < 2)
            return next(new ErrorHandler("Select at least 2 users", 400));


        let groupImage = null;


        if (req.files?.groupImage) {

            const upload = await cloudinary.v2.uploader.upload(

                req.files.groupImage.tempFilePath,

                {
                    folder: "whisp/group_images"
                }

            );

            groupImage = {

                url: upload.secure_url,
                publicId: upload.public_id

            };

        }


        const group = await Chat.create({

            chatName: name,

            isGroupChat: true,

            users: [...users, req.user._id],

            groupAdmins: [req.user._id],

            groupImage

        });


        const fullGroup = await Chat.findById(group._id)

            .populate("users", "name profileImage")

            .populate("groupAdmins", "name profileImage");


        res.status(201).json({

            success: true,
            chat: fullGroup

        });

    } catch (err) {

        console.log("GROUP CREATE ERROR:", err);

        res.status(500).json({

            success: false,
            message: err.message

        });

    }

});

// 4️⃣ Delete Group 


exports.deleteGroupChat = catchAsyncErrors(async (req, res, next) => {

    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {

        return next(
            new ErrorHandler(
                "Group not found",
                404
            )
        );

    }

    if (!chat.isGroupChat) {

        return next(
            new ErrorHandler(
                "Not a group chat",
                400
            )
        );

    }

    // ✅ FIXED
    const isAdmin =
        chat.groupAdmins.some(

            admin =>
                admin.toString()
                === req.user._id.toString()

        );

    if (!isAdmin) {

        return next(
            new ErrorHandler(
                "Only admin can delete group",
                403
            )
        );

    }

    // delete cloudinary image
    if (chat.groupImage?.publicId) {

        await cloudinary.v2.uploader.destroy(

            chat.groupImage.publicId

        );

    }

    // delete messages
    await Message.deleteMany({

        chat: chatId

    });

    // delete chat
    await Chat.findByIdAndDelete(

        chatId

    );

    res.status(200).json({

        success: true,
        message: "Group deleted"

    });

});


// make new admin 

exports.makeGroupAdmin = catchAsyncErrors(async (req, res, next) => {

    const { chatId, userId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {

        return next(
            new ErrorHandler("Group not found", 404)
        );

    }

    if (!chat.isGroupChat) {

        return next(
            new ErrorHandler("Not group chat", 400)
        );

    }

    // check requester is admin
    const isRequesterAdmin =
        chat.groupAdmins.some(

            admin =>
                admin.toString() ===
                req.user._id.toString()

        );

    if (!isRequesterAdmin) {

        return next(
            new ErrorHandler(
                "Only admin can add new admin",
                403
            )
        );

    }

    // check member exists
    const isMember =
        chat.users.some(

            u => u.toString() === userId

        );

    if (!isMember) {

        return next(
            new ErrorHandler(
                "User not in group",
                400
            )
        );

    }

    // already admin check
    const alreadyAdmin =
        chat.groupAdmins.some(

            admin =>
                admin.toString() === userId

        );

    if (alreadyAdmin) {

        return res.status(200).json({

            success: true,
            message: "Already admin"

        });

    }

    // add new admin
    chat.groupAdmins.push(userId);

    await chat.save();


    const updatedChat =
        await Chat.findById(chatId)

            .populate(
                "users",
                "name profileImage"
            )

            .populate(
                "groupAdmins",
                "name profileImage"
            );


    res.status(200).json({

        success: true,

        message: "Admin added",

        chat: updatedChat

    });

});


// Leave group 

// exports.leaveGroup = catchAsyncErrors(async (req, res, next) => {

//     const { chatId } = req.body;

//     const chat = await Chat.findById(chatId);

//     if (!chat) {
//         return next(new ErrorHandler("Group not found", 404));
//     }

//     if (!chat.isGroupChat) {
//         return next(new ErrorHandler("Not a group chat", 400));
//     }

//     const userId = req.user._id.toString();

//     // check user is member
//     const isMember = chat.users.some(
//         u => u.toString() === userId
//     );

//     if (!isMember) {
//         return next(new ErrorHandler("You are not part of this group", 400));
//     }

//     // check admin
//     const isAdmin = chat.groupAdmins.some(
//         admin => admin.toString() === userId
//     );

//     // condition 2
//     if (isAdmin && chat.groupAdmins.length === 1) {
//         return next(
//             new ErrorHandler(
//                 "You are the only admin. Make another admin before leaving.",
//                 400
//             )
//         );
//     }

//     // remove from users
//     chat.users = chat.users.filter(
//         u => u.toString() !== userId
//     );

//     // if admin remove from admins
//     if (isAdmin) {
//         chat.groupAdmins = chat.groupAdmins.filter(
//             admin => admin.toString() !== userId
//         );
//     }

//     await chat.save();

//     res.status(200).json({
//         success: true,
//         message: "You left the group"
//     });

// });

exports.leaveGroup = catchAsyncErrors(async (req, res, next) => {

    const { chatId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat)
        return next(new ErrorHandler("Group not found", 404));

    if (!chat.isGroupChat)
        return next(new ErrorHandler("Not group chat", 400));

    const userId = req.user._id.toString();

    // check member
    const isMember =
        chat.users.some(
            u => u.toString() === userId
        );

    if (!isMember)
        return next(new ErrorHandler("Not a member", 400));

    // check admin
    const isAdmin =
        chat.groupAdmins.some(
            admin =>
                admin.toString() === userId
        );

    // only admin cannot leave
    if (
        isAdmin &&
        chat.groupAdmins.length === 1
    ) {
        return next(
            new ErrorHandler(
                "You are the only admin",
                400
            )
        );
    }

    // remove from active members
    chat.users =
        chat.users.filter(
            u =>
                u.toString() !== userId
        );

    // remove admin if admin
    if (isAdmin) {

        chat.groupAdmins =
            chat.groupAdmins.filter(
                admin =>
                    admin.toString() !== userId
            );

    }

    // add to left users
    chat.leftUsers.push({

        user: userId,

        leftAt: new Date()

    });

    await chat.save();

    res.status(200).json({

        success: true,

        message: "Left group"

    });

});


// Add new members 

exports.addMemberToGroup = catchAsyncErrors(async (req, res, next) => {

    const { chatId, userId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat)
        return next(new ErrorHandler("Group not found", 404));

    if (!chat.isGroupChat)
        return next(new ErrorHandler("Not group chat", 400));

    // check requester is admin
    const isAdmin =
        chat.groupAdmins.some(
            admin =>
                admin.toString() === req.user._id.toString()
        );

    if (!isAdmin)
        return next(
            new ErrorHandler(
                "Only admin can add members",
                403
            )
        );

    // check already member
    const alreadyMember =
        chat.users.some(
            u => u.toString() === userId
        );

    if (alreadyMember)
        return next(
            new ErrorHandler(
                "User already in group",
                400
            )
        );

    // add user
    chat.users.push(userId);

    // if user existed in leftUsers remove from there
    chat.leftUsers =
        chat.leftUsers.filter(
            u =>
                u.user.toString() !== userId
        );

    await chat.save();

    const updatedChat =
        await Chat.findById(chatId)

            .populate(
                "users",
                "name profileImage"
            )

            .populate(
                "groupAdmins",
                "name profileImage"
            )

            .populate(
                "leftUsers.user",
                "name profileImage"
            );

    res.status(200).json({

        success: true,

        message: "Member added",

        chat: updatedChat

    });

});

// remove member 

exports.removeMemberFromGroup = catchAsyncErrors(async (req, res, next) => {

    const { chatId, userId } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat)
        return next(new ErrorHandler("Group not found", 404));

    if (!chat.isGroupChat)
        return next(new ErrorHandler("Not group chat", 400));

    // requester must be admin
    const isAdmin =
        chat.groupAdmins.some(
            admin =>
                admin.toString() === req.user._id.toString()
        );

    if (!isAdmin)
        return next(
            new ErrorHandler(
                "Only admin can remove members",
                403
            )
        );

    // cannot remove self
    if (req.user._id.toString() === userId)
        return next(
            new ErrorHandler(
                "Use leave group instead",
                400
            )
        );

    // check user exists in group
    const isMember =
        chat.users.some(
            u => u.toString() === userId
        );

    if (!isMember)
        return next(
            new ErrorHandler(
                "User not in group",
                400
            )
        );

    // remove from users
    chat.users =
        chat.users.filter(
            u => u.toString() !== userId
        );

    // remove from admins (if admin)
    chat.groupAdmins =
        chat.groupAdmins.filter(
            admin =>
                admin.toString() !== userId
        );

    // store in leftUsers
    chat.leftUsers.push({

        user: userId,

        leftAt: new Date()

    });

    await chat.save();

    const updatedChat =
        await Chat.findById(chatId)

            .populate("users", "name profileImage")

            .populate("groupAdmins", "name profileImage")

            .populate("leftUsers.user", "name profileImage");


    res.status(200).json({

        success: true,

        message: "Member removed",

        chat: updatedChat

    });

});