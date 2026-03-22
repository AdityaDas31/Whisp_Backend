const app = require("./app");
const dotenv = require("dotenv");
const connectDatabase = require("./config/database");
const cloudinary = require("cloudinary");
const http = require("http");
const { Server } = require("socket.io");

const User = require("./models/userModels");
const Message = require("./models/messageModel");
const CallLog = require("./models/CallLogModel");

// Config
dotenv.config();

// DB
// connectDatabase();
connectDatabase().then(() => {
    // Cloudinary
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // start cleanup job ONLY after DB connected
    if (!global.storyCleanupStarted) {
        require("./jobs/storyCleanup");
        global.storyCleanupStarted = true;
    }

}).catch(err => {
    console.error("DB connection failed:", err);
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

    // ================= CALL SIGNALING =================

    // Initiate call
    socket.on("call:initiate", async ({
        to,
        callId,
        type,
        callerId,
        callerName,
        callerImage
    }) => {

        console.log("📡 SERVER CALL EVENT");

        await CallLog.findOneAndUpdate(
            { callId },
            {
                callId,
                callerId,
                receiverId: to,
                type,
                status: "ringing"
            },
            { upsert: true, new: true }
        );

        // 🔥 Missed Call Timer
        setTimeout(async () => {

            try {

                const call = await CallLog.findOne({ callId });

                if (call && call.status === "ringing") {

                    await CallLog.updateOne(
                        { callId },
                        {
                            status: "missed",
                            endedAt: new Date(),
                            duration: 0
                        }
                    );

                    console.log("📞 Missed call marked:", callId);

                    // 🔥 END CALL FOR BOTH USERS
                    const callerSockets = onlineUsers[callerId] || new Set();
                    const receiverSockets = onlineUsers[to] || new Set();

                    callerSockets.forEach((sid) => {
                        io.to(sid).emit("call:ended", { callId });
                    });

                    receiverSockets.forEach((sid) => {
                        io.to(sid).emit("call:ended", { callId });
                    });

                }

            } catch (err) {
                console.log("Missed call check error:", err);
            }

        }, 30000); // 30 seconds


        const receiverSockets = onlineUsers[to] || new Set();

        receiverSockets.forEach((sid) => {
            io.to(sid).emit("call:incoming", {
                callId,
                from: callerId,
                name: callerName,
                profileImage: callerImage,
                type 
            });
        });

    });

    // Accept call
    socket.on("call:accept", async ({ callId, to }) => {

        // 🔹 UPDATE CALL STATUS
        await CallLog.findOneAndUpdate(
            { callId },
            {
                status: "connected",
                startedAt: new Date()
            }
        );

        const callerSockets = onlineUsers[to] || new Set();

        callerSockets.forEach((sid) => {
            io.to(sid).emit("call:accepted", { callId });
        });
    });

    // Reject call
    socket.on("call:reject", async ({ callId, to }) => {

        await CallLog.findOneAndUpdate(
            { callId },
            {
                status: "rejected",
                endedAt: new Date()
            }
        );

        const callerSockets = onlineUsers[to] || new Set();

        callerSockets.forEach((sid) => {
            io.to(sid).emit("call:rejected", { callId });
        });
    });

    // End call
    socket.on("call:end", async ({ callId, to }) => {

        const call = await CallLog.findOne({ callId });

        if (call) {

            // ❗ Only complete if call was connected
            if (call.status === "connected") {

                const endedAt = new Date();

                let duration = 0;

                if (call.startedAt) {
                    duration = Math.floor(
                        (endedAt.getTime() - call.startedAt.getTime()) / 1000
                    );
                }

                await CallLog.updateOne(
                    { callId },
                    {
                        status: "completed",
                        endedAt,
                        duration
                    }
                );

            }

            // If status already missed/rejected → DO NOTHING
        }

        const otherSockets = onlineUsers[to] || new Set();

        otherSockets.forEach((sid) => {
            io.to(sid).emit("call:ended", { callId });
        });

    });

    // ================= WEBRTC SIGNALING =================

    // Offer
    socket.on("webrtc:offer", ({ to, offer }) => {
        const sockets = onlineUsers[to] || new Set();

        sockets.forEach((sid) => {
            io.to(sid).emit("webrtc:offer", {
                from: socket.userId,
                offer,
            });
        });
    });

    // Answer
    socket.on("webrtc:answer", ({ to, answer }) => {
        const sockets = onlineUsers[to] || new Set();

        sockets.forEach((sid) => {
            io.to(sid).emit("webrtc:answer", {
                from: socket.userId,
                answer,
            });
        });
    });

    // ICE candidate
    socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
        const sockets = onlineUsers[to] || new Set();

        sockets.forEach((sid) => {
            io.to(sid).emit("webrtc:ice-candidate", {
                from: socket.userId,
                candidate,
            });
        });
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
