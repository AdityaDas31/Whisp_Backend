const express = require("express");
const { addStory, getVisibleStories, getMyStories, deleteStory, viewStory } = require("../controllers/storyController");
const { isAuthenticatedUser } = require("../middleware/auth");
const router = express.Router();



router.route("/add-story").post(isAuthenticatedUser, addStory);
router.route("/view-story").get(isAuthenticatedUser, getVisibleStories);
router.route("/view-my-story").get(isAuthenticatedUser, getMyStories);
router.route("/delete-story/:storyId").delete(isAuthenticatedUser, deleteStory);
router.post("/view/:storyId", isAuthenticatedUser, viewStory);


module.exports = router;