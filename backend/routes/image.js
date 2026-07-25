import express from "express";
import fetch from "node-fetch";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/generate-image", authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const response = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!response.ok) {
  const errorText = await response.text();
  console.log("HF IMAGE ERROR:", errorText);
  return res.status(500).json({ error: "Invalid API Key or model issue" });
}

const imageBuffer = await response.arrayBuffer();

    res.set("Content-Type", "image/png");
    res.send(Buffer.from(imageBuffer));

  } catch (err) {
    console.log("HF ERROR:", err);
    res.status(500).json({ error: "Image generation failed" });
  }
});

export default router;