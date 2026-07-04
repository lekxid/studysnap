"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState } from "react";
import {
  createAIConversation,
  deleteAIConversation,
  getAIConversations,
  getAIMessages,
  renameAIConversation,
  streamAIMessage,
} from "@/lib/api";

type ConversationMode = "general" | "pdf";

type RoomAiMessage = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

type AIConversation = {
  id: number;
  title: string;
  mode?: string;
  study_room_id: number;
  created_at: string;
};

type RoomAIAssistantProps = {
  studyRoomId: number;
  conversationMode?: ConversationMode;
  title?: string;
  subtitle?: string;
  emptyPrompt?: string;
  inputPlaceholder?: string;
};

const quickActions = [
  { label: "Explain", mode: "explain", prompt: "Explain this topic in simple words:" },
  { label: "Teach Me", mode: "teach", prompt: "Teach me this topic step by step:" },
  { label: "Quiz Me", mode: "quiz", prompt: "Create a short quiz on this topic:" },
  { label: "Examples", mode: "explain", prompt: "Give examples for this topic:" },
  { label: "Simplify", mode: "explain", prompt: "Simplify this topic like I am a beginner:" },
  { label: "Practice", mode: "practice", prompt: "Give me practice questions on this topic:" },
];

export default function RoomAIAssistant({
  studyRoomId,
  conversationMode = "general",
  title = "Ask anything for this study room",
  subtitle = "General AI help for this room. Use it without uploading a PDF.",
  emptyPrompt = "Type a topic like “subnetting”, “Linux commands”, or “math fractions”.",
  inputPlaceholder = "Ask the Room AI Assistant...",
}: RoomAIAssistantProps) {
  const chatBoxRef = useRef<HTMLDivElement | null>(null);

  const conversationMenuRef = useRef<HTMLDivElement | null>(null);

  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("explain");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<RoomAiMessage[]>([]);

  const [renamingConversationId, setRenamingConversationId] = useState<number | null>(null);

  const [openConversationMenuId, setOpenConversationMenuId] = useState<number | null>(null);

 function scrollToBottom() {
  setTimeout(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, 50);
}
 
      
  async function loadMessages(conversationId: number) {
    try {
      setLoadingHistory(true);
      const data = await getAIMessages(conversationId);
      setMessages(Array.isArray(data) ? data : []);
      scrollToBottom();
    } catch (err) {
      console.error(err);
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadConversations() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) return;

    try {
      setLoadingHistory(true);
      const data = await getAIConversations(studyRoomId, conversationMode);
      const list = Array.isArray(data) ? data : [];

      setConversations(list);

      if (list.length > 0) {
        setActiveConversationId(list[0].id);
        await loadMessages(list[0].id);
      } else {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleNewChat() {
    if (!studyRoomId || Number.isNaN(studyRoomId)) return;

    try {
      setLoadingHistory(true);
      const conversation = await createAIConversation(
        studyRoomId,
        "New Conversation",
        conversationMode
      );

      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setQuestion("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSelectConversation(conversationId: number) {
  setActiveConversationId(conversationId);
  await loadMessages(conversationId);
}

function toggleConversationMenu(conversationId: number) {
  setOpenConversationMenuId((current) =>
    current === conversationId ? null : conversationId
  );
}

async function handleRenameConversation(conversation: AIConversation) {
  const newTitle = prompt("Rename conversation", conversation.title);

  if (newTitle === null) return;

  const cleanTitle = newTitle.trim();

  if (!cleanTitle) return;

  try {
    setRenamingConversationId(conversation.id);

    const updated = await renameAIConversation(
      conversation.id,
      cleanTitle
    );

    setConversations((prev) =>
      prev.map((item) =>
        item.id === conversation.id
          ? {
              ...item,
              title: updated.title,
            }
          : item
      )
    );
  } catch (err) {
    console.error(err);
    alert("Failed to rename conversation.");
  } finally {
    setRenamingConversationId(null);
  }
}

async function handleDeleteConversation(conversation: AIConversation) {
  const confirmed = confirm(
    `Delete "${conversation.title}"?`
  );

  if (!confirmed) return;

  try {
    setRenamingConversationId(conversation.id);

    await deleteAIConversation(conversation.id);

    const remaining = conversations.filter(
      (item) => item.id !== conversation.id
    );

    setConversations(remaining);

    if (activeConversationId === conversation.id) {
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
        await loadMessages(remaining[0].id);
      } else {
        setActiveConversationId(null);
        setMessages([]);
      }
    }
  } catch (err) {
    console.error(err);
    alert("Failed to delete conversation.");
  } finally {
    setRenamingConversationId(null);
  }
}

  function handleClearChat() {
    setMessages([]);
    setQuestion("");
  }

  async function sendMessageToAI(messageText: string, selectedMode: string) {
    const cleanQuestion = messageText.trim();
    if (!cleanQuestion || loading) return;

    setLoading(true);
    setQuestion("");

    try {
      let conversationId = activeConversationId;

      if (!conversationId) {
        const conversation = await createAIConversation(
          studyRoomId,
          "New Conversation",
          conversationMode
        );

        conversationId = conversation.id;
        setActiveConversationId(conversation.id);
        setConversations((prev) => [conversation, ...prev]);
      }

      if (conversationId === null) {
        throw new Error("Conversation could not be created.");
      }

      let streamedAnswer = "";

      setMessages((prev) => [
        ...prev,
        { role: "user", content: cleanQuestion },
        {
          role: "assistant",
          content:
            conversationMode === "pdf"
              ? "StudySnap PDF Assistant is reading..."
              : "StudySnap AI is thinking...",
        },
      ]);

      scrollToBottom();

      await streamAIMessage(
        conversationId,
        cleanQuestion,
        selectedMode,
        (token) => {
          streamedAnswer += token;

          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;

            if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: streamedAnswer,
              };
            }

            return updated;
          });

          scrollToBottom();
        }
      );

      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;

        if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: streamedAnswer || "No answer returned.",
          };
        }

        return updated;
      });

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId && conversation.title === "New Conversation"
            ? {
                ...conversation,
                title: cleanQuestion.slice(0, 50) || "New Conversation",
              }
            : conversation
        )
      );

      scrollToBottom();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            err instanceof Error
              ? err.message
              : "Sorry, I could not get an AI answer right now.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleAsk() {
    sendMessageToAI(question, mode);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  }

  function handleQuickAction(actionPrompt: string, actionMode: string) {
    const topic = question.trim();
    if (!topic || loading) return;

    setMode(actionMode);
    sendMessageToAI(`${actionPrompt} ${topic}`, actionMode);
  }

  async function copyText(text: string) {
  try {
    // Modern Clipboard API (works on HTTPS)
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    // Fallback for HTTP / development environments
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.setAttribute("readonly", "");

    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();

    const copied = document.execCommand("copy");

    document.body.removeChild(textArea);

    if (!copied) {
      throw new Error("Copy command failed.");
    }
  } catch (error) {
    console.error("Copy failed:", error);
    alert("Unable to copy the response.");
  }
}

  useEffect(() => {
    loadConversations();
  }, [studyRoomId, conversationMode]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

useEffect(() => {
  function handleClickOutside(event: MouseEvent) {
    if (
      conversationMenuRef.current &&
      !conversationMenuRef.current.contains(event.target as Node)
    ) {
      setOpenConversationMenuId(null);
    }
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setOpenConversationMenuId(null);
    }
  }

  document.addEventListener("mousedown", handleClickOutside);
  document.addEventListener("keydown", handleEscape);

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleEscape);
  };
}, []);

  return (
    <section className="rounded-3xl border border-cyan-400/20 bg-[#0a1022] p-6 shadow-2xl shadow-cyan-950/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
            {conversationMode === "pdf" ? "PDF Assistant" : "Room AI Assistant"}
          </p>

          <h3 className="mt-2 text-3xl font-black text-white">{title}</h3>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="rounded-2xl border border-white/10 bg-black px-5 py-4 text-sm font-semibold text-white outline-none"
          >
            <option className="bg-[#101826] text-white" value="explain">Explain</option>
<option className="bg-[#101826] text-white" value="teach">Teach me</option>
<option className="bg-[#101826] text-white" value="quiz">Create quiz</option>
<option className="bg-[#101826] text-white" value="summarize">Summarize</option>
<option className="bg-[#101826] text-white" value="practice">Practice questions</option>
          </select>

          <button
            type="button"
            onClick={handleNewChat}
            disabled={loading || loadingHistory}
            className="rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            New Chat
          </button>

          <button
            type="button"
            onClick={handleClearChat}
            disabled={loading || messages.length === 0}
            className="rounded-2xl border border-white/10 px-5 py-4 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-white/50">
            Chat History
          </p>

          {loadingHistory && conversations.length === 0 ? (
            <p className="text-sm text-slate-400">Loading chats...</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm leading-6 text-slate-400">
              No saved chats yet. Ask a question to create one.
            </p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-visible pr-1">
              {conversations.map((conversation) => (
  <div key={conversation.id} className="relative flex gap-2">
    <button
      type="button"
      onClick={() => {
  setOpenConversationMenuId(null);
  handleSelectConversation(conversation.id);
}}
      className={`min-w-0 flex-1 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
        activeConversationId === conversation.id
          ? "bg-cyan-400 text-slate-950"
          : "bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      <span className="block truncate">{conversation.title}</span>
    </button>
<div
  className="relative"
  ref={
    openConversationMenuId === conversation.id
      ? conversationMenuRef
      : null
  }
>
  <button
    type="button"
    onClick={() => toggleConversationMenu(conversation.id)}
    className="rounded-xl border border-white/10 px-3 py-2 text-white hover:bg-white/10"
  >
    ⋮
  </button>

  {openConversationMenuId === conversation.id && (
    <div
  className="absolute left-full top-0 z-50 ml-2 w-44 origin-top-left rounded-2xl border border-white/10 bg-[#101826] p-1 shadow-2xl shadow-black/50 ring-1 ring-white/5 transition-all duration-150 ease-out"
>

      <button
        type="button"
        onClick={() => {
          setOpenConversationMenuId(null);
          handleRenameConversation(conversation);
        }}
        className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/10"
      >
        ✏️ Rename
      </button>

      <button
        type="button"
        onClick={() => {
          setOpenConversationMenuId(null);
          handleDeleteConversation(conversation);
        }}
        className="block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
      >
        🗑 Delete
      </button>

    </div>
  )}
</div>
  </div>
))}
            </div>
          )}
        </aside>

        <div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => handleQuickAction(action.prompt, action.mode)}
                disabled={loading || !question.trim()}
                className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-400/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div
            ref={chatBoxRef}
            className="mt-6 max-h-[620px] space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            {messages.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-slate-300">
                {emptyPrompt}
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={message.id || index}
                  className={`rounded-2xl p-5 text-sm leading-7 ${
                    message.role === "user"
                      ? "ml-auto max-w-[85%] bg-cyan-400/10 text-cyan-100"
                      : "mr-auto max-w-[90%] bg-black text-white/85"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
                      {message.role === "user"
                        ? "You"
                        : conversationMode === "pdf"
                          ? "PDF Assistant"
                          : "StudySnap AI"}
                    </p>

                    {message.role === "assistant" ? (
                      <button
                        type="button"
                        onClick={() => copyText(message.content)}
                        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/10"
                      >
                        Copy
                      </button>
                    ) : null}
                  </div>

                  <div className="prose prose-invert max-w-none prose-p:leading-7 prose-li:leading-7 prose-headings:text-white prose-strong:text-white prose-code:text-cyan-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              className="min-h-[100px] flex-1 rounded-2xl border border-white/10 bg-black p-4 text-sm text-white outline-none placeholder:text-slate-500"
            />

            <button
              type="button"
              onClick={handleAsk}
              disabled={loading || !question.trim()}
              className="rounded-2xl bg-cyan-400 px-7 py-5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Ask AI"}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Press Enter to send. Press Shift + Enter for a new line.
          </p>
        </div>
      </div>
    </section>
  );
}