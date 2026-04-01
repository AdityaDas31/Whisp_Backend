const express = require("express");
const { isAuthenticatedUser } = require("../middleware/auth");
const { accessChat, fetchChats, createGroupChat, deleteGroupChat, makeGroupAdmin } = require("../controllers/chatController");

const router = express.Router();


router.post("/chat", isAuthenticatedUser, accessChat);
router.get("/chats", isAuthenticatedUser, fetchChats);

router.post("/group", isAuthenticatedUser, createGroupChat);
router.delete("/group/:chatId", isAuthenticatedUser, deleteGroupChat);
router.put("/group/admin", isAuthenticatedUser, makeGroupAdmin)



// router.post("/group", isAuthenticatedUser, createGroupChat);
// router.put("/rename", isAuthenticatedUser, renameGroup);
// router.put("/groupadd", isAuthenticatedUser, addToGroup);
// router.put("/groupremove", isAuthenticatedUser, removeFromGroup);






module.exports = router;