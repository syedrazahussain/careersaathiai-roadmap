import express from "express";
import dotenv from 'dotenv';
import connectDB from "./configs/db.js";
import roadmapRouter from "./routes/roadmap.routes.js";




dotenv.config()
const app = express();
app.use(express.json())
const PORT = process.env.PORT || 6004


app.get('/',(req,res)=>{
    res.send("hello from Roadmap service");
})


app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "roadmap",
    });
});

app.use('/',roadmapRouter)





app.listen(PORT,()=>{
    console.log(`Roadmap service is running at port ${PORT}`)
    connectDB()
})