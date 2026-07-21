import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { GoogleGenerativeAI } from "@google/generative-ai";


const router = express.Router();


const genAI = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY
);


router.post("/generate", authMiddleware, async(req,res)=>{

try{


const {prompt}=req.body;


if(!prompt){
    return res.status(400).json({
        error:"Prompt required"
    });
}



const model = genAI.getGenerativeModel({
    model:"gemini-2.0-flash"
});


const result = await model.generateContent(prompt);


const response =
result.response.text();



res.json({

success:true,
result:response

});


}catch(err){

console.log("GEMINI IMAGE ERROR:",err);


res.status(500).json({

error:"Gemini failed"

});


}


});


export default router;