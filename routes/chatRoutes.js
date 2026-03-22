const express = require("express");
const { isAuthenticatedUser } = require("../middleware/auth");
const { accessChat, fetchChats, createGroupChat, deleteGroupChat } = require("../controllers/chatController");

const router = express.Router();


router.post("/chat", isAuthenticatedUser, accessChat);
router.get("/chats", isAuthenticatedUser, fetchChats);

router.post("/group", isAuthenticatedUser, createGroupChat);
router.delete("/group/:chatId", isAuthenticatedUser, deleteGroupChat);



// router.post("/group", isAuthenticatedUser, createGroupChat);
// router.put("/rename", isAuthenticatedUser, renameGroup);
// router.put("/groupadd", isAuthenticatedUser, addToGroup);
// router.put("/groupremove", isAuthenticatedUser, removeFromGroup);






module.exports = router;