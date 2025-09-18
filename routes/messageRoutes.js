const express = require("express");
const { isAuthenticatedUser } = require("../middleware/auth");
const { sendMessage, deleteMessage, updateMessage, allMessages, markAsRead } = require("../controllers/messageController");

const router = express.Router();

router.post("/message", isAuthenticatedUser, sendMessage);

router.get("/messages/:chatId", isAuthenticatedUser, allMessages);

router.delete("/:id", isAuthenticatedUser, deleteMessage);

router.put("/:id", isAuthenticatedUser, updateMessage);




module.exports = router;