import "dotenv/config";

import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import imageRoutes from "./routes/image.js";

const app = express();


app.use(
 cors({
  origin:"http://localhost:5173",
  credentials:true
 })
);


// Routes

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/image", imageRoutes);



// MongoDB

mongoose
.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Atlas Connected ✅"))
.catch((err)=>console.log("MongoDB Error ❌",err));




// Server

app.listen(5000,()=>{
 console.log("Server running on port 5000 🚀");
});