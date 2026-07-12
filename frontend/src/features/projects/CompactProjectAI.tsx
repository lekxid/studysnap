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
  focusComposerToken?: number;
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
  focusComposerToken = 0,
}: CompactProjectAIProps) {
  const chatRef = useRef<HTMLDivElement | null>(
    null
  );

  const composerRef =
    useRef<HTMLTextAreaElement | null>(null);

  const renameInputRef =
    useRef<HTMLInputElement | null>(null);

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

  const [renameRequest, setRenameRequest] =
    useState<AIConversation | null>(null);

  const [renameTitle, setRenameTitle] =
    useState("");

  const [deleteRequest, setDeleteRequest] =
    useState<AIConversation | null>(null);

  const [trailActionLoading, setTrailActionLoading] =
    useState(false);

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

  useEffect(() => {
    if (focusComposerToken <= 0) return;

    const timer = window.setTimeout(() => {
      composerRef.current?.focus();

      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [focusComposerToken]);

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

  function renameTrail(
    trail: AIConversation
  ) {
    if (loading || trailActionLoading) return;

    setRenameRequest(trail);
    setRenameTitle(trail.title);

    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 80);
  }

  async function confirmRenameTrail() {
    if (!renameRequest) return;

    const cleanTitle = renameTitle.trim();

    if (!cleanTitle) {
      setError("Enter a name for this Study Trail.");
      return;
    }

    try {
      setTrailActionLoading(true);
      setError("");

      const updated =
        await renameAIConversation(
          renameRequest.id,
          cleanTitle
        );

      setTrails((current) =>
        current.map((item) =>
          item.id === renameRequest.id
            ? updated
            : item
        )
      );

      setRenameRequest(null);
      setRenameTitle("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not rename this trail."
      );
    } finally {
      setTrailActionLoading(false);
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

  function deleteTrail(
    trail: AIConversation
  ) {
    if (loading || trailActionLoading) return;

    setDeleteRequest(trail);
  }

  async function confirmDeleteTrail() {
    if (!deleteRequest) return;

    const trail = deleteRequest;

    try {
      setTrailActionLoading(true);
      setError("");

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

      setDeleteRequest(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete this trail."
      );
    } finally {
      setTrailActionLoading(false);
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
            ref={composerRef}
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

      {renameRequest ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-black/75 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setRenameRequest(null);
              setRenameTitle("");
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-trail-title"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmRenameTrail();
            }}
            className="w-full max-w-md rounded-[1.5rem] border border-yellow-300/20 bg-[#091422] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-yellow-300/20 bg-yellow-300/10 text-xl">
              ✎
            </div>

            <h3
              id="rename-trail-title"
              className="mt-5 text-xl font-black text-white"
            >
              Rename Study Trail
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Give this conversation a clear name so it is easy to continue later.
            </p>

            <input
              ref={renameInputRef}
              value={renameTitle}
              onChange={(event) =>
                setRenameTitle(event.target.value)
              }
              maxLength={100}
              className="mt-5 w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-yellow-300/45"
              placeholder="Study Trail name"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRenameRequest(null);
                  setRenameTitle("");
                }}
                disabled={trailActionLoading}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  trailActionLoading ||
                  !renameTitle.trim()
                }
                className="rounded-xl bg-yellow-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-yellow-200 disabled:opacity-50"
              >
                {trailActionLoading
                  ? "Saving..."
                  : "Save name"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteRequest ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-black/75 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteRequest(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-trail-title"
            className="w-full max-w-md rounded-[1.5rem] border border-red-400/20 bg-[#091422] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-red-400/20 bg-red-500/10 text-xl">
              🗑️
            </div>

            <h3
              id="delete-trail-title"
              className="mt-5 text-xl font-black text-white"
            >
              Delete this Study Trail?
            </h3>

            <p className="mt-2 break-words text-sm leading-6 text-slate-400">
              “{deleteRequest.title}” and its saved conversation will be removed.
            </p>

            <p className="mt-3 text-xs font-semibold text-red-300">
              This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteRequest(null)}
                disabled={trailActionLoading}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Keep trail
              </button>

              <button
                type="button"
                onClick={() =>
                  void confirmDeleteTrail()
                }
                disabled={trailActionLoading}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-400 disabled:opacity-50"
              >
                {trailActionLoading
                  ? "Deleting..."
                  : "Delete trail"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
