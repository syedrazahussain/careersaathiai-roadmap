import redis from "../shared/redis/redis.js"
import graph from "../graph/roadmap.graph.js";
import roadmap from "../models/roadmap.model.js";


// ====================================================
// GENERATE ROADMAP
// ====================================================

export const generateRoadmap = async (req, res) => {

    try {

        const {
            role,
            targetPackage,
            useResume = false,
            resume
        } = req.body;


        const userId = req.headers["x-user-id"];


        // ------------------------------------------------
        // VALIDATE REQUIRED FIELDS
        // ------------------------------------------------

        if (!role || !targetPackage) {

            return res.status(400).json({
                success: false,
                message: "Role and target package are required."
            });

        }


        // ------------------------------------------------
        // VALIDATE RESUME
        // ------------------------------------------------

        if (useResume && !resume) {

            return res.status(400).json({
                success: false,
                message: "Resume data is required."
            });

        }


        // ------------------------------------------------
        // GENERATE ROADMAP USING GRAPH
        // ------------------------------------------------

        const result = await graph.invoke({
            role,
            targetPackage,
            useResume,
            resume
        });


        // ------------------------------------------------
        // SAVE ROADMAP TO MONGODB
        // ------------------------------------------------
        //
        // IMPORTANT:
        //
        // Your original code had:
        //
        // const roadmap = await roadmap.create(...)
        //
        // This shadows the imported "roadmap" model.
        //
        // We use roadmapData instead.
        //
        // The model import itself remains:
        //
        // import roadmap from "../models/roadmap.model.js";
        //
        // So no other file needs to change.
        // ------------------------------------------------

        const roadmapData = await roadmap.create({
            userId,
            ...result.roadmap
        });


        // ------------------------------------------------
        // SAVE SINGLE ROADMAP TO REDIS
        // ------------------------------------------------

        await redis.set(
            `roadmap:${roadmapData._id}`,
            JSON.stringify(roadmapData),
            "EX",
            60 * 60
        );


        // ------------------------------------------------
        // CLEAR USER ROADMAP CACHE
        // ------------------------------------------------

        await redis.del(
            `userRoadmaps:${userId}`
        );


        // ------------------------------------------------
        // RESPONSE
        // ------------------------------------------------

        return res.status(201).json({
            success: true,
            message: "Roadmap generated successfully",
            data: roadmapData
        });

    } catch (error) {

        console.error(
            "Generate Roadmap Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// ====================================================
// GET ALL ROADMAPS
// ====================================================

export const getAllRoadmap = async (req, res) => {

    try {

        const userId = req.headers["x-user-id"];


        // ------------------------------------------------
        // CHECK REDIS CACHE
        // ------------------------------------------------

        const cache = await redis.get(
            `userRoadmaps:${userId}`
        );


        if (cache) {
            return res.status(200).json({
                success: true,
                fromCache: true,
                data: JSON.parse(cache)
            });
        }


        // ------------------------------------------------
        // GET FROM MONGODB
        // ------------------------------------------------

        const roadmaps = await roadmap
            .find({ userId })
            .sort({ createdAt: -1 });


        // ------------------------------------------------
        // SAVE TO REDIS
        // ------------------------------------------------

        await redis.set(
            `userRoadmaps:${userId}`,
            JSON.stringify(roadmaps),
            "EX",
            60 * 60
        );


        // ------------------------------------------------
        // RESPONSE
        // ------------------------------------------------

        return res.status(200).json({
            success: true,
            fromCache: false,
            data: roadmaps
        });

    } catch (error) {

        console.error(
            "Get All Roadmap Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// ====================================================
// GET ROADMAP BY ID
// ====================================================

export const getRoadmapbyId = async (req, res) => {

    try {

        const { id } = req.params;

        const userId = req.headers["x-user-id"];


        // ------------------------------------------------
        // CHECK REDIS CACHE
        // ------------------------------------------------

        const cache = await redis.get(
            `roadmap:${id}`
        );


        if (cache) {

            const cachedRoadmap = JSON.parse(cache);


            // ------------------------------------------------
            // SECURITY CHECK
            // ------------------------------------------------
            //
            // Do not return a cached roadmap to another user.
            // ------------------------------------------------

            if (
                String(cachedRoadmap.userId) !==
                String(userId)
            ) {

                return res.status(404).json({
                    success: false,
                    message: "Roadmap not found"
                });

            }


            return res.status(200).json({
                success: true,
                fromCache: true,
                data: cachedRoadmap
            });
        }


        // ------------------------------------------------
        // GET FROM MONGODB
        // ------------------------------------------------

        const roadmapData = await roadmap.findOne({
            _id: id,
            userId: userId
        });


        // ------------------------------------------------
        // ROADMAP NOT FOUND
        // ------------------------------------------------

        if (!roadmapData) {

            return res.status(404).json({
                success: false,
                message: "Roadmap not found"
            });

        }


        // ------------------------------------------------
        // SAVE TO REDIS
        // ------------------------------------------------

        await redis.set(
            `roadmap:${id}`,
            JSON.stringify(roadmapData),
            "EX",
            60 * 60
        );


        // ------------------------------------------------
        // RESPONSE
        // ------------------------------------------------

        return res.status(200).json({
            success: true,
            fromCache: false,
            data: roadmapData
        });

    } catch (error) {

        console.error(
            "Get Roadmap By ID Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};