const cron = require("node-cron");
const Story = require("../models/storyModel");
const cloudinary = require("cloudinary").v2;

cron.schedule("*/10 * * * *", async () => {

    try {

        console.log("Running story cleanup job...");

        const expiredStories = await Story.find({
            expiresAt: { $lte: new Date() }
        });

        await Promise.all(
            expiredStories.map(async (story) => {

                if (story.media?.publicId && story.media.format !== "text") {

                    let resourceType = "image";

                    if (story.media.format === "video")
                        resourceType = "video";

                    else if (story.media.format === "document")
                        resourceType = "raw";

                    await cloudinary.uploader.destroy(
                        story.media.publicId,
                        { resource_type: resourceType }
                    );
                }

                await story.deleteOne();

            })
        );

        console.log(`Deleted ${expiredStories.length} expired stories`);

    } catch (error) {

        console.error("Story cleanup error:", error.message);

    }

});
