const Story = require("../models/storyModel");
const catchAsyncErrors = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const cloudinary = require("cloudinary");
const mongoose = require("mongoose");
const User = require("../models/userModels");


// 1️⃣ ADD NEW STORY (single or multiple)

exports.addStory = catchAsyncErrors(async (req, res, next) => {

    const userId = req.user._id;

    //TEXT STORY

    if (req.body.format === "text") {

        let textStyle = {};

        if (req.body.textStyle) {
            try {
                textStyle = JSON.parse(req.body.textStyle);
            } catch {
                textStyle = {};
            }
        }

        const story = await Story.create({
            userId,

            media: {
                url: null,
                publicId: null,
                format: "text",
            },

            caption: req.body.caption || "",

            textStyle: {
                backgroundColor: textStyle.backgroundColor || "#FFFFFF",
                textColor: textStyle.textColor || "#000000",
                font: textStyle.font || "default",
            },

            privacy: req.body.privacy || "contacts",

            allowedUsers: req.body.allowedUsers || [],

            excludedUsers: req.body.excludedUsers || [],

            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        return res.status(201).json({
            success: true,
            story,
        });
    }

    //  MEDIA STORY


    if (!req.files || !req.files.media) {
        return next(new ErrorHandler("No files uploaded", 400));
    }

    // normalize to array
    const mediaFiles = Array.isArray(req.files.media)
        ? req.files.media
        : [req.files.media];

    const stories = [];

    for (let file of mediaFiles) {

        // Upload to cloudinary
        const upload = await cloudinary.v2.uploader.upload(
            file.tempFilePath,
            {
                folder: "whisp/stories",
                resource_type: "auto",
            }
        );

        let format = "document";

        if (upload.resource_type === "image")
            format = "image";

        else if (upload.resource_type === "video")
            format = "video";

        else if (upload.resource_type === "raw")
            format = "document";

        stories.push({
            userId,

            media: {
                url: upload.secure_url,
                publicId: upload.public_id,
                format,
            },

            caption: req.body.caption || "",

            privacy: req.body.privacy || "contacts",

            allowedUsers: req.body.allowedUsers || [],

            excludedUsers: req.body.excludedUsers || [],

            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
    }

    const createdStories = await Story.insertMany(stories);

    res.status(201).json({
        success: true,
        count: createdStories.length,
        stories: createdStories,
    });

});

// 2️⃣ VIEW STORY
exports.viewStory = async (req, res) => {

    try {

        const storyId = req.params.storyId;
        const viewerId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(storyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid story ID",
            });
        }

        const story = await Story.findById(storyId)
            .populate({
                path: "viewers.userId",
                select: "name profileImage"
            });

        if (!story) {
            return res.status(404).json({
                success: false,
                message: "Story not found",
            });
        }

        const isOwner = story.userId.toString() === viewerId.toString();

        // Only add viewer if NOT owner
        if (!isOwner) {

            const alreadyViewed = story.viewers.some(
                viewer =>
                    viewer.userId._id
                        ? viewer.userId._id.toString() === viewerId.toString()
                        : viewer.userId.toString() === viewerId.toString()
            );

            if (!alreadyViewed) {

                story.viewers.push({
                    userId: viewerId,
                    viewedAt: new Date(),
                });

                await story.save();

                // re-fetch populated data
                await story.populate({
                    path: "viewers.userId",
                    select: "name profileImage"
                });

            }

        }

        res.json({
            success: true,
            message: "Story viewed",
            viewsCount: story.viewers.length,
            viewers: story.viewers,
            isOwner
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message,
        });

    }

};

// 3️⃣ GET STORY VIEWERS (FOR OTHER THAN OWENER)

exports.getVisibleStories = catchAsyncErrors(async (req, res, next) => {

    const userId = req.user._id;

    const user = await User.findById(userId);

    // const contacts = user.contacts || [];
    const contacts = (user.contacts || []).map(
        id => new mongoose.Types.ObjectId(id)
    );

    const stories = await Story.aggregate([

        {
            $match: {
                expiresAt: { $gt: new Date() },
                userId: { $ne: userId },

                $or: [
                    { privacy: "public" },

                    {
                        privacy: "contacts",
                        userId: { $in: contacts }
                    },

                    {
                        privacy: "only",
                        allowedUsers: userId
                    },

                    {
                        privacy: "except",
                        excludedUsers: { $nin: [userId] }
                    }
                ]
            }
        },

        { $sort: { createdAt: 1 } },

        {
            $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "_id",
                as: "user"
            }
        },

        { $unwind: "$user" },

        {
            $group: {
                _id: "$userId",

                user: { $first: "$user" },

                stories: { $push: "$$ROOT" },

                unseenCount: {
                    $sum: {
                        $cond: [
                            {
                                $not: {
                                    $in: [
                                        userId,
                                        "$viewers.userId"
                                    ]
                                }
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        },

        {
            $project: {
                userId: "$_id",

                name: "$user.name",

                profileImage: "$user.profileImage",

                stories: 1,

                unseenCount: 1,

                _id: 0
            }
        },

        { $sort: { unseenCount: -1 } }

    ]);

    res.status(200).json({
        success: true,
        stories
    });

});



// 4️⃣ GET STORY VIEWERS (FOR OWNER)

exports.getMyStories = async (req, res) => {

    const userId = req.user._id;

    const stories = await Story.find({
        userId,
        expiresAt: { $gt: new Date() }
    })
        .populate("viewers.userId", "name profileImage")
        .sort({ createdAt: -1 });


    res.json(stories);
};


// 5️⃣ DELETE STORY

exports.deleteStory = catchAsyncErrors(async (req, res, next) => {

    const storyId = req.params.storyId;
    const userId = req.user._id;

    const story = await Story.findById(storyId);

    if (!story)
        return next(new ErrorHandler("Story not found", 404));

    if (story.userId.toString() !== userId.toString())
        return next(new ErrorHandler("Not authorized", 403));


    // delete cloudinary file
    if (story.media?.publicId && story.media.format !== "text") {

        let resourceType = "image";

        if (story.media.format === "video")
            resourceType = "video";

        else if (story.media.format === "document")
            resourceType = "raw";

        await cloudinary.v2.uploader.destroy(
            story.media.publicId,
            { resource_type: resourceType }
        );
    }


    // delete from database
    await story.deleteOne();

    res.status(200).json({
        success: true,
        message: "Story deleted successfully",
    });

});

