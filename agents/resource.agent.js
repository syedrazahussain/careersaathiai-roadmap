import llm from "../configs/llm.js";
import {
    HumanMessage,
    SystemMessage
} from "@langchain/core/messages";
import searchVideo from "../configs/youtube.js";


// ====================================================
// YOUTUBE LIMIT PER ROADMAP
// ====================================================
//
// Only first 3 modules can receive YouTube searches.
//
// This prevents a 12-module roadmap from creating
// 12 YouTube API calls.
//
// Maximum:
// 3 searches per roadmap
//
// Global:
// 80 searches per day
// ====================================================

const MAX_YOUTUBE_VIDEOS = 3;


const resourceAgent = async (state) => {

    try {

        const roadmap = state.roadmap;


        // ------------------------------------------------
        // SAFETY CHECK
        // ------------------------------------------------

        if (
            !roadmap ||
            !Array.isArray(roadmap.modules)
        ) {

            return state;
        }


        // ------------------------------------------------
        // MODULE TITLES
        // ------------------------------------------------

        const moduleTitles = roadmap.modules
            .map((module) => module.title)
            .join("\n");


        // =================================================
        // DOCUMENTATION
        // =================================================

        const docsResponse = await llm.invoke([

            new SystemMessage(`
You are an expert software engineer.

For every module below return the official documentation.

Rules:

1. Prefer official documentation.
2. If official documentation does not exist, return the best learning article.
3. Return ONLY valid JSON.
4. Do not explain anything.
5. Keep the same title.

Return format:

[
  {
    "title":"",
    "article":""
  }
]
            `),

            new HumanMessage(
                `Modules: ${moduleTitles}`
            ),
        ]);


        // ------------------------------------------------
        // PARSE DOCUMENTATION
        // ------------------------------------------------

        let docs = [];


        try {

            const content =
                String(docsResponse.content || "");


            docs = JSON.parse(
                content
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .trim()
            );

        } catch (error) {

            console.log(
                "Documentation JSON parsing failed:",
                error.message
            );

            docs = [];
        }


        // ------------------------------------------------
        // DOCUMENTATION MAP
        // ------------------------------------------------

        const docsMap = new Map();


        docs.forEach((item) => {

            if (!item?.title) {
                return;
            }


            docsMap.set(
                item.title
                    .toLowerCase()
                    .trim(),

                item.article || ""
            );

        });


        // =================================================
        // YOUTUBE
        // =================================================

        const youtubeMap = new Map();


        const youtubeModules =
            roadmap.modules.slice(
                0,
                MAX_YOUTUBE_VIDEOS
            );


        for (
            const module of youtubeModules
        ) {

            try {

                const video =
                    await searchVideo(
                        module.title
                    );


                if (video) {

                    youtubeMap.set(
                        module.title
                            .toLowerCase()
                            .trim(),

                        video.url
                    );

                }


                // ------------------------------------------------
                // If YouTube is unavailable, searchVideo()
                // simply returns null.
                //
                // We continue roadmap generation normally.
                // ------------------------------------------------

            } catch (error) {

                console.log(
                    `YouTube search failed for ${module.title}:`,
                    error.message
                );

            }
        }


        // =================================================
        // UPDATE MODULES
        // =================================================

        roadmap.modules =
            roadmap.modules.map(
                (module) => {

                    const moduleKey =
                        module.title
                            .toLowerCase()
                            .trim();


                    return {
                        ...module,

                        youtube:
                            youtubeMap.get(
                                moduleKey
                            ) || "",

                        article:
                            docsMap.get(
                                moduleKey
                            ) || "",
                    };
                }
            );


        // =================================================
        // RETURN STATE
        // =================================================

        return {
            ...state,
            roadmap,
        };


    } catch (error) {

        console.error(
            "Resource Agent Error:",
            error.message
        );


        // Never destroy the roadmap because
        // resource generation failed.

        return state;
    }
};


export default resourceAgent;