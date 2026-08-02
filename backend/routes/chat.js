import fetch from "node-fetch";
import express from "express";
import Chat from "../models/Chat.js";
import authMiddleware from "../middleware/authMiddleware.js";
import multer from "multer";
import mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const pdfParse = require("pdf-parse");
import fs from "fs";
import mime from "mime-types";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  }
});

const router = express.Router();

// ==============================
// LIST CHATS
// ==============================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await Chat.find({ userId }).sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    console.error("Fetch chats error:", err.message);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// ==============================
// LOAD ONE CHAT
// ==============================
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json(chat);
  } catch (err) {
    console.error("Load chat error:", err.message);
    res.status(500).json({ error: "Failed to load chat" });
  }
});

// ==============================
// CREATE NEW CHAT
// ==============================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title } = req.body;

    const chat = new Chat({
      userId,
      title: title && title.trim() ? title.trim() : "New Chat",
      messages: []
    });

    await chat.save();

    res.json(chat);
  } catch (err) {
    console.error("Create chat error:", err.message);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

// ==============================
// APPEND MESSAGES WITHOUT CALLING THE AI
// (used e.g. by image generation, which produces the assistant
// message client-side and just needs it persisted)
// ==============================
router.post("/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const validRoles = new Set(["user", "assistant"]);
    const sanitized = messages
      .filter((m) => m && validRoles.has(m.role) && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));

    if (sanitized.length === 0) {
      return res.status(400).json({ error: "No valid messages provided" });
    }

    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    chat.messages.push(...sanitized);

    if (!chat.title || chat.title === "New Chat") {
      const firstUserMsg = sanitized.find((m) => m.role === "user");
      if (firstUserMsg) {
        chat.title = firstUserMsg.content.slice(0, 30);
      }
    }

    await chat.save();

    res.json(chat);
  } catch (err) {
    console.error("Append messages error:", err.message);
    res.status(500).json({ error: "Failed to save messages" });
  }
});

// ==============================
// SEND MESSAGE (AI REPLY)
// ==============================
router.post("/:id", authMiddleware, upload.single("file"), async (req, res) => {
  let uploadedFilePath = null;

  try {
    const chat = await Chat.findById(req.params.id);

    // Null-check BEFORE touching chat.userId — previously this crashed
    // with a TypeError on any request to a non-existent chat id, because
    // the ownership check ran first and accessed .userId on null.
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { message, mode } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message is required" });
    }

    if (message.length > 8000) {
      return res
        .status(400)
        .json({ error: "Message is too long (max 8000 characters)" });
    }

    let documentText = "";
    let isImageUpload = false;

    if (req.file) {
      uploadedFilePath = req.file.path;

      if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ path: uploadedFilePath });
        documentText = result.value;
      } else if (req.file.mimetype === "application/pdf") {
        const dataBuffer = fs.readFileSync(uploadedFilePath);
        const pdfData = await pdfParse(dataBuffer);
        documentText = pdfData.text;
      } else if (mime.lookup(req.file.originalname)?.startsWith("image")) {
        isImageUpload = true;
      }

      // Cap how much document text we forward to the model so a huge
      // PDF/DOCX can't blow past reasonable prompt sizes.
      if (documentText.length > 12000) {
        documentText = documentText.slice(0, 12000) + "\n...[truncated]";
      }
    }

    // Save user message
    if (!chat.title || chat.title === "New Chat") {
      chat.title = message.slice(0, 30);
    }
    chat.messages.push({ role: "user", content: message });
    await chat.save();

    // ==============================
    // BUILD PROMPT
    // ==============================
    let systemPrompt = `
You are a smart AI assistant.

1. Detect the user's language automatically.
2. ALWAYS reply in the SAME language as the user.
3. If the user mixes languages, reply in the dominant one.
4. Be natural, human-like, and clear.
`;

    if (mode === "tutor") {
      systemPrompt += `
Explain step-by-step like a teacher.
Use simple explanations.
`;
    } else if (mode === "coder") {
      systemPrompt += `
Only give programming answers with examples.
Keep answers clean and structured.
`;
    }

    let userContent;

    if (isImageUpload) {
      userContent = `${message}\n(Note: an image was uploaded but is not analyzed by this model.)`;
    } else if (documentText) {
      userContent = `Document Content:\n\n${documentText}\n\nQuestion:\n\n${message}`;
    } else {
      userContent = message;
    }

    const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

    const hfResponse = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Qwen/Qwen2.5-7B-Instruct",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          max_tokens: 500
        }),
      }
    );

    const rawResponse = await hfResponse.text();

    let data;
    try {
      data = JSON.parse(rawResponse);
    } catch {
      console.error("HF returned non-JSON response:", rawResponse.slice(0, 500));
      return res.status(502).json({ error: "AI service returned an invalid response" });
    }

    if (data.error) {
      console.error("HF error:", data.error);
      return res.status(502).json({ error: "AI service error" });
    }

    const aiReply = data.choices?.[0]?.message?.content || "No response from AI.";

    if (aiReply.trim()) {
      chat.messages.push({ role: "assistant", content: aiReply });
      await chat.save();
    }

    // Response is sent last, after all DB writes succeed, so a save
    // failure can still produce a proper error response instead of
    // trying to send twice.
    res.send(aiReply);
  } catch (err) {
    console.error("AI error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "AI request failed" });
    }
  } finally {
    // Always clean up the uploaded temp file, even on error paths —
    // previously this only ran on the success path and orphaned files
    // accumulated in /uploads whenever something failed partway through.
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlink(uploadedFilePath, () => {});
    }
  }
});

// ==============================
// DELETE CHAT
// ==============================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await Chat.findByIdAndDelete(req.params.id);

    res.json({ message: "Chat deleted" });
  } catch (err) {
    console.error("Delete chat error:", err.message);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// ==============================
// RENAME CHAT TITLE
// ==============================
router.put("/:id/title", authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "Title is required" });
    }

    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    chat.title = title.trim();
    await chat.save();

    res.json({ message: "Title updated", chat });
  } catch (err) {
    console.error("Rename chat error:", err.message);
    res.status(500).json({ error: "Failed to rename chat" });
  }
});

export default router;
