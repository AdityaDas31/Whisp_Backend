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

// exports.deleteGroupChat = catchAsyncErrors(async (req, res, next) => {

//     const { chatId } = req.params;


//     // 1️⃣ find chat
//     const chat = await Chat.findById(chatId);

//     if (!chat) {

//         return next(
//             new ErrorHandler("Group not found", 404)
//         );

//     }


//     // 2️⃣ ensure group chat
//     if (!chat.isGroupChat) {

//         return next(
//             new ErrorHandler("Not a group chat", 400)
//         );

//     }


//     // 3️⃣ check admin permission
//     if (

//         chat.groupAdmins.toString() !==
//         req.user._id.toString()

//     ) {

//         return next(
//             new ErrorHandler("Only admin can delete group", 403)
//         );

//     }


//     // 4️⃣ delete cloudinary image
//     if (chat.groupImage?.publicId) {

//         await cloudinary.v2.uploader.destroy(

//             chat.groupImage.publicId

//         );

//     }


//     // 5️⃣ delete messages
//     await Message.deleteMany({

//         chat: chatId

//     });


//     // 6️⃣ delete chat
//     await Chat.findByIdAndDelete(chatId);


//     res.status(200).json({

//         success: true,
//         message: "Group deleted"

//     });

// });

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

// Leave from group 

exports.leaveGroupChat = catchAsyncErrors(async (req, res, next) => {

})


// exports.createGroupChat = catchAsyncErrors(async (req, res, next) => {
//     if (!req.body.users || !req.body.name) {
//         return res.status(400).json({ message: "Please fill all the fields" });
//     }

//     let users = JSON.parse(req.body.users);
//     if (users.length < 2) {
//         return res
//             .status(400)
//             .json({ message: "More than 2 users are required to form a group chat" });
//     }

//     users.push(req.user);

//     try {
//         const groupChat = await Chat.create({
//             chatName: req.body.name,
//             users: users,
//             isGroupChat: true,
//             groupAdmin: req.user,
//         });

//         const fullGroupChat = await Chat.findById(groupChat._id)
//             .populate("users", "-password")
//             .populate("groupAdmin", "-password");

//         res.status(200).json(fullGroupChat);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// })


// exports.renameGroup = catchAsyncErrors(async (req, res, next) => {
//     const { chatId, chatName } = req.body;

//     try {
//         const updatedChat = await Chat.findByIdAndUpdate(
//             chatId,
//             { chatName },
//             { new: true }
//         )
//             .populate("users", "-password")
//             .populate("groupAdmin", "-password");

//         res.json(updatedChat);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// })

// exports.addToGroup = catchAsyncErrors(async (req, res, next) => {
//     const { chatId, userId } = req.body;

//     try {
//         const added = await Chat.findByIdAndUpdate(
//             chatId,
//             { $push: { users: userId } },
//             { new: true }
//         )
//             .populate("users", "-password")
//             .populate("groupAdmin", "-password");

//         res.json(added);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// })

// exports.removeFromGroup = catchAsyncErrors(async (req, res, next) => {
//     const { chatId, userId } = req.body;

//     try {
//         const removed = await Chat.findByIdAndUpdate(
//             chatId,
//             { $pull: { users: userId } },
//             { new: true }
//         )
//             .populate("users", "-password")
//             .populate("groupAdmin", "-password");

//         res.json(removed);
//     } catch (error) {
//         res.status(400).json({ message: error.message });
//     }
// })