"use client";

import {
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import StudyTrailPanel from "@/components/ai/StudyTrailPanel";
import SimpleMarkdown from "@/components/ui/SimpleMarkdown";
import {
  createAIConversation,
  deleteAIConversation,
  getAIConversations,
  getAIMessages,
  pinAIConversation,
  renameAIConversation,
  streamAIMessage,
  type AIConversation,
  type AIMessage,
} from "@/lib/api";

type ChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

type CompactProjectAIProps = {
  studyRoomId: number;
  projectTitle: string;
};

const quickPrompts = [
  "What should I study first in this project?",
  "What are my weak concepts?",
  "Quiz me from this room.",
  "Create a quick review plan.",
];

function makeId() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function mapStoredMessage(
  message: AIMessage
): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  };
}

export default function CompactProjectAI({
  studyRoomId,
  projectTitle,
}: CompactProjectAIProps) {
  const chatRef = useRef<HTMLDivElement | null>(
    null
  );

  const [trails, setTrails] = useState<
    AIConversation[]
  >([]);

  const [
    activeConversationId,
    setActiveConversationId,
  ] = useState<number | null>(null);

  const [messages, setMessages] = useState<
    ChatMessage[]
  >([]);

  const [trailSearch, setTrailSearch] =
    useState("");

  const [input, setInput] = useState("");
  const [mode, setMode] = useState("explain");

  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] =
    useState(true);

  const [error, setError] = useState("");

  const activeTrail = trails.find(
    (trail) => trail.id === activeConversationId
  );

  const lastAssistantMessage = useMemo(() => {
    return [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant"
      );
  }, [messages]);

  function scrollToBottom() {
    window.setTimeout(() => {
      if (!chatRef.current) return;

      chatRef.current.scrollTop =
        chatRef.current.scrollHeight;
    }, 50);
  }

  async function loadMessages(
    conversationId: number
  ) {
    try {
      setLoadingHistory(true);
      setError("");

      const storedMessages =
        await getAIMessages(conversationId);

      setMessages(
        storedMessages.map(mapStoredMessage)
      );

      scrollToBottom();
    } catch (err) {
      setMessages([]);

      setError(
        err instanceof Error
          ? err.message
          : "Could not open this room Study Trail."
      );
    } finally {
      setLoadingHistory(false);
    }
  }

  async function refreshTrails(
    preferredConversationId?: number
  ) {
    const list = await getAIConversations(
      studyRoomId,
      "general",
      "room_ai"
    );

    setTrails(list);

    if (
      typeof preferredConversationId ===
        "number" &&
      list.some(
        (trail) =>
          trail.id === preferredConversationId
      )
    ) {
      setActiveConversationId(
        preferredConversationId
      );
    }

    return list;
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeRoomTrails() {
      try {
        setLoadingHistory(true);
        setError("");

        const list = await getAIConversations(
          studyRoomId,
          "general",
          "room_ai"
        );

        if (cancelled) return;

        setTrails(list);

        if (list.length > 0) {
          setActiveConversationId(list[0].id);

          const storedMessages =
            await getAIMessages(list[0].id);

          if (cancelled) return;

          setMessages(
            storedMessages.map(mapStoredMessage)
          );
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      } catch (err) {
        if (!cancelled) {
          setTrails([]);
          setMessages([]);
          setActiveConversationId(null);

          setError(
            err instanceof Error
              ? err.message
              : "Could not load room Study Trails."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
          scrollToBottom();
        }
      }
    }

    void initializeRoomTrails();

    return () => {
      cancelled = true;
    };
  }, [studyRoomId]);

  async function ensureConversation() {
    if (activeConversationId !== null) {
      return activeConversationId;
    }

    const conversation =
      await createAIConversation({
        studyRoomId,
        title: "New Conversation",
        mode: "general",
        surface: "room_ai",
        contextType: "study_room",
        contextId: studyRoomId,
        forceNew: true,
      });

    setTrails((current) => [
      conversation,
      ...current.filter(
        (trail) =>
          trail.id !== conversation.id
      ),
    ]);

    setActiveConversationId(conversation.id);

    return conversation.id;
  }

  async function sendMessage(value?: string) {
    const clean = (value ?? input).trim();

    if (!clean || loading) return;

    const userMessageId = makeId();
    const assistantMessageId = makeId();

    try {
      setLoading(true);
      setError("");
      setInput("");

      const conversationId =
        await ensureConversation();

      setMessages((current) => [
        ...current,
        {
          id: userMessageId,
          role: "user",
          content: clean,
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "StudySnap AI is thinking...",
        },
      ]);

      scrollToBottom();

      let streamedAnswer = "";

      await streamAIMessage(
        conversationId,
        clean,
        mode,
        (token) => {
          streamedAnswer += token;

          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: streamedAnswer,
                  }
                : message
            )
          );

          scrollToBottom();
        }
      );

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content:
                  streamedAnswer ||
                  "No answer was returned.",
              }
            : message
        )
      );

      await refreshTrails(conversationId);
      scrollToBottom();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Project AI failed.";

      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: message,
              }
            : item
        )
      );

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    void sendMessage();
  }

  function startNewTrail() {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setError("");
  }

  async function selectTrail(
    trail: AIConversation
  ) {
    if (loading) return;

    setActiveConversationId(trail.id);
    setInput("");
    setError("");

    await loadMessages(trail.id);
  }

  async function renameTrail(
    trail: AIConversation
  ) {
    const nextTitle = window.prompt(
      "Rename Room Study Trail",
      trail.title
    );

    if (nextTitle === null) return;

    const cleanTitle = nextTitle.trim();

    if (!cleanTitle) return;

    try {
      const updated =
        await renameAIConversation(
          trail.id,
          cleanTitle
        );

      setTrails((current) =>
        current.map((item) =>
          item.id === trail.id
            ? updated
            : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not rename this trail."
      );
    }
  }

  async function togglePinTrail(
    trail: AIConversation
  ) {
    try {
      await pinAIConversation(
        trail.id,
        !trail.is_pinned
      );

      await refreshTrails(
        activeConversationId ?? undefined
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update this trail."
      );
    }
  }

  async function deleteTrail(
    trail: AIConversation
  ) {
    const confirmed = window.confirm(
      `Delete "${trail.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteAIConversation(trail.id);

      const remaining = trails.filter(
        (item) => item.id !== trail.id
      );

      setTrails(remaining);

      if (
        activeConversationId === trail.id
      ) {
        if (remaining.length > 0) {
          setActiveConversationId(
            remaining[0].id
          );

          await loadMessages(
            remaining[0].id
          );
        } else {
          startNewTrail();
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete this trail."
      );
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_300px]">
      <StudyTrailPanel
        trails={trails}
        activeTrailId={activeConversationId}
        loading={loadingHistory}
        search={trailSearch}
        title="Room Study Trail"
        emptyMessage={`Start a learning trail inside ${projectTitle}.`}
        onSearchChange={setTrailSearch}
        onSelect={(trail) =>
          void selectTrail(trail)
        }
        onNew={startNewTrail}
        onRename={(trail) =>
          void renameTrail(trail)
        }
        onDelete={(trail) =>
          void deleteTrail(trail)
        }
        onTogglePin={(trail) =>
          void togglePinTrail(trail)
        }
      />

      <section className="min-w-0 rounded-[1.35rem] border border-cyan-300/15 bg-black/25 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
              Room AI Assistant
            </p>

            <h3 className="mt-1 text-2xl font-black text-white">
              {activeTrail?.title ||
                "Start a new room trail"}
            </h3>

            <p className="mt-1 text-sm leading-6 text-slate-400">
              Focused only on {projectTitle} and its
              connected learning materials.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.target.value)
              }
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none"
            >
              <option
                className="bg-[#101826]"
                value="explain"
              >
                Explain
              </option>

              <option
                className="bg-[#101826]"
                value="teach"
              >
                Teach me
              </option>

              <option
                className="bg-[#101826]"
                value="quiz"
              >
                Quiz me
              </option>

              <option
                className="bg-[#101826]"
                value="practice"
              >
                Practice
              </option>
            </select>

            <button
              type="button"
              onClick={startNewTrail}
              disabled={loading}
              className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20 disabled:opacity-50"
            >
              New Trail
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div
          ref={chatRef}
          className="mt-4 max-h-[470px] min-h-[380px] space-y-3 overflow-y-auto rounded-[1.2rem] border border-white/10 bg-black/35 p-4"
        >
          {loadingHistory ? (
            <p className="py-12 text-center text-sm font-semibold text-slate-400">
              Opening this room Study Trail...
            </p>
          ) : messages.length === 0 ? (
            <div className="flex min-h-[340px] items-center justify-center text-center">
              <div className="max-w-md">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-yellow-300/20 bg-yellow-300/10 text-2xl">
                  ✦
                </div>

                <h4 className="mt-4 text-xl font-black text-white">
                  Start learning in this room
                </h4>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Ask about your materials, notes,
                  quizzes, weak concepts, or what to
                  study next.
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl border p-4 ${
                  message.role === "user"
                    ? "ml-auto max-w-[86%] border-yellow-300/20 bg-yellow-300/10"
                    : "mr-auto max-w-[92%] border-cyan-300/15 bg-cyan-300/10"
                }`}
              >
                <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  {message.role === "user"
                    ? "You"
                    : "StudySnap AI"}
                </p>

                <SimpleMarkdown
                  content={message.content}
                  className="text-sm leading-7 text-slate-100"
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-black/35 p-3">
          <textarea
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${projectTitle}...`}
            className="min-h-[95px] w-full resize-none bg-transparent p-3 text-sm leading-7 text-white outline-none placeholder:text-slate-500"
          />

          <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Enter sends. Shift + Enter adds a line.
            </p>

            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={
                loading || !input.trim()
              }
              className="rounded-xl bg-yellow-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Thinking..."
                : "Ask Room AI"}
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-4 xl:col-start-2 2xl:col-start-auto">
        <section className="rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
            Continue the flow
          </p>

          <div className="mt-4 space-y-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() =>
                  void sendMessage(prompt)
                }
                disabled={loading}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-semibold text-slate-200 transition hover:border-yellow-300/30 hover:bg-yellow-300/10 disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-200">
            Latest answer
          </p>

          <p className="mt-3 line-clamp-6 text-sm leading-7 text-slate-300">
            {lastAssistantMessage?.content ||
              "Ask a question to begin."}
          </p>
        </section>

        <section className="rounded-[1.35rem] border border-cyan-300/15 bg-cyan-300/5 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
            Context boundary
          </p>

          <p className="mt-3 text-xs leading-6 text-slate-400">
            This AI uses only this room’s trail and
            connected materials. General AI history
            stays separate.
          </p>
        </section>
      </aside>
    </div>
  );
}
