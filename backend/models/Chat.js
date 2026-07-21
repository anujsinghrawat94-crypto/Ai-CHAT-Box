import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  title: {
    type: String,
    default: "New Chat"
  },

  messages: [
    {
      role: String,
      content: String
    }
  ]

}, { timestamps: true });   // 🔥 ADD THIS LINE

export default mongoose.model("Chat", chatSchema);