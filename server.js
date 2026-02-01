const app = require("./app");
const dotenv = require("dotenv");
const connectDatabase = require("./config/database");
const cloudinary = require("cloudinary");
const http = require("http");
const { Server } = require("socket.io");

const User = require("./models/userModels");
const Message = require("./models/messageModel");

// Config
dotenv.config();

// DB
connectDatabase();

// Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Server
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// 🔥 online users: { userId: Set(socketId) }
const onlineUsers = {};

// messageId -> Set of userIds who persisted
const persistedMessages = {};

io.on("connection", (socket) => {
    console.log("⚡ Connected:", socket.id);

    // ---------------- REGISTER USER ----------------
    socket.on("registerUser", async (userId) => {
        socket.userId = userId;
        socket.join(userId);

        if (!onlineUsers[userId]) {
            onlineUsers[userId] = new Set();
        }
        onlineUsers[userId].add(socket.id);

        await User.findByIdAndUpdate(userId, { onlineStatus: true });

        // 🔥 SYNC ONLY (NO DB UPDATE, NO DELIVERY EMIT)
        const pendingMessages = await Message.find({ receivers: userId })
            .populate("sender", "name profileImage")
            .populate("chat");

        socket.emit("sync:messages", pendingMessages);

        for (const msg of pendingMessages) {
            socket.emit("message:new", msg);
        }

        // 🔥 Send full online list to this user
        socket.emit("onlineUsersList", {
            users: Object.keys(onlineUsers),
        });

        // 🔥 Notify others
        socket.broadcast.emit("userOnline", { userId });
    });

    // ---------------- SEND MESSAGE ----------------
    // client sends ONLY { messageId }
    socket.on("sendMessage", async ({ messageId }) => {
        try {
            const message = await Message.findById(messageId)
                .populate("sender", "name profileImage")
                .populate("chat");

            if (!message) return;

            for (const receiverId of message.receivers) {
                const sockets = onlineUsers[receiverId] || new Set();

                sockets.forEach((sid) => {
                    io.to(sid).emit("message:new", message);
                });
            }
        } catch (err) {
            console.error("❌ sendMessage error:", err);
        }
    });

    // ---------------- DELIVERY ACK ----------------
    socket.on("message:ack", async ({ messageId }) => {
        if (!socket.userId) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        const isSeen =
            socket.activeChatId &&
            message.chat.toString() === socket.activeChatId;

        if (isSeen) {
            // ✅ MARK SEEN
            if (!message.seenBy.includes(socket.userId)) {
                message.seenBy.push(socket.userId);
            }

            message.receivers = message.receivers.filter(
                (id) => id.toString() !== socket.userId
            );

            await message.save();

            io.to(message.sender.toString()).emit("message:seen", {
                messageId,
                userId: socket.userId,
            });
        } else {
            // ✅ MARK DELIVERED
            await Message.updateOne(
                { _id: messageId },
                {
                    $addToSet: { deliveredTo: socket.userId },
                    $pull: { receivers: socket.userId },
                }
            );

            io.to(message.sender.toString()).emit("message:delivered", {
                messageId,
                userId: socket.userId,
            });
        }
    });



    socket.on("chat:seen", async ({ chatId }) => {
        if (!socket.userId) return;

        const unseenMessages = await Message.find({
            chat: chatId,
            sender: { $ne: socket.userId },
            seenBy: { $ne: socket.userId },
        });

        for (const msg of unseenMessages) {
            await Message.updateOne(
                { _id: msg._id },
                { $addToSet: { seenBy: socket.userId } }
            );

            io.to(msg.sender.toString()).emit("message:seen", {
                messageId: msg._id,
                userId: socket.userId,
            });
        }
    });

    // track active chat per socket
    socket.on("joinRoom", ({ chatId }) => {
        socket.activeChatId = chatId;
    });

    socket.on("leaveRoom", () => {
        socket.activeChatId = null;
    });


    // ---------------- SEEN ACK ----------------
    socket.on("message:seen", async ({ messageId }) => {
        if (!socket.userId) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        if (!message.seenBy.includes(socket.userId)) {
            message.seenBy.push(socket.userId);
            await message.save();

            io.to(message.sender.toString()).emit("message:seen", {
                messageId,
                userId: socket.userId,
            });
        }
    });

    socket.on("message:persisted", async ({ messageId }) => {
        if (!socket.userId) return;

        if (!persistedMessages[messageId]) {
            persistedMessages[messageId] = new Set();
        }

        persistedMessages[messageId].add(socket.userId);

        const message = await Message.findById(messageId).populate("chat");
        if (!message) return;

        // total recipients (exclude sender)
        const totalRecipients = message.chat.isGroupChat
            ? message.chat.users.length - 1
            : 1;

        // ✅ ALL recipients safely stored the message
        if (persistedMessages[messageId].size === totalRecipients) {
            await Message.updateOne(
                { _id: messageId },
                {
                    $unset: {
                        content: 1,
                        media: 1,
                        location: 1,
                        contact: 1,
                        poll: 1,
                    },
                    $set: {
                        payloadStripped: true, // optional
                    },
                }
            );
            delete persistedMessages[messageId];

            console.log("🧹 Message deleted safely:", messageId);
        }
    });



    // ---------------- DISCONNECT ----------------
    socket.on("disconnect", async () => {
        if (!socket.userId) return;

        const sockets = onlineUsers[socket.userId];
        if (sockets) {
            sockets.delete(socket.id);

            if (sockets.size === 0) {
                delete onlineUsers[socket.userId];

                await User.findByIdAndUpdate(socket.userId, {
                    onlineStatus: false,
                    lastSeen: new Date(),
                });

                io.emit("userOffline", {
                    userId: socket.userId,
                    lastSeen: new Date(),
                });
            }
        }

        console.log("❌ Disconnected:", socket.id);
    });
});

// Start server
const server = httpServer.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`);
});

// Safety
process.on("unhandledRejection", (err) => {
    console.error("❌ Unhandled rejection:", err);
    server.close(() => process.exit(1));
});
