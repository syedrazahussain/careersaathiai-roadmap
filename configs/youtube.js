import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import redis from "../shared/redis/redis.js"

const BASE_URL = "https://www.googleapis.com/youtube/v3/search";

// ====================================================
// SETTINGS
// ====================================================

// Maximum YouTube API searches this service can make
// per Pacific calendar day.
const MAX_YOUTUBE_SEARCHES_PER_DAY = 80;

// Cache YouTube results for 7 days.
const YOUTUBE_CACHE_TIME = 60 * 60 * 24 * 7;


// ====================================================
// GET PACIFIC DATE
// ====================================================

const getPacificDate = () => {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
};


// ====================================================
// CREATE CACHE KEY
// ====================================================

const createCacheKey = (topic) => {
    return `youtube:${topic
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")}`;
};


// ====================================================
// CREATE DAILY STATUS KEY
// ====================================================

const createDailyStatusKey = () => {
    const pacificDate = getPacificDate();

    return `youtube:daily:status:${pacificDate}`;
};


// ====================================================
// SEARCH VIDEO
// ====================================================

const searchVideo = async (topic) => {

    try {

        // ------------------------------------------------
        // BASIC VALIDATION
        // ------------------------------------------------

        if (!topic) {
            return null;
        }


        // ------------------------------------------------
        // MASTER SWITCH
        // ------------------------------------------------

        if (process.env.YOUTUBE_ENABLED === "false") {

            console.log(
                "YouTube search is disabled."
            );

            return null;
        }


        // ------------------------------------------------
        // CHECK IF YOUTUBE WAS ALREADY DISABLED TODAY
        // ------------------------------------------------
        //
        // If a previous request received a 429 quota error,
        // we don't make another YouTube request today.
        //
        // This is important because your quota is already
        // exhausted.
        // ------------------------------------------------

        const dailyStatusKey = createDailyStatusKey();

        const dailyStatus = await redis.get(
            dailyStatusKey
        );


        if (dailyStatus === "QUOTA_EXHAUSTED") {

            console.log(
                "YouTube quota already exhausted for today. Skipping search."
            );

            return null;
        }


        // ------------------------------------------------
        // CHECK CACHE
        // ------------------------------------------------
        //
        // Cache hits do NOT consume YouTube API quota.
        // ------------------------------------------------

        const cacheKey = createCacheKey(topic);

        const cachedVideo = await redis.get(
            cacheKey
        );


        if (cachedVideo) {

            console.log(
                `YouTube cache hit: ${topic}`
            );

            return JSON.parse(cachedVideo);
        }


        // ------------------------------------------------
        // DAILY SEARCH COUNTER
        // ------------------------------------------------

        const pacificDate = getPacificDate();

        const dailyKey =
            `youtube:daily:searches:${pacificDate}`;


        const searchCount = await redis.incr(
            dailyKey
        );


        // ------------------------------------------------
        // HARD 80 SEARCH LIMIT
        // ------------------------------------------------

        if (
            searchCount >
            MAX_YOUTUBE_SEARCHES_PER_DAY
        ) {

            console.log(
                `YouTube daily application limit reached: ${searchCount}/${MAX_YOUTUBE_SEARCHES_PER_DAY}`
            );

            return null;
        }


        console.log(
            `YouTube API search ${searchCount}/${MAX_YOUTUBE_SEARCHES_PER_DAY}: ${topic}`
        );


        // ------------------------------------------------
        // ONLY ONE YOUTUBE SEARCH
        // ------------------------------------------------

        const query = `${topic} Tutorial`;


        const { data } = await axios.get(
            BASE_URL,
            {
                params: {
                    key: process.env.YOUTUBE_API_KEY,
                    part: "snippet",
                    q: query,
                    maxResults: 1,
                    type: "video",
                },
            }
        );


        // ------------------------------------------------
        // NO RESULTS
        // ------------------------------------------------

        if (
            !data.items ||
            data.items.length === 0
        ) {

            // Cache null result so the same topic isn't
            // searched repeatedly.
            await redis.set(
                cacheKey,
                JSON.stringify(null),
                "EX",
                YOUTUBE_CACHE_TIME
            );

            return null;
        }


        // ------------------------------------------------
        // GET VIDEO
        // ------------------------------------------------

        const video = data.items[0];


        if (!video?.id?.videoId) {

            await redis.set(
                cacheKey,
                JSON.stringify(null),
                "EX",
                YOUTUBE_CACHE_TIME
            );

            return null;
        }


        // ------------------------------------------------
        // CREATE RESULT
        // ------------------------------------------------

        const result = {
            title:
                video.snippet?.title || "",

            channel:
                video.snippet?.channelTitle || "",

            url:
                `https://www.youtube.com/watch?v=${video.id.videoId}`,
        };


        // ------------------------------------------------
        // SAVE TO REDIS
        // ------------------------------------------------

        await redis.set(
            cacheKey,
            JSON.stringify(result),
            "EX",
            YOUTUBE_CACHE_TIME
        );


        return result;


    } catch (error) {

        // =================================================
        // YOUTUBE QUOTA EXHAUSTED
        // =================================================

        if (
            error.response?.status === 429
        ) {

            console.error(
                "YouTube quota exhausted. Disabling YouTube searches for today."
            );


            // ------------------------------------------------
            // STORE DAILY QUOTA STATUS
            // ------------------------------------------------
            //
            // 30 hours is intentionally used instead of
            // exactly 24 hours so the key safely survives
            // until after the next Pacific midnight.
            // ------------------------------------------------

            const dailyStatusKey =
                createDailyStatusKey();


            await redis.set(
                dailyStatusKey,
                "QUOTA_EXHAUSTED",
                "EX",
                60 * 60 * 30
            );


            return null;
        }


        // =================================================
        // OTHER YOUTUBE ERRORS
        // =================================================

        console.error(
            "YouTube API Error:",
            error.response?.status,
            error.response?.data || error.message
        );


        return null;
    }
};


export default searchVideo;