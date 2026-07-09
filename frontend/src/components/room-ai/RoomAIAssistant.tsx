"use client";

import MessageBubble from "@/components/room-ai/MessageBubble";
import { useEffect, useRef, useState } from "react";
import {
  askAiWithImage,
  createAIConversation,
  deleteAIConversation,
  executeBrainAction,
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
  imagePreview?: string;
  imageName?: string;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const conversationMenuRef = useRef<HTMLDivElement | null>(null);

  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("explain");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<RoomAiMessage[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState("");

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

  async function handleResetChat() {
    if (!activeConversationId) return;

    try {
      setQuestion("");
      await loadMessages(activeConversationId);
      scrollToBottom();
    } catch (err) {
      console.error(err);
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

  function removeSelectedImage() {
    setSelectedImage(null);
    setSelectedImagePreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleImageChange(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    const maxSize = 8 * 1024 * 1024;

    if (file.size > maxSize) {
      alert("Image must be 8MB or smaller.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setSelectedImage(file);
      setSelectedImagePreview(String(reader.result || ""));
    };

    reader.readAsDataURL(file);
  }

  function handleClearChat() {
    setMessages([]);
    setQuestion("");
    removeSelectedImage();
  }

  async function sendMessageToAI(
    messageText: string,
    selectedMode: string,
    imageFile?: File | null,
    imagePreview?: string,
    imageName?: string
  ) {
    const cleanQuestion = messageText.trim();
    if ((!cleanQuestion && !imageFile) || loading) return;

    const finalQuestion = cleanQuestion || "Describe this image clearly.";

    setLoading(true);
    setQuestion("");
    removeSelectedImage();

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
        {
          role: "user",
          content: imageFile ? `[Image uploaded] ${finalQuestion}` : finalQuestion,
          imagePreview: imagePreview || undefined,
          imageName,
        },
        {
          role: "assistant",
          content:
            imageFile
              ? "StudySnap AI is reading the image..."
              : conversationMode === "pdf"
                ? "StudySnap PDF Assistant is reading..."
                : "StudySnap AI is thinking...",
        },
      ]);

      scrollToBottom();

      if (imageFile) {
        const data = await askAiWithImage(finalQuestion, imageFile, {
          studyRoomId,
          conversationId,
        });

        const answer =
          data && typeof data.answer === "string"
            ? data.answer
            : "No answer returned.";

        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;

          if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: answer,
            };
          }

          return updated;
        });
      } else {
        await streamAIMessage(
          conversationId,
          finalQuestion,
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
      }

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId && conversation.title === "New Conversation"
            ? {
                ...conversation,
                title: finalQuestion.slice(0, 50) || "New Conversation",
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

  function shouldTryBrainActionCommand(value: string) {
    const clean = value.trim().toLowerCase();

    if (!clean) return false;

    const saveCommands = [
      "save it",
      "save this",
      "save it to note",
      "save this to note",
      "save to note",
      "save as note",
      "make this a note",
      "turn this into a note",
      "add this to notes",
    ];

    if (saveCommands.includes(clean)) return true;

    if (
      /^(create\s+(a\s+)?note|new\s+note|note|save\s+note|add\s+note)\s*[:\-]/i.test(
        value.trim()
      )
    ) {
      return true;
    }

    return /^(create|new|add)\s+((a\s+)?(room|project)|rooms|projects)\s*[:\-]/i.test(
      value.trim()
    );
  }

  async function ensureConversationForAction() {
    if (activeConversationId) {
      return activeConversationId;
    }

    const conversation = await createAIConversation(
      studyRoomId,
      "New Conversation",
      conversationMode
    );

    setActiveConversationId(conversation.id);
    setConversations((prev) => [conversation, ...prev]);

    return conversation.id;
  }

  async function tryHandleBrainAction(command: string) {
    if (!shouldTryBrainActionCommand(command) || selectedImage) {
      return false;
    }

    try {
      setLoading(true);

      const conversationId = await ensureConversationForAction();

      const data = await executeBrainAction(command, {
        studyRoomId,
        conversationId,
      });

      if (!data?.handled) {
        return false;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: command,
        },
        {
          role: "assistant",
          content: data.message || "✅ Done.",
        },
      ]);

      setQuestion("");
      removeSelectedImage();
      scrollToBottom();

      return true;
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: command,
        },
        {
          role: "assistant",
          content:
            err instanceof Error
              ? `I tried to do that action, but it failed: ${err.message}`
              : "I tried to do that action, but it failed.",
        },
      ]);

      setQuestion("");
      scrollToBottom();

      return true;
    } finally {
      setLoading(false);
    }
  }

  async function handleAsk() {
    const cleanQuestion = question.trim();

    if (cleanQuestion) {
      const handledAction = await tryHandleBrainAction(cleanQuestion);

      if (handledAction) {
        return;
      }
    }

    const imageToSend = selectedImage;
    const imagePreviewToSend = selectedImagePreview;
    const imageNameToSend = selectedImage?.name;
    const finalQuestion =
      cleanQuestion || (imageToSend ? "Describe this image clearly." : "");

    sendMessageToAI(
      finalQuestion,
      mode,
      imageToSend,
      imagePreviewToSend,
      imageNameToSend
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleAsk();
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
            onClick={handleResetChat}
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
  <MessageBubble
    key={message.id || index}
    role={message.role}
    content={message.content}
    label={
      message.role === "user"
        ? "You"
        : conversationMode === "pdf"
          ? "PDF Assistant"
          : "StudySnap AI"
    }
    imagePreview={message.imagePreview}
    imageName={message.imageName}
    onCopy={() => copyText(message.content)}
  />
))
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => handleImageChange(event.target.files?.[0])}
            />

            {selectedImagePreview ? (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3">
                <img
                  src={selectedImagePreview}
                  alt="Selected upload preview"
                  className="h-16 w-16 rounded-xl object-cover"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-white">
                    {selectedImage?.name || "Selected image"}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    Ask Project AI about this image.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={removeSelectedImage}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/[0.08]"
                >
                  Remove
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedImage ? "Ask about this image..." : inputPlaceholder}
                className="min-h-[100px] flex-1 resize-none bg-transparent p-3 text-sm text-white outline-none placeholder:text-slate-500"
              />

              <div className="flex gap-3 sm:flex-col">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="rounded-2xl border border-white/10 px-5 py-4 text-xl font-black text-white transition hover:bg-white/10 disabled:opacity-50"
                  title="Upload image"
                >
                  ＋
                </button>

                <button
                  type="button"
                  onClick={handleAsk}
                  disabled={loading || (!question.trim() && !selectedImage)}
                  className="rounded-2xl bg-cyan-400 px-7 py-5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Thinking..." : "Ask AI"}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Press Enter to send. Press Shift + Enter for a new line. Use ＋ to ask about an image.
          </p>
        </div>
      </div>
    </section>
  );
}