const app = require('./app');
const dotenv = require('dotenv');
const connectDatabase = require("./config/database");
const cloudinary = require("cloudinary");
const http = require("http");
const { Server } = require("socket.io");
const User = require("./models/userModels");
const Chat = require("./models/chatModel");
const Message = require("./models/messageModel");


// Config
dotenv.config({ path: "backend/config/.env" });

// Connect Database
connectDatabase();

//Handling uncaught error
process.on("unhandledRejection", (err) => {
    console.log(`Error: ${err.message}`);
    console.log(`Shutting Down The Server Due To Uncaught Error`);
    process.exit(1);
});


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create HTTP server (important for socket.io)
const httpServer = http.createServer(app);



// Attach Socket.IO
const io = new Server(httpServer, {
    cors: {
        origin: "*", // in dev allow all, later restrict to your frontend
        methods: ["GET", "POST"]
    }
});

let onlineUsers = {};
const activeChatUsers = {};
// --- SOCKET.IO EVENTS ---
io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    // Join room for a chat
    socket.on("joinRoom", ({ chatId }) => {
        if (!socket.userId) return;

        socket.join(chatId);

        if (!activeChatUsers[chatId]) {
            activeChatUsers[chatId] = new Set();
        }

        // activeChatUsers[chatId].add(socket.id);
        activeChatUsers[chatId].add(socket.userId);


        console.log(`✅ socket ${socket.id} joined chat ${chatId}`);
    });



    socket.on("leaveRoom", ({ chatId }) => {
        socket.leave(chatId);
        // activeChatUsers[chatId]?.delete(socket.id);
        activeChatUsers[chatId]?.delete(socket.userId);

        console.log(`👋 socket ${socket.id} left chat ${chatId}`);
    });


    // Listen for messages


    socket.on("registerUser", async (userId) => {
        socket.userId = userId;
        socket.join(userId.toString());

        if (!onlineUsers[userId]) {
            onlineUsers[userId] = new Set();
        }
        onlineUsers[userId].add(socket.id);

        await User.findByIdAndUpdate(userId, { onlineStatus: true });

        // 🔥 DELIVER ALL PENDING SENT MESSAGES
        const pendingMessages = await Message.find({
            sender: { $ne: userId },
            status: "sent",
            chat: {
                $in: await Chat.find({ users: userId }).distinct("_id")
            }
        });

        for (const msg of pendingMessages) {
            await Message.findByIdAndUpdate(msg._id, {
                status: "delivered",
                deliveredAt: new Date(),
            });

            // notify sender
            io.to(msg.sender.toString()).emit("messageDelivered", {
                messageId: msg._id,
                chatId: msg.chat.toString(),
            });
        }

        // ✅ 1. SEND CURRENT ONLINE USERS TO THIS USER ONLY
        socket.emit("onlineUsersList", {
            users: Object.keys(onlineUsers),
        });

        // ✅ 2. INFORM OTHERS THAT THIS USER CAME ONLINE
        socket.broadcast.emit("userOnline", { userId });
    });




    socket.on("sendMessage", async (message) => {
        try {
            const chatId = message.chatId || message.chat?._id;
            const chat = await Chat.findById(chatId).populate("users", "_id");
            if (!chat) return;

            for (const chatUser of chat.users) {
                const receiverId = chatUser._id.toString();

                // skip sender
                if (receiverId === message.sender._id.toString()) continue;

                const receiverSockets = onlineUsers[receiverId] || new Set();

                // ✅ CHECK IF RECEIVER IS ACTIVE IN THIS CHAT
                // const isReceiverInChat = [...receiverSockets].some(
                //     sid => activeChatUsers[chatId]?.has(sid)
                // );
                const isReceiverInChat = activeChatUsers[chatId]?.has(receiverId);


                if (isReceiverInChat) {
                    // ✅ SEEN immediately
                    await Message.findByIdAndUpdate(message._id, {
                        status: "seen",
                        seenAt: new Date(),
                    });

                    io.to(message.sender._id.toString()).emit("messageSeen", {
                        messageId: message._id,
                        chatId,
                    });
                }
                else if (receiverSockets.size > 0) {
                    // ✅ DELIVERED (online but not in chat)
                    await Message.findByIdAndUpdate(message._id, {
                        status: "delivered",
                        deliveredAt: new Date(),
                    });

                    io.to(message.sender._id.toString()).emit("messageDelivered", {
                        messageId: message._id,
                        chatId,
                    });
                }

                // ✅ ALWAYS send message to receiver sockets
                receiverSockets.forEach((sid) => {
                    io.to(sid).emit("receiveMessage", message);
                });
            }
        } catch (err) {
            console.error("❌ sendMessage error:", err);
        }
    });



    // mark message as seen
    socket.on("markSeen", async ({ chatId }) => {
        if (!activeChatUsers[chatId]?.has(socket.userId)) return;

        const messages = await Message.find({
            chat: chatId,
            sender: { $ne: socket.userId },
            status: { $ne: "seen" },
        });

        await Message.updateMany(
            { _id: { $in: messages.map(m => m._id) } },
            { status: "seen", seenAt: new Date() }
        );

        messages.forEach(msg => {
            io.to(msg.sender.toString()).emit("messageSeen", {
                messageId: msg._id,
                chatId,
            });
        });
    });


    // disconnect
    socket.on("disconnect", async () => {
        if (!socket.userId) return;

        // remove socket from onlineUsers
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

        // remove socket from all active chats
        for (const chatId in activeChatUsers) {
            activeChatUsers[chatId]?.delete(socket.userId);
        }

        console.log("❌ socket disconnected:", socket.id);
    });



});

// backend route
app.get("/online-users", (req, res) => {
    res.json({ onlineUsers: Object.keys(onlineUsers) });
});


// connect to port
const server = httpServer.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});

// unhandled promise rejection
process.on("unhandledRejection", (err) => {
    console.log(`Error: ${err.message}`);
    console.log(`Shutting Down The Server Due To Unhandled Promise Rejection`);
    server.close(() => {
        process.exit(1);
    });
});