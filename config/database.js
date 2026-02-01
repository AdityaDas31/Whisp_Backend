const mongoose = require("mongoose");
require("dotenv").config();

mongoose.set("strictQuery", false);

let isConnected = false;

const connectDatabase = async () => {
    if (isConnected) return;

    if (!process.env.DB_URL) {
        throw new Error("❌ DB_URL is not defined");
    }

    try {
        const conn = await mongoose.connect(process.env.DB_URL);
        isConnected = true;
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};

module.exports = connectDatabase;
