import React, { useState, useEffect, useRef,useCallback } from "react";
import "./App.css";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/clerk-react";


const API_URL = process.env.REACT_APP_BACKEND_URL;
const MODELS = [
  { name: "llama3-8b-8192", provider: "groq" },
  { name: "llama3-70b-8192", provider: "groq" },
  { name: "google/gemma-2b-it", provider: "huggingface" },
  { name: "mistralai/Mistral-Nemo-Instruct-2407", provider: "huggingface" },
  { name: "deepseek/deepseek-r1-0528-qwen3-8b:free", provider: "openrouter" },
];


export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typingPlaceholderIndex, setTypingPlaceholderIndex] = useState(0);
  const [theme, setTheme] = useState("light");
  const [model, setModel] = useState(MODELS[0]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const inputRef = useRef();
  const responseRef = useRef();
  const settingsRef = useRef();
  const typingRef = useRef();
 
  const placeholders = [
    "Analyzing your question...",
    "Thinking...",
    "Crafting response...",
    "Generating insights...",
  ];
  const [imageResults, setImageResults] = useState({});
  const [imageLoading, setImageLoading] = useState(false);
  const { getToken } = useAuth();
  const callProtectedBackend = async () => {
    const token = await getToken(); // Get token from Clerk
    console.log("Frontend token:", token);
    const res = await fetch("http://localhost:5000/protected-route", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    console.log("✅ Backend Response:", data);
  };
  
  useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  useEffect(() => {
    if (!typing) return;
    const interval = setInterval(() => {
      setTypingPlaceholderIndex((i) => (i + 1) % placeholders.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [typing, placeholders.length]);

  const fetchSessions = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`${API_URL}/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setSessions(data);
  }, [getToken]);

  const fetchHistory = useCallback(
    async (id) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHistory(data.history || []);
    },
    [getToken]
  );


  useEffect(() => {
    const init = async () => {
      const token = await getToken();
      let id = localStorage.getItem("sessionId");

      // Try using existing sessionId
      let isValidSession = false;
      if (id) {
        const res = await fetch(`${API_URL}/history/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.history) isValidSession = true;
      }

      // If no valid session, create new one
      if (!isValidSession) {
        const res = await fetch(`${API_URL}/start-session`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        id = (await res.json()).sessionId;
        localStorage.setItem("sessionId", id);
      }

      setSessionId(id);
      await fetchSessions();
      await fetchHistory(id);
    };

    init();
  }, [getToken, fetchSessions, fetchHistory]);
  
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    setShowHistory(false);
    try {
      const token = await getToken();

      const res = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          question,
          model: model.name,
          provider: model.provider,
        }),
      });

      // 🔐 Check for 403 forbidden
      if (res.status === 403) {
        alert("Session expired or unauthorized. Starting a new session...");
        await startNewSession();
        return;
      }

      const data = await res.json();
      if (data.answer) {
        setAnswer(data.answer);
        setHistory((h) => [{ question, answer: data.answer }, ...h]);
        setQuestion("");
        inputRef.current?.focus();
      }
      
    } catch {
      setAnswer("Error sending question.");
    } finally {
      setLoading(false);
    }
  };
  const handleRegenerate = async () => {
    if (!history.length) return;
    setLoading(true);
    setAnswer("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          model: model.name,
          provider: model.provider,
        }),
      });
      const data = await res.json();
      if (data.answer) {
        const lastQ = history[0].question;
        setAnswer(data.answer);
        setHistory((h) => [{ question: lastQ, answer: data.answer }, ...h]);
      }
    } catch {
      setAnswer("Error regenerating.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleImageSearch = async () => {
    const names = extractPersonNamesFromAnswer(answer);
    if (names.length === 0) {
      alert("No person names found in the answer.");
      return;
    }
    setImageLoading(true);
    setImageResults({});
    try {
      const res = await fetch(`${API_URL}/api/get-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personNames: names }),
      });
      const data = await res.json();
      setImageResults(data);
    } catch (err) {
      console.error("Error fetching images:", err);
      alert("⚠️ Failed to fetch images.");
    } finally {
      setImageLoading(false);
    }
  };

  
  
  useEffect(() => {
    if (!answer) return;
    setTyping(true);
    setTypingIndex(0);
    clearInterval(typingRef.current);
    typingRef.current = setInterval(() => {
      setTypingIndex((i) => {
        if (i >= answer.length) {
          clearInterval(typingRef.current);
          setTyping(false);
          return i;
        }
        return i + 1;
      });
    }, 20);
  }, [answer]);

  useEffect(() => {
    if (responseRef.current && answer) {
      responseRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [answer]);

  useEffect(() => {
    const handler = (e) => {
      if (settingsOpen && !settingsRef.current.contains(e.target)) {
        setSettingsClosing(true);
        setTimeout(() => {
          setSettingsOpen(false);
          setSettingsClosing(false);
        }, 200);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  const startNewSession = async () => {
    const token = await getToken();
    const res = await fetch(`${API_URL}/start-session`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const newId = (await res.json()).sessionId;
    localStorage.setItem("sessionId", newId);
    setSessionId(newId);
    setHistory([]);
    setQuestion("");
    setAnswer("");
    fetchSessions();
    inputRef.current?.focus();
  };

  const deleteSession = async (id) => {
    const token = await getToken();
    await fetch(`${API_URL}/history/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (id === sessionId) startNewSession();
    fetchSessions();
  };

  const renameSession = async (id, title) => {
    const token = await getToken();
    await fetch(`${API_URL}/sessions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title }),
    });
    setEditingId(null);
    fetchSessions();
  };
  function extractPersonNamesFromAnswer(text) {
    const regex = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g;
    const matches = text.match(regex);
    return [...new Set(matches)] || [];
  }
  

  return (
    <div className={`App ${theme}`}>
      <header className="header-with-auth">
        <h1 className="center-heading">AI Query Assistant</h1>

        <SignedIn>
          <div className="auth-buttons">
            <UserButton afterSignOutUrl="/" />
          </div>
        </SignedIn>
      </header>

      <SignedIn>
        {/* 🔐 Full App Only for Signed In Users */}
        <button className="new-chat-btn" onClick={startNewSession}>
          ➕ New Chat
        </button>
        <button onClick={callProtectedBackend}>🔐 Test Backend Auth</button>


        <div className="settings-container">
          <button
            className={`floating-settings-btn ${settingsOpen ? "rotated" : ""}`}
            onClick={() => setSettingsOpen((s) => !s)}
          >
            ⚙️
          </button>
          {settingsOpen && (
            <div
              ref={settingsRef}
              className={`floating-settings-panel${
                settingsClosing ? " closing" : ""
              }`}
            >
              <div className="setting-item">
                <label>Theme:</label>
                <button
                  onClick={() =>
                    setTheme((t) => (t === "light" ? "dark" : "light"))
                  }
                >
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
              </div>
              <div className="setting-item">
                <label>Model:</label>
                <select
                  value={model.name}
                  onChange={(e) =>
                    setModel(MODELS.find((m) => m.name === e.target.value))
                  }
                  disabled={loading || typing}
                >
                  {MODELS.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="main-layout">
          {/* Sidebar */}
          <div className="chat-sidebar">
            <h3>Past Chats</h3>
            {sessions.map((s) => (
              <div key={s.sessionId} className="chat-item">
                <button
                  onClick={() => {
                    localStorage.setItem("sessionId", s.sessionId);
                    setSessionId(s.sessionId);
                    fetchHistory(s.sessionId);
                    setAnswer("");
                    setQuestion("");
                  }}
                >
                  {editingId === s.sessionId ? (
                    <input
                      className="rename-input"
                      defaultValue={s.title || ""}
                      onBlur={(e) => renameSession(s.sessionId, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.target.blur();
                      }}
                      autoFocus
                    />
                  ) : (
                    s.title || "Untitled Chat"
                  )}
                </button>
                <div
                  className="menu-btn"
                  onClick={() =>
                    setMenuOpenFor((p) =>
                      p === s.sessionId ? null : s.sessionId
                    )
                  }
                >
                  ⋯
                </div>
                {menuOpenFor === s.sessionId && (
                  <div className="popup-menu">
                    <div
                      className="popup-item"
                      onClick={() => {
                        setEditingId(s.sessionId);
                        setMenuOpenFor(null);
                      }}
                    >
                      Rename
                    </div>
                    <div
                      className="popup-item"
                      onClick={() => deleteSession(s.sessionId)}
                    >
                      Delete
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Chat Input and Answer Display */}
          <form onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                typing
                  ? placeholders[typingPlaceholderIndex]
                  : "Ask anything..."
              }
              disabled={typing}
              rows={question.split("\n").length || 1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button type="submit" disabled={loading || typing}>
              {loading ? (
                <>
                  <span className="spinner"></span> Processing...
                </>
              ) : typing ? (
                <>
                  <span className="spinner analyzing"></span> Analyzing...
                </>
              ) : (
                "Ask"
              )}
            </button>
          </form>

          {answer && (
            <div className="response-box" ref={responseRef}>
              <h2>AI Response:</h2>
              <div
                className="ai-text"
                dangerouslySetInnerHTML={{
                  __html: answer.slice(0, typingIndex),
                }}
              />
              <button
                onClick={handleRegenerate}
                className="regenerate-btn"
                disabled={loading || typing}
              >
                🔄 Regenerate
              </button>
              <button
                className="image-btn"
                onClick={handleImageSearch}
                disabled={typing || loading || !answer}
              >
                🖼️ Show Related Images
              </button>
            </div>
          )}

          {imageLoading ? (
            <div className="loading-spinner">Loading images...</div>
          ) : (
            Object.keys(imageResults).length > 0 && (
              <div className="image-gallery">
                <h3>🔍 Related Images:</h3>
                <div className="images-row">
                  {Object.entries(imageResults).map(([name, data]) =>
                    data.fallback ? (
                      <div key={name} className="image-wrapper">
                        <div className="image-card">
                          <img
                            src={data.fallback}
                            alt={name}
                            onError={(e) => (e.target.style.display = "none")}
                          />
                        </div>
                        <p className="image-name">{name}</p>
                      </div>
                    ) : (
                      <p key={name}>❌ No image found for {name}</p>
                    )
                  )}
                </div>
              </div>
            )
          )}

          <button
            className="toggle-button"
            onClick={() => setShowHistory((s) => !s)}
            disabled={typing}
          >
            {showHistory ? "Hide History" : "Show History"}
          </button>

          {showHistory && history.length > 0 && (
            <div className="history-box">
              <h2>🕘 Chat History</h2>
              {history.map((item, idx) => (
                <div key={idx} className="history-item">
                  <strong>Q:</strong> {item.question}
                  <br />
                  <strong>A:</strong>{" "}
                  <div dangerouslySetInnerHTML={{ __html: item.answer }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </SignedIn>

      <SignedOut>
        {/* 🔒 View for signed-out users */}
        <div className="center-text">
          <p>Please sign in to use the AI Assistant.</p>
          <SignInButton mode="modal" />
        </div>
      </SignedOut>
    </div>
  );
  
}
