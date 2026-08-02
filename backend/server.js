import "dotenv/config";

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import fs from "fs";

import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import imageRoutes from "./routes/image.js";

const app = express();

// Make sure the uploads directory exists — multer's disk storage
// does NOT create it automatically, and previously this would crash
// the first time a file was uploaded on a fresh deploy.
const UPLOAD_DIR = "uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173", // Vite's default dev server port
      "https://ai-chat-box-1-y8ai.onrender.com"
    ]
    // credentials: true was removed — this app authenticates with a
    // Bearer token (Authorization header) via axios/fetch, not cookies,
    // so credentialed CORS isn't needed and only widens the attack surface.
  })
);

app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/image", imageRoutes);

// Basic health check — useful for uptime monitors / Render health checks
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Catches multer errors (bad file type, file too large) and any other
// error passed to next(err) so the client always gets JSON, not an
// HTML stack trace page.
app.use((err, req, res, next) => {
  if (err) {
    console.error("Unhandled error:", err.message);
    return res.status(400).json({ error: err.message || "Request failed" });
  }
  next();
});

// MongoDB
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set. Check your .env file.");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Atlas Connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

// Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
