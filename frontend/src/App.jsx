import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";

axios.defaults.baseURL = "http://localhost:5000";

axios.interceptors.request.use((config)=>{

 const token = localStorage.getItem("token");

 console.log("SENDING TOKEN:", token);

 if(token){
   config.headers.Authorization = `Bearer ${token}`;
 }

 return config;

});

function App(){

const controllerRef = useRef(null);
const chatEndRef = useRef(null);


const [isLogin,setIsLogin]=useState(true);

const [username,setUsername]=useState("");
const [password,setPassword]=useState("");
const [showPassword, setShowPassword] = useState(false);
const [email, setEmail] = useState("");
const [token,setToken]=useState(
localStorage.getItem("token")
);


const [message,setMessage]=useState("");

const [chat,setChat]=useState([]);
const [chats,setChats]=useState([]);

const [chatId,setChatId]=useState("");

const [loading,setLoading]=useState(false);

const [file,setFile]=useState(null);

const [isSpeakingEnabled,setIsSpeakingEnabled]=useState(true);
const [language, setLanguage] = useState("en");


useEffect(()=>{

chatEndRef.current?.scrollIntoView({
behavior:"smooth"
});

},[chat]);


useEffect(()=>{

if(token){
fetchChats();
}

},[token]);

// ================= AUTH =================
const handleAuth = async () => {
  try {
    const type = isLogin ? "login" : "signup";

    // 🔍 DEBUG: what you're sending
    console.log("SENDING DATA:", { username, email, password });

    const res = await axios.post(`/api/auth/${type}`, {
      username,
      email,
      password
    });

    console.log("SUCCESS:", res.data);

    if (isLogin) {
      localStorage.setItem("token", res.data.token);
      setToken(res.data.token);
      alert("Login successful");
    } else {
      alert("Signup successful");
      setIsLogin(true);
    }

  } catch (err) {

    // 🔴 DEBUG: error details
    console.log("FULL ERROR:", err);
    console.log("SERVER RESPONSE:", err.response?.data);
    console.log("MESSAGE:", err.response?.data?.message);

    alert("Authentication failed");
  }
};

// ================= FETCH CHATS =================

const fetchChats = async () => {
  try {

    const res = await axios.get("/api/chat");

    setChats(res.data || []);

  } catch (err) {
    console.log(err);
  }
};


// ================= CREATE CHAT =================
const createChat = async () => {

  if (!token) {
    alert("Please login first");
    return;
  }

  try {
    const res = await axios.post("/api/chat", {});
    setChat([]);
    setChatId(res.data._id);
    fetchChats();
  } catch (err) {
    console.log(err);
  }
};

// ================= LOAD CHAT =================

const loadChat = async (id) => {
  try {

    const res = await axios.get(`/api/chat/${id}`);

    setChat(res.data.messages || []);
    setChatId(id);

  } catch (err) {
    console.log(err);
  }
};


// ================= DELETE CHAT =================

const deleteChat = async (id) => {
  try {

    await axios.delete(`/api/chat/${id}`);

    if (chatId === id) {
      setChat([]);
      setChatId("");
    }

    fetchChats();

  } catch (err) {
    console.log(err);
  }
};

// ================= SPEECH =================

const langMap = {
  en: "en-US",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR"
};
const speakText=(text)=>{


const speech=
new SpeechSynthesisUtterance(text);


speech.lang = langMap[language] || "en-US";


speechSynthesis.cancel();

speechSynthesis.speak(
speech
);


};


const startListening=()=>{

const SpeechRecognition =
window.SpeechRecognition ||
window.webkitSpeechRecognition;

if(!SpeechRecognition){

alert(
"Speech not supported"
);

return;

}


const recognition =
new SpeechRecognition();


recognition.start();



recognition.onresult=(e)=>{


const text =
e.results[0][0].transcript;


setMessage(text);


sendMessage(text);

};
};

// ================= SEND MESSAGE =================
const sendMessage = async (voice = null) => {

  if (!token) {
    alert("Please login first");
    return;
  }

  if (loading) return;

const userText = String(voice || message || "");
// ===== AI ASSISTANT COMMANDS =====
const lower = userText.toLowerCase();

if (lower.includes("open youtube")) {
  window.open("https://youtube.com", "_blank");
  return;
}

if (lower.includes("open google")) {
  window.open("https://google.com", "_blank");
  return;
}

if (lower.includes("open github")) {
  window.open("https://github.com", "_blank");
  return;
}

if (lower.startsWith("search ")) {
  const query = userText.replace("search ", "");
  window.open(`https://www.google.com/search?q=${query}`, "_blank");
  return;
}
if (lower.includes("open instagram")) {
  window.open("https://instagram.com", "_blank");
  return;
}

if (lower.includes("open whatsapp")) {
  window.open("https://web.whatsapp.com", "_blank");
  return;
}

if (lower.includes("open gmail")) {
  window.open("https://mail.google.com", "_blank");
  return;
}

if (lower.includes("what time")) {
  const time = new Date().toLocaleTimeString();
  alert("Current time is " + time);
  return;
}

if (lower.includes("what date")) {
  const date = new Date().toLocaleDateString();
  alert("Today's date is " + date);
  return;
}

if (!userText.trim()) return;

let currentId=chatId;

if(!currentId){

const res = await axios.post(
"/api/chat",
{},
{
headers:{
 Authorization: `Bearer ${token}`
},
}
);

currentId = res.data._id;

setChatId(currentId);

}

setChat(prev=>[

...prev,

{
role:"user",
content:userText
},

{
role:"assistant",
content:""
}

]);


setMessage("");

setLoading(true);

try{


const formData = new FormData();

formData.append("message", userText); // 🔥 REQUIRED
formData.append("language", language);


if(file){

formData.append(
"file",
file
);

}

controllerRef.current =
new AbortController();

const res=await fetch(

`http://localhost:5000/api/chat/${currentId}`,

{

method:"POST",
headers:{
 Authorization: `Bearer ${token}`
},

body:formData,


signal:
controllerRef.current.signal

}

);

const reader=res.body.getReader();

const decoder=new TextDecoder();


let reply="";



while(true){


const {

done,

value

}=await reader.read();



if(done)
break;



reply += decoder.decode(value);



setChat(prev=>{


let copy=[...prev];


copy[
copy.length-1
].content=reply;



return copy;


});


}




if(isSpeakingEnabled)
speakText(reply);
// ===== OPEN LINK FROM AI RESPONSE =====
const urlMatch = reply.match(/https?:\/\/[^\s]+/);

if (urlMatch) {
  window.open(urlMatch[0], "_blank");
}


setFile(null);


fetchChats();



}
catch(err){

console.log(err);

}



setLoading(false);


}// SEND MESSAGE FUNCTION ABOVE
if (!token) {
  return (
    <div className="auth-container">
      
      <div className="auth-card">

        <h2>{isLogin ? "Welcome Back 👋" : "Create Account 🚀"}</h2>

    {!isLogin && (
  <input
    placeholder="Username"
    value={username}
    onChange={(e) => setUsername(e.target.value)}
  />
)}
      <input
  type="email"
  placeholder="Email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>

        <div className="password-field">

  <input
    type={showPassword ? "text" : "password"}
    placeholder="Password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
  />

  <span
    className="toggle-password"
    onClick={() => setShowPassword(!showPassword)}
  >
    {showPassword ? "🙈" : "👁️"}
  </span>

</div>

        <button onClick={handleAuth}>
          {isLogin ? "Login" : "Signup"}
        </button>

        <p onClick={() => setIsLogin(!isLogin)}>
          {isLogin
            ? "Don't have an account? Signup"
            : "Already have an account? Login"}
        </p>

      </div>

    </div>
  );
}

return (
  <div className="app">

    <div className="sidebar">

      <button onClick={createChat}>
        + New Chat
      </button>


      {chats.map((c)=>(

        <div className="chat-item" key={c._id}>

          <span onClick={()=>loadChat(c._id)}>
            {c.title || "New Chat"}
          </span>


          <button onClick={()=>deleteChat(c._id)}>
            🗑️
          </button>

        </div>

      ))}



      <button
      onClick={()=>{

localStorage.removeItem("token");

setToken("");

setChat([]);

setChats([]);

setChatId("");

}}
      >
        Logout
      </button>


    </div>



    <div className="chat-area">


      <div className="messages">


      {chat.map((msg,index)=>(

        <div
        key={index}
        className={
          msg.role==="user"
          ?
          "user-msg"
          :
          "bot-msg"
        }
        >

          <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          >
            {msg.content}
          </ReactMarkdown>


        </div>

      ))}



      {loading && 
      <p>
        Typing...
      </p>
      }


      <div ref={chatEndRef}></div>


      </div>




      <div className="input-area">


        <button onClick={startListening}>
          🎤
        </button>



        <button
        onClick={()=>{
          speechSynthesis.cancel();
          setIsSpeakingEnabled(!isSpeakingEnabled);
        }}
        >
          🔊
        </button>




        <input
        type="file"
        accept=".pdf,.docx"
        onChange={(e)=>setFile(e.target.files[0])}
        />



<div className="input-area">

  <select
    value={language}
    onChange={(e) => setLanguage(e.target.value)}
  >
    <option value="en">English</option>
    <option value="hi">Hindi</option>
    <option value="es">Spanish</option>
    <option value="fr">French</option>
  </select>

 <input
  value={message}
  onChange={(e) => setMessage(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  }}
  placeholder="Type message..."
/>

  <button onClick={() => sendMessage()}>
    Send
  </button>

</div>




      </div>



    </div>


  </div>
);

}
export default App;

