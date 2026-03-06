const express = require("express");
const router = express.Router();

const {
    getCallHistory,
    deleteCallLog
} = require("../controllers/callController");

router.get("/history/:userId", getCallHistory);
router.delete("/:callId", deleteCallLog);

module.exports = router;