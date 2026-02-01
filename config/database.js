const mongoose = require("mongoose");
const dotenv = require('dotenv');

// const cron = require('node-corn');
const cron = require('node-cron');
const { db } = require("../models/userOtp");
const MongoClient = require('mongodb').MongoClient;


mongoose.set('strictQuery', false);

// dotenv.config({ path: "config/.env" });
dotenv.config();

const connectDatabase = async () => {
    try {
        mongoose.connect(process.env.DB_URL).then((data) => {
            console.log(`Connected to database ${data.connection.host}`);
        });

        // Calculate the cutoff time (10 minutes ago)

        const timeCount = new Date();
        timeCount.setMinutes(timeCount.getMinutes() - 10);

        // Delete Otp

        const result = await db.collection('userotps').deleteMany({
            createdAt: { $lt: timeCount }
        });

        // console.log(`Deleted ${result.deletedCount} expired OTPs`);

    } catch (error) {
        console.error(err);
    }
};

cron.schedule('* * * * *', connectDatabase);




module.exports = connectDatabase;