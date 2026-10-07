import express from "express"
import { generateRoadmap, getAllRoadmap, getRoadmapbyId } from "../controlllers/roadmap.controller.js";

const roadmapRouter = express.Router();

roadmapRouter.post("/generate",generateRoadmap)

roadmapRouter.get("/all",getAllRoadmap);

roadmapRouter.get("/:id",getRoadmapbyId)

export default roadmapRouter