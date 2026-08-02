import express from "express";
import fetch from "node-fetch";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// A general-purpose, freely usable text-to-image model on HF Inference.
// (Swap this for any other text-to-image model id you have access to.)
const IMAGE_MODEL = "stabilityai/stable-diffusion-xl-base-1.0";

router.post("/generate-image", authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt required" });
    }

    if (prompt.length > 1000) {
      return res.status(400).json({ error: "Prompt is too long" });
    }

    // Previously this called router.huggingface.co/v1/chat/completions —
    // a TEXT chat endpoint — with an image-model-style { inputs } body.
    // That endpoint doesn't understand `inputs` and can't return image
    // bytes, so image generation was silently broken. Text-to-image
    // models are served from api-inference.huggingface.co/models/<id>.
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${IMAGE_MODEL}`,
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
      console.error("HF image generation error:", errorText.slice(0, 500));

      // HF returns 503 while a model is cold-starting/loading — worth
      // surfacing distinctly so the frontend could retry.
      if (response.status === 503) {
        return res
          .status(503)
          .json({ error: "Image model is loading, please try again shortly" });
      }

      return res.status(502).json({ error: "Image generation failed" });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      // HF sometimes returns a JSON error body with a 200 status
      const text = await response.text();
      console.error("HF returned non-image content:", text.slice(0, 500));
      return res.status(502).json({ error: "Image generation failed" });
    }

    const imageBuffer = await response.arrayBuffer();

    res.set("Content-Type", "image/png");
    res.send(Buffer.from(imageBuffer));
  } catch (err) {
    console.error("Image generation error:", err.message);
    res.status(500).json({ error: "Image generation failed" });
  }
});

export default router;
