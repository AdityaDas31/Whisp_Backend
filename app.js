const express = require('express');
const app = express();
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const fileUpload = require("express-fileupload");
const cors = require('cors')
const  errorMiddleware = require("./middleware/error");


// dotenv.config({path:"backend/config/.env"});
dotenv.config();


const allowedOrigins = ['http://localhost:5173', 'https://whisp-backend-api.onrender.com'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like from mobile apps or Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("Blocked by CORS - Origin:", origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: "/tmp/",
}));



// Import all routes here
// const user = require("./routes/userRoutes");
const user = require("./routes/userRoutes")
const chat = require("./routes/chatRoutes")
const message = require("./routes/messageRoutes")


// Using the imported routes
app.use("/api/v1/user", user);
app.use("/api/v1/chat", chat);
app.use("/api/v1/message", message);






// Middleware for Errors
app.use(errorMiddleware);



module.exports = app;