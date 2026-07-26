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
import path from "path";
import mime from "mime-types";


const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});
const router = express.Router();
router.get("/", authMiddleware, async (req, res) => {
  try {

    const userId = req.user.id;

    const chats = await Chat.find({ userId }).sort({ createdAt: -1 });

    console.log("FETCH CHATS:", chats.length);

    res.json(chats);

  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: "Failed to fetch chats"
    });
  }
});
router.get("/:id", authMiddleware, async (req,res)=>{
  try {
       if(!chat){
      return res.status(404).json({
        error:"Chat not found"
      });
    const chat = await Chat.findById(req.params.id);


   
    }


    // security check
    if(chat.userId.toString() !== req.user.id){
      return res.status(403).json({
        error:"Not authorized"
      });
    }


    console.log("LOAD CHAT:", chat._id);


    res.json(chat);


  } catch(err){

    console.log("LOAD CHAT ERROR:",err);

    res.status(500).json({
      error:"Failed to load chat"
    });

  }
});


// ==============================
// CREATE NEW CHAT
// ==============================//
router.post("/", authMiddleware, async (req, res) => {
  try {

    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        error: "User id missing from token"
      });
    }

    const chat = new Chat({
      userId,
      title: "New Chat",
      messages: []
    });

    await chat.save();

    console.log("CHAT CREATED:", chat._id);

    res.json(chat);

  } catch (err) {

    console.log("CREATE CHAT ERROR:", err);

    res.status(500).json({
      error: "Failed to create chat"
    });

  }
})

// ==============================
// SEND MESSAGE
// ==============================

router.post("/:id", authMiddleware, upload.single("file"), async (req, res) => {

  try {


    const chat = await Chat.findById(req.params.id);
    if (chat.userId.toString() !== req.user.id) {
  return res.status(403).json({
    error: "Not authorized"
  });
}



    if (!chat) {

      return res.status(404).json({

        error: "Chat not found"

      });

    }



   const { message, mode } = req.body;
   let documentText = "";

if (req.file) {

  const filePath = req.file.path;


  // DOCX FILE
  if (req.file.originalname.endsWith(".docx")) {

    const result = await mammoth.extractRawText({
      path: filePath
    });

    documentText = result.value;

  }


  // PDF FILE
  if (req.file.originalname.endsWith(".pdf")) {

    const dataBuffer = fs.readFileSync(filePath);

   const pdfData = await pdfParse(dataBuffer);

documentText = pdfData.text;
  }


}



    // Check empty message

    if (!message || message.trim() === "") {

      return res.status(400).json({

        error: "Message is required"

      });

    }



    // Create title from first message

    if (!chat.title || chat.title === "New Chat") {


      chat.title = message.slice(0, 30);


    }



    // Save user message

    chat.messages.push({

      role: "user",

      content: message

    });



    await chat.save();



// ==============================
// CALL GROQ AI
// ==============================
// ==============================
// CALL GROQ AI (STREAMING)
// ==============================
let basePrompt = `
You are a smart AI assistant.

1. Detect the user's language automatically.
2. ALWAYS reply in the SAME language as the user.
3. If the user mixes languages, reply in the dominant one.
4. Be natural, human-like, and clear.
`;

let systemPrompt = basePrompt;

if (mode === "tutor") {
  systemPrompt = basePrompt + `
Explain step-by-step like a teacher.
Use simple explanations.
`;
}

if (mode === "coder") {
  systemPrompt = basePrompt + `
Only give programming answers with examples.
Keep answers clean and structured.
`;
}

let fullReply = "";

let userContent;


// IMAGE INPUT
if (
  req.file &&
  mime.lookup(req.file.originalname)?.startsWith("image")
)
 {

  const imageBuffer = fs.readFileSync(req.file.path);

  const base64Image = imageBuffer.toString("base64");

 userContent = message + "\n(Note: image uploaded but not processed)";

}


// DOCUMENT INPUT
else if(documentText){

  userContent = `
Document Content:

${documentText}


Question:

${message}
`;

}


// NORMAL CHAT
else {

  userContent = message;

}

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
console.log("HF KEY EXISTS:", !!HF_API_KEY);

const hfResponse = await fetch(
  "https://router.huggingface.co/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "Qwen/Qwen2.5-7B-Instruct:nebius",
      messages: [
        {
          role: "user",
          content: userContent
        }
      ],
      max_tokens: 500
    }),
  }
);
const rawResponse = await hfResponse.text();

console.log("HF STATUS:", hfResponse.status);
console.log("HF RAW RESPONSE:", rawResponse);

let data;

try {
  data = JSON.parse(rawResponse);
} catch {
  return res.status(500).send("HF RAW ERROR: " + rawResponse);
}
console.log("HF RESPONSE:", data);

// 🔥 handle invalid API key or model errors
return res.status(500).send("AI Error: " + JSON.stringify(data.error));

const aiReply =
  data.choices?.[0]?.message?.content ||
  "No response from AI.";

fullReply = aiReply;

// send response (NO streaming)
res.send(fullReply);


// ✅ Save final AI message
if (fullReply.trim()) {
  chat.messages.push({
    role: "assistant",
    content: fullReply,
  });
}

await chat.save();
if(req.file){

 const filePath=req.file.path;

 if(fs.existsSync(filePath)){
   fs.unlinkSync(filePath);
 }

}

// 🔥 end stream



} catch (err) {


console.log("AI ERROR:", err);


res.status(500).send(
  "AI Error: " + err.message
);


}


});
// ==============================
// DELETE CHAT
// ==============================

router.delete("/:id", authMiddleware, async (req, res) => {
  try {

    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found"
      });
    }

    // 🔐 Check ownership
    if (chat.userId.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Not authorized"
      });
    }

    await Chat.findByIdAndDelete(req.params.id);

    console.log("CHAT DELETED:", req.params.id);

    res.json({
      message: "Chat deleted"
    });

  } catch (err) {
    console.log("DELETE ERROR:", err);
    res.status(500).json({
      error: "Failed to delete chat"
    });
  }
});
// ==============================
// RENAME CHAT TITLE
// ==============================
router.put("/:id/title", authMiddleware, async (req, res) => {
  try {

    const { title } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({
        error: "Title is required"
      });
    }

    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found"
      });
    }

    // 🔐 ownership check
    if (chat.userId.toString() !== req.user.id) {
      return res.status(403).json({
        error: "Not authorized"
      });
    }

    chat.title = title;
    await chat.save();

    res.json({
      message: "Title updated",
      chat
    });

  } catch (err) {
    console.log("RENAME ERROR:", err);
    res.status(500).json({
      error: "Failed to rename chat"
    });
  }
});

export default router;