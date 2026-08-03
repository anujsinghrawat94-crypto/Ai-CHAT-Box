import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";

// Centralized so there's a single place to change the backend URL —
// previously this was hardcoded in two places (axios baseURL and a
// raw fetch() call), which is easy to get out of sync.
const API_BASE =
  import.meta.env.VITE_API_URL || "https://ai-chat-box-dioe.onrender.com";

axios.defaults.baseURL = API_BASE;

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  // Do NOT log the token — printing it to the console is a real
  // leak vector (browser extensions, screen shares, log scrapers).
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const controllerRef = useRef(null);
  const chatEndRef = useRef(null);
  const popupInputRef = useRef(null);

  const [isLogin, setIsLogin] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token"));

  const [message, setMessage] = useState("");

  const [chat, setChat] = useState([]);
  const [chats, setChats] = useState([]);

  const [chatId, setChatId] = useState("");

  const [loading, setLoading] = useState(false);

  const [file, setFile] = useState(null);

  const [isSpeakingEnabled, setIsSpeakingEnabled] = useState(true);
  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState("normal"); // normal | tutor | coder — now actually sent to the backend
  const [showPopup, setShowPopup] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  useEffect(() => {
    if (token) {
      fetchChats();
    }
  }, [token]);

  // Auto-focus the "name your chat" field the moment the popup opens,
  // so the user can just start typing instead of having to click into it.
  useEffect(() => {
    if (showPopup) {
      // Timeout lets the popup finish mounting/animating in before focusing
      const t = setTimeout(() => popupInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showPopup]);

  const confirmNewChat = () => {
    createChat(newChatName);
    setNewChatName("");
    setShowPopup(false);
  };

  // ================= AUTH =================
  const handleAuth = async () => {
    setAuthError("");
    try {
      const type = isLogin ? "login" : "signup";

      const res = await axios.post(`/api/auth/${type}`, {
        username,
        email,
        password,
      });

      if (isLogin) {
        localStorage.setItem("token", res.data.token);
        setToken(res.data.token);
      } else {
        setIsLogin(true);
        setAuthError("Signup successful — please log in.");
      }
    } catch (err) {
      setAuthError(err.response?.data?.message || "Authentication failed");
    }
  };

  // ================= FETCH CHATS =================
  const fetchChats = async () => {
    try {
      const res = await axios.get("/api/chat");
      setChats(res.data || []);
    } catch (err) {
      console.error("Failed to fetch chats:", err.message);
    }
  };

  // ================= CREATE CHAT =================
  const createChat = async (title = "") => {
    if (!token) {
      alert("Please login first");
      return null;
    }

    try {
      const res = await axios.post("/api/chat", {
        title: title || "New Chat",
      });
      setChat([]);
      setChatId(res.data._id);
      fetchChats();
      return res.data._id;
    } catch (err) {
      console.error("Failed to create chat:", err.message);
      return null;
    }
  };

  // Ensures we have a chat to send into, creating one if needed.
  // Replaces the duplicate ad-hoc chat-creation logic that used to
  // live inline inside sendMessage.
  const ensureChatId = async () => {
    if (chatId) return chatId;
    const newId = await createChat();
    return newId;
  };

  // ================= LOAD CHAT =================
  const loadChat = async (id) => {
    try {
      const res = await axios.get(`/api/chat/${id}`);
      setChat(res.data.messages || []);
      setChatId(id);
    } catch (err) {
      console.error("Failed to load chat:", err.message);
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
      console.error("Failed to delete chat:", err.message);
    }
  };

  // ================= SPEECH =================
  const langMap = {
    en: "en-US",
    hi: "hi-IN",
    es: "es-ES",
    fr: "fr-FR",
  };

  const speakText = (text) => {
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = langMap[language] || "en-US";
    speechSynthesis.cancel();
    speechSynthesis.speak(speech);
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = langMap[language] || "en-US";

    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setMessage(text);
      sendMessage(text);
    };

    // Previously missing — failures (no mic permission, no network)
    // failed completely silently with no user feedback.
    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e.error);
      alert("Voice input failed: " + e.error);
    };

    recognition.start();
  };

  // ================= SEND MESSAGE =================
  const sendMessage = async (voice = null) => {
    if (!token) {
      alert("Please login first");
      return;
    }

    if (loading) return;

    const userText = String(voice || message || "").trim();
    if (!userText) return; // moved above the command checks for clarity

    const lower = userText.toLowerCase();

    // ===== ASSISTANT COMMANDS =====
    if (lower.includes("open youtube")) {
      window.open("https://youtube.com", "_blank", "noopener,noreferrer");
      return;
    }
    if (lower.includes("open google")) {
      window.open("https://google.com", "_blank", "noopener,noreferrer");
      return;
    }
    if (lower.includes("open github")) {
      window.open("https://github.com", "_blank", "noopener,noreferrer");
      return;
    }
    if (lower.startsWith("search ")) {
      // Was userText.replace("search ", "") — replaces the FIRST match
      // anywhere in the string, not just the prefix (e.g. "let's search
      // for search results" would strip the wrong occurrence). Since we
      // already confirmed the string starts with "search ", slice it.
      const query = userText.slice(7);
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }
    if (lower.includes("open instagram")) {
      window.open("https://instagram.com", "_blank", "noopener,noreferrer");
      return;
    }
    if (lower.includes("open whatsapp")) {
      window.open("https://web.whatsapp.com", "_blank", "noopener,noreferrer");
      return;
    }
    if (lower.includes("open gmail")) {
      window.open("https://mail.google.com", "_blank", "noopener,noreferrer");
      return;
    }
    if (lower.includes("what time")) {
      alert("Current time is " + new Date().toLocaleTimeString());
      return;
    }
    if (lower.includes("what date")) {
      alert("Today's date is " + new Date().toLocaleDateString());
      return;
    }

    // ===== IMAGE GENERATION =====
    if (
      lower.includes("generate image") ||
      lower.includes("create image") ||
      lower.includes("make image") ||
      lower.includes("draw")
    ) {
      const currentId = await ensureChatId();
      if (!currentId) return;

      setChat((prev) => [
        ...prev,
        { role: "user", content: userText },
        { role: "assistant", content: "Generating image..." },
      ]);

      setMessage("");
      setLoading(true);

      try {
        const res = await axios.post(
          "/api/image/generate-image",
          { prompt: userText },
          { responseType: "arraybuffer" }
        );

        const imageUrl =
          "data:image/png;base64," +
          btoa(
            new Uint8Array(res.data).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              ""
            )
          );

        const imageMarkdown = `![generated image](${imageUrl})`;

        setChat((prev) => {
          const copy = [...prev];
          copy[copy.length - 1].content = imageMarkdown;
          return copy;
        });

        // Previously generated images were never persisted to the
        // chat in the database — a refresh would lose them, unlike
        // normal text replies. Now we save them via the same chat.
        await axios.post(`/api/chat/${currentId}/messages`, {
          messages: [
            { role: "user", content: userText },
            { role: "assistant", content: imageMarkdown },
          ],
        });

        fetchChats();
      } catch (err) {
        console.error("Image generation failed:", err.message);
        setChat((prev) => {
          const copy = [...prev];
          copy[copy.length - 1].content = "Sorry, image generation failed.";
          return copy;
        });
      }

      setLoading(false);
      return;
    }

    // ===== NORMAL CHAT MESSAGE =====
    const currentId = await ensureChatId();
    if (!currentId) return;

    setChat((prev) => [
      ...prev,
      { role: "user", content: userText },
      { role: "assistant", content: "" },
    ]);

    setMessage("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("message", userText);
      formData.append("language", language);
      formData.append("mode", mode);

      if (file) {
        formData.append("file", file);
      }

      controllerRef.current = new AbortController();

      const res = await fetch(`${API_BASE}/api/chat/${currentId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controllerRef.current.signal,
      });

      if (!res.ok) {
        let errMsg = "Something went wrong.";
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errMsg;
        } catch {
          // response wasn't JSON — fall back to default message
        }
        setChat((prev) => {
          const copy = [...prev];
          copy[copy.length - 1].content = errMsg;
          return copy;
        });
        setLoading(false);
        return;
      }

      const reply = await res.text();

      setChat((prev) => {
        const copy = [...prev];
        copy[copy.length - 1].content = reply;
        return copy;
      });

      if (isSpeakingEnabled) speakText(reply);

      // Previously any URL found in the AI's reply was opened
      // automatically via window.open(). That's a real risk: a
      // hallucinated or (via a malicious uploaded document) injected
      // link would open without the user ever clicking anything.
      // Links in the reply are already rendered as clickable by
      // react-markdown + remark-gfm below — the user chooses whether
      // to follow them.

      setFile(null);
      fetchChats();
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Send message failed:", err.message);
        setChat((prev) => {
          const copy = [...prev];
          copy[copy.length - 1].content = "Sorry, something went wrong.";
          return copy;
        });
      }
    }

    setLoading(false);
  }; // SEND MESSAGE FUNCTION ABOVE

  const stopGenerating = () => {
    controllerRef.current?.abort();
    setLoading(false);
  };

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

          {authError && <p className="auth-error">{authError}</p>}

          <button onClick={handleAuth}>{isLogin ? "Login" : "Signup"}</button>

          <p
            className="auth-toggle"
            onClick={() => {
              setIsLogin(!isLogin);
              setAuthError("");
            }}
          >
            {isLogin
              ? "Don't have an account? Signup"
              : "Already have an account? Login"}
          </p>
        </div>
      </div>
    );
  }

  const activeChat = chats.find((c) => c._id === chatId);
  const activeTitle = activeChat?.title || (chatId ? "New Chat" : "Select or start a chat");
  const modeLabel = { normal: "Normal mode", tutor: "Tutor mode", coder: "Coder mode" }[mode];
  const isEmpty = chat.length === 0;

  // Shared between the centered "first impression" layout (no messages
  // yet) and the bottom-docked layout (once a conversation exists) —
  // defined once so both states can never drift out of sync with
  // each other's controls or handlers.
  const toolsRow = (
    <div className="tools-row">
      <div className="toolbar-group">
        <button className="icon-btn" onClick={startListening} title="Voice input">
          🎤
        </button>
        <button
          className={isSpeakingEnabled ? "icon-btn on" : "icon-btn"}
          onClick={() => {
            speechSynthesis.cancel();
            setIsSpeakingEnabled(!isSpeakingEnabled);
          }}
          title={isSpeakingEnabled ? "Mute replies" : "Unmute replies"}
        >
          🔊
        </button>
      </div>

      <div className="toolbar-group">
        <label className="file-chip">
          📎 {file ? file.name.slice(0, 16) : "Attach"}
          <input
            type="file"
            accept=".pdf,.docx,image/*"
            onChange={(e) => setFile(e.target.files[0])}
          />
        </label>
      </div>

      <div className="toolbar-group">
        <select className="mini-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">EN</option>
          <option value="hi">HI</option>
          <option value="es">ES</option>
          <option value="fr">FR</option>
        </select>

        <select className="mini-select" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="normal">Normal</option>
          <option value="tutor">Tutor</option>
          <option value="coder">Coder</option>
        </select>
      </div>
    </div>
  );

  const composerRow = (
    <div className="composer-row">
      <input
        className="composer-input"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
          }
        }}
        placeholder="Send a message..."
      />

      {loading ? (
        <button className="send-btn stop" onClick={stopGenerating}>
          Stop
        </button>
      ) : (
        <button className="send-btn" onClick={() => sendMessage()}>
          Send
        </button>
      )}
    </div>
  );

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <p className="sidebar-eyebrow">Chats</p>
          <button className="new-chat-btn" onClick={() => setShowPopup(true)}>
            + New Chat
          </button>
        </div>

        <div className="chat-list">
          {chats.map((c) => (
            <div
              className={c._id === chatId ? "chat-item active" : "chat-item"}
              key={c._id}
            >
              <span onClick={() => loadChat(c._id)}>
                {c._id === chatId && <span className="active-tick">●</span>}
                {c.title || "New Chat"}
              </span>
              <button className="delete-btn" onClick={() => deleteChat(c._id)}>
                🗑️
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            className="logout-btn"
            onClick={() => {
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
      </div>

      <div className="chat-container">
        {isEmpty ? (
          <div className="empty-state">
            <h1>What can I help with?</h1>
            <p className="empty-subtitle">
              Ask a question, upload a document, or generate an image to get started.
            </p>
            <div className="composer-wrap">
              {toolsRow}
              {composerRow}
            </div>
          </div>
        ) : (
          <>
            <div className="chat-topbar">
              <h2>{activeTitle}</h2>
              <span className="mode-chip">{modeLabel}</span>
            </div>

            {/* Messages */}
            <div className="messages">
              {chat.map((msg, index) => (
                <div
                  key={index}
                  className={msg.role === "user" ? "msg-row user" : "msg-row assistant"}
                >
                  <div className={msg.role === "user" ? "avatar user" : "avatar assistant"}>
                    {msg.role === "user" ? "U" : "AI"}
                  </div>
                  <div className="msg-bubble-wrap">
                    <span className="msg-role">{msg.role === "user" ? "You" : "Assistant"}</span>
                    <div className={msg.role === "user" ? "message user" : "message assistant"}>
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      ) : (
                        <div className="typing-row">
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={chatEndRef}></div>
            </div>

            {/* Input Section */}
            <div className="input-box">
              {toolsRow}
              {composerRow}
            </div>
          </>
        )}
      </div>

      {showPopup && (
        <div className="popup-overlay" onClick={() => setShowPopup(false)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Chat</h3>
            <p className="popup-subtitle">Give it a name, or leave it blank to call it "New Chat".</p>

            <input
              ref={popupInputRef}
              placeholder="Enter chat name..."
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmNewChat();
                } else if (e.key === "Escape") {
                  setShowPopup(false);
                }
              }}
            />

            <button onClick={confirmNewChat}>Create</button>

            <button onClick={() => setShowPopup(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
