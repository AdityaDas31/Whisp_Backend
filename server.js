const app = require('./app');
const dotenv = require('dotenv');
const connectDatabase = require("./config/database");
const cloudinary = require("cloudinary");
const http = require("http");
const { Server } = require("socket.io");
const User = require("./models/userModels");
const Chat = require("./models/chatModel");


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
// --- SOCKET.IO EVENTS ---
io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    // Join room for a chat
    socket.on("joinRoom", (chatId) => {
        socket.join(chatId);
        console.log(`User joined room: ${chatId}`);
    });

    socket.on("leaveRoom", (chatId) => {
        socket.leave(chatId);
        console.log(`👋 ${socket.id} left room: ${chatId}`);
    });

    socket.on("registerUser", async (userId) => {
        if (!userId) return;

        if (!onlineUsers[userId]) {
            onlineUsers[userId] = new Set();
        }
        onlineUsers[userId].add(socket.id);

        await User.findByIdAndUpdate(userId, { onlineStatus: true });

        io.emit("userOnline", { userId, online: true });
        console.log("✅ User registered online:", userId, onlineUsers[userId]);
    });

    // Listen for messages
    // socket.on("sendMessage", (message) => {
    //     // io.to(message.chatId).emit("receiveMessage", message);
    //     socket.to(message.chatId).emit("receiveMessage", message);
    // });
    socket.on("sendMessage", async (message) => {
        try {
            // Find the chat participants
            const chat = await Chat.findById(message.chatId).populate("users", "_id");

            if (!chat) return console.log("❌ Chat not found:", message.chatId);

            chat.users.forEach((user) => {
                if (user._id.toString() === message.sender._id.toString()) return; // skip sender

                const sockets = onlineUsers[user._id.toString()];
                if (sockets) {
                    sockets.forEach((sid) => {
                        io.to(sid).emit("receiveMessage", message);
                    });
                }
            });
        } catch (err) {
            console.error("❌ sendMessage error:", err);
        }
    });

    // disconnect
    socket.on("disconnect", async () => {
        let disconnectedUserId = null;

        for (const [userId, sockets] of Object.entries(onlineUsers)) {
            if (sockets.has(socket.id)) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    delete onlineUsers[userId];
                    disconnectedUserId = userId;
                }
                break;
            }
        }

        if (disconnectedUserId) {
            await User.findByIdAndUpdate(disconnectedUserId, {
                onlineStatus: false,
                lastSeen: new Date(),
            });
            io.emit("userOffline", {
                userId: disconnectedUserId,
                online: false,
                lastSeen: new Date(),
            });
            console.log("❌ User went offline:", disconnectedUserId);
        }
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