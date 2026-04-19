const express = require("express");
const { isAuthenticatedUser } = require("../middleware/auth");
const { sendMessage, deleteMessage, allMessages } = require("../controllers/messageController");

const router = express.Router();

router.post("/message", isAuthenticatedUser, sendMessage);

router.get("/messages/:chatId", isAuthenticatedUser, allMessages);

router.delete("/message/:messageId", isAuthenticatedUser, deleteMessage);





module.exports = router;