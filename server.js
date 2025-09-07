const app = require('./app');
const dotenv = require('dotenv');
const connectDatabase = require("./config/database");
const cloudinary = require("cloudinary");
const http = require("http");
const { Server } = require("socket.io");
const isAuthenticatedUserSocket = require("./middleware/authSocket")
const Message = require("./models/messageModel")


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

    // Listen for messages
    socket.on("sendMessage", (message) => {
        // io.to(message.chatId).emit("receiveMessage", message);
        socket.to(message.chatId).emit("receiveMessage", message);
    });

    // When recipient marks as read
    socket.on("messagesRead", async ({ chatId, userId }) => {
        try {
            // Update DB
            await Message.updateMany(
                { chat: chatId, receiver: userId, readBy: { $ne: userId } },
                { $push: { readBy: userId }, $set: { status: "read" } }
            );

            // Broadcast to everyone in the room
            io.to(chatId).emit("messagesReadUpdate", { chatId, userId });
        } catch (err) {
            console.error("❌ messagesRead error:", err);
        }
    });

    socket.on("markRead", ({ chatId, userId }) => {
        socket.to(chatId).emit("messagesRead", { chatId, userId });
    });
    // disconnect
    socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
    });
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


