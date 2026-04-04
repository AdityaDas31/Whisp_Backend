const express = require("express");
const { isAuthenticatedUser } = require("../middleware/auth");
const { accessChat, fetchChats, createGroupChat, deleteGroupChat, makeGroupAdmin, leaveGroup, addMemberToGroup, removeMemberFromGroup } = require("../controllers/chatController");

const router = express.Router();


router.post("/chat", isAuthenticatedUser, accessChat);
router.get("/chats", isAuthenticatedUser, fetchChats);

router.post("/group", isAuthenticatedUser, createGroupChat);
router.delete("/group/:chatId", isAuthenticatedUser, deleteGroupChat);
router.put("/group/admin", isAuthenticatedUser, makeGroupAdmin)
router.put("/group/leave", isAuthenticatedUser, leaveGroup);
router.put("/group/add-member", isAuthenticatedUser, addMemberToGroup);
router.put("/group/remove-member", isAuthenticatedUser, removeMemberFromGroup);



// router.post("/group", isAuthenticatedUser, createGroupChat);
// router.put("/rename", isAuthenticatedUser, renameGroup);
// router.put("/groupadd", isAuthenticatedUser, addToGroup);
// router.put("/groupremove", isAuthenticatedUser, removeFromGroup);






module.exports = router;