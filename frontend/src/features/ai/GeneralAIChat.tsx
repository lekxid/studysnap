"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import StudyTrailPanel from "@/components/ai/StudyTrailPanel";
import SimpleMarkdown from "@/components/ui/SimpleMarkdown";

import {
  resolveStudyCommand,
} from "@/lib/studyCommandRouter";
import {
  takePendingAIAttachment,
} from "@/lib/aiAttachmentHandoff";
import {
  askAiWithImage,
  createAIConversation,
  generateAIImage,
  deleteAIConversation,
  getAIMessages,
  getStudyTrails,
  pinAIConversation,
  renameAIConversation,
  streamAIMessage,
  type AIConversation,
  type AIMessage,
  type GenerateAIImageSize,
} from "@/lib/api";

type DisplayMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  imagePreview?: string;
  imageName?: string;
  generatedImage?: boolean;
};

const suggestions = [
  "Explain something new",
  "Help me study step by step",
  "Create practice questions",
  "Brainstorm ideas",
  "Simplify a difficult topic",
  "Help me write better",
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
): DisplayMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  };
}

function extractAIText(data: unknown): string {
  if (typeof data === "string") return data;

  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;

    for (const key of [
      "answer",
      "response",
      "message",
      "content",
      "text",
      "result",
      "output",
    ]) {
      if (
        typeof value[key] === "string" &&
        value[key]
      ) {
        return value[key] as string;
      }
    }
  }

  return "I could not read the AI response.";
}

async function copyTextWithFallback(text: string) {
  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.setAttribute("readonly", "");

  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy failed.");
  }
}

export default function GeneralAIChat({
  initialPrompt = "",
}: {
  initialPrompt?: string;
}) {
  const router = useRouter();
  const initialPromptHandledRef = useRef(false);

  const [trails, setTrails] = useState<
    AIConversation[]
  >([]);
  const [
    activeConversationId,
    setActiveConversationId,
  ] = useState<number | null>(null);
  const [messages, setMessages] = useState<
    DisplayMessage[]
  >([]);

  const [input, setInput] = useState("");
  const [trailSearch, setTrailSearch] =
    useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTrails, setLoadingTrails] =
    useState(true);
  const [loadingMessages, setLoadingMessages] =
    useState(false);
  const [copiedId, setCopiedId] = useState<
    string | number | null
  >(null);
  const [error, setError] = useState("");

  const [selectedImage, setSelectedImage] =
    useState<File | null>(null);
  const [
    selectedImagePreview,
    setSelectedImagePreview,
  ] = useState("");

  const [
    imageUploadProgress,
    setImageUploadProgress,
  ] = useState(0);

  const [
    imageUploadStatus,
    setImageUploadStatus,
  ] = useState<
    | "idle"
    | "converting"
    | "reading"
    | "ready"
    | "uploading"
    | "analyzing"
  >("idle");

  const [historyOpen, setHistoryOpen] =
    useState(false);
  const [studyToolsOpen, setStudyToolsOpen] =
    useState(false);
  const [createImageMode, setCreateImageMode] =
    useState(false);
  const [imageSize, setImageSize] =
    useState<GenerateAIImageSize>("1024x1024");

  const inputRef =
    useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef =
    useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(
    null
  );

  const hasMessages = messages.length > 0;

  const activeTrail = trails.find(
    (trail) => trail.id === activeConversationId
  );

  const canSend = useMemo(() => {
    if (createImageMode) {
      return input.trim().length > 0 && !loading;
    }

    return (
      (input.trim().length > 0 ||
        selectedImage !== null) &&
      !loading
    );
  }, [
    createImageMode,
    input,
    selectedImage,
    loading,
  ]);

  function scrollToBottom() {
    window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }, 50);
  }

  async function loadMessages(
    conversationId: number
  ) {
    try {
      setLoadingMessages(true);
      setError("");

      const storedMessages =
        await getAIMessages(conversationId);

      setMessages(
        storedMessages.map(mapStoredMessage)
      );
    } catch (err) {
      setMessages([]);
      setError(
        err instanceof Error
          ? err.message
          : "Could not load this Study Trail."
      );
    } finally {
      setLoadingMessages(false);
    }
  }

  async function refreshTrails(
    preferredConversationId?: number
  ) {
    const list = await getStudyTrails(
      "general_ai",
      "",
      100
    );

    setTrails(list);

    if (
      typeof preferredConversationId === "number" &&
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
    const savedHistory =
      window.localStorage.getItem(
        "studysnap:general-ai-history-open"
      );
    const savedStudyTools =
      window.localStorage.getItem(
        "studysnap:general-ai-study-tools-open"
      );

    if (savedHistory !== null) {
      setHistoryOpen(savedHistory === "true");
    }

    if (savedStudyTools !== null) {
      setStudyToolsOpen(
        savedStudyTools === "true"
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setLoadingTrails(true);
        setError("");

        const list = await getStudyTrails(
          "general_ai",
          "",
          100
        );

        if (cancelled) return;

        setTrails(list);

        if (list.length > 0) {
          setActiveConversationId(list[0].id);
          await loadMessages(list[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load your Study Trails."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTrails(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConversationId]);

  useEffect(() => {
    const pendingFile =
      takePendingAIAttachment();

    if (!pendingFile) {
      return;
    }

    void handleImageChange(pendingFile);

    window.history.replaceState(
      {},
      "",
      "/general-ai",
    );
  }, []);

  useEffect(() => {
    const prompt = initialPrompt.trim();

    if (
      !prompt ||
      initialPromptHandledRef.current ||
      loadingTrails ||
      loading
    ) {
      return;
    }

    initialPromptHandledRef.current = true;

    window.history.replaceState(
      {},
      "",
      "/general-ai",
    );

    void sendMessage(prompt);
  }, [
    initialPrompt,
    loading,
    loadingTrails,
  ]);

  async function handleImageChange(
    selectedFile: File | undefined
  ) {
    if (!selectedFile) {
      return;
    }

    setError("");
    setImageUploadProgress(0);

    const originalExtension =
      selectedFile.name
        .split(".")
        .pop()
        ?.toLowerCase() || "";

    const isHeic =
      originalExtension === "heic" ||
      originalExtension === "heif" ||
      selectedFile.type === "image/heic" ||
      selectedFile.type === "image/heif";

    const supportedExtensions = new Set([
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "heic",
      "heif",
    ]);

    const isImage =
      selectedFile.type.startsWith("image/") ||
      supportedExtensions.has(originalExtension);

    if (!isImage) {
      setError(
        "Please choose a PNG, JPG, JPEG, WEBP, GIF, HEIC, or HEIF image."
      );
      return;
    }

    // Allow a larger HEIC source because JPEG conversion often reduces it.
    const maximumSourceSize =
      isHeic
        ? 25 * 1024 * 1024
        : 8 * 1024 * 1024;

    if (selectedFile.size > maximumSourceSize) {
      setError(
        isHeic
          ? "This HEIC image is too large. Please choose one smaller than 25 MB."
          : "This image is too large. Please choose one smaller than 8 MB."
      );
      return;
    }

    let file = selectedFile;

    try {
      if (isHeic) {
        setImageUploadStatus("converting");
        setImageUploadProgress(15);

        const heicModule =
          await import("heic2any");

        const heic2any =
          heicModule.default;

        const convertedResult =
          await heic2any({
            blob: selectedFile,
            toType: "image/jpeg",
            quality: 0.88,
          });

        const convertedBlob = Array.isArray(
          convertedResult
        )
          ? convertedResult[0]
          : convertedResult;

        const jpegName =
          selectedFile.name.replace(
            /\.(heic|heif)$/i,
            ""
          ) + ".jpg";

        file = new File(
          [convertedBlob],
          jpegName,
          {
            type: "image/jpeg",
            lastModified: Date.now(),
          }
        );

        setImageUploadProgress(45);
      }

      if (file.size > 8 * 1024 * 1024) {
        setImageUploadStatus("idle");
        setImageUploadProgress(0);
        setError(
          "The prepared image is still larger than 8 MB. Please choose a smaller image."
        );
        return;
      }

      setCreateImageMode(false);
      setSelectedImage(file);
      setSelectedImagePreview("");
      setImageUploadStatus("reading");
      setImageUploadProgress(
        isHeic ? 50 : 0
      );

      const reader = new FileReader();

      reader.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const readPercent =
          (event.loaded / event.total) * 100;

        const progress = isHeic
          ? Math.round(50 + readPercent * 0.5)
          : Math.round(readPercent);

        setImageUploadProgress(progress);
      };

      reader.onload = () => {
        setSelectedImagePreview(
          String(reader.result || "")
        );
        setImageUploadProgress(100);
        setImageUploadStatus("ready");
        setError("");
        inputRef.current?.focus();
      };

      reader.onerror = () => {
        setSelectedImage(null);
        setSelectedImagePreview("");
        setImageUploadProgress(0);
        setImageUploadStatus("idle");
        setError(
          "StudySnap could not prepare this image. Please try another image."
        );
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.warn(
        "Browser HEIC conversion failed; using backend fallback:",
        error
      );

      if (!isHeic) {
        setSelectedImage(null);
        setSelectedImagePreview("");
        setImageUploadProgress(0);
        setImageUploadStatus("idle");
        setError(
          "StudySnap could not prepare this image. Please try another image."
        );
        return;
      }

      // Some HEIC variants cannot be decoded in the browser.
      // Keep the original file so the backend can convert it.
      setCreateImageMode(false);
      setSelectedImage(selectedFile);
      setSelectedImagePreview("");
      setImageUploadProgress(100);
      setImageUploadStatus("ready");
      setError("");
      inputRef.current?.focus();
    }
  }

  function removeSelectedImage() {
    setSelectedImage(null);
    setSelectedImagePreview("");
    setImageUploadProgress(0);
    setImageUploadStatus("idle");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearComposer() {
    setInput("");
    removeSelectedImage();
    setError("");
    inputRef.current?.focus();
  }

  async function ensureConversation() {
    if (activeConversationId !== null) {
      return activeConversationId;
    }

    const conversation =
      await createAIConversation({
        studyRoomId: null,
        title: "New Conversation",
        mode: "general",
        surface: "general_ai",
        contextType: "general",
        contextId: null,
        forceNew: true,
      });

    setTrails((current) => [
      conversation,
      ...current.filter(
        (trail) => trail.id !== conversation.id
      ),
    ]);

    setActiveConversationId(conversation.id);

    return conversation.id;
  }

  async function createGeneratedImage(
    promptText?: string
  ) {
    const prompt = (
      promptText ?? input
    ).trim();

    if (!prompt || loading) return;

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
          content: `Create an image: ${prompt}`,
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content:
            "StudySnap AI is creating your image...",
        },
      ]);

      scrollToBottom();

      const result = await generateAIImage(
        prompt,
        {
          conversationId,
          size: imageSize,
          quality: "medium",
        }
      );

      const imageSource =
        result.image_data_url ||
        result.image_url;

      if (!imageSource) {
        throw new Error(
          "The image model returned no displayable image."
        );
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: result.revised_prompt
                  ? `Your image is ready.\n\nCreated from: ${result.revised_prompt}`
                  : `Your image is ready.\n\nCreated from: ${prompt}`,
                imagePreview: imageSource,
                imageName:
                  "StudySnap generated image",
                generatedImage: true,
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
          : "StudySnap AI could not create the image.";

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
      inputRef.current?.focus();
    }
  }

  async function sendMessage(
    messageText?: string
  ) {
    const question = (
      messageText ?? input
    ).trim();

    const imageToSend = selectedImage;
    const imagePreviewToSend =
      selectedImagePreview;
    const imageNameToSend =
      selectedImage?.name;

    if (
      (!question && !imageToSend) ||
      loading
    ) {
      return;
    }

    const finalQuestion =
      question || "Describe this image clearly.";

    if (!imageToSend && question) {
      const commandResult =
        await resolveStudyCommand(question);

      if (commandResult.handled) {
        setInput("");
        setError("");
        router.push(commandResult.href);
        return;
      }
    }

    setLoading(true);
    setError("");
    setInput("");

    // Keep an attached image visible until the request succeeds.
    if (!imageToSend) {
      removeSelectedImage();
    }

    const pendingAssistantId = makeId();

    try {
      const conversationId =
        await ensureConversation();

      setTrails((current) =>
        current.map((trail) =>
          trail.id === conversationId
            ? {
                ...trail,
                title:
                  finalQuestion.slice(0, 60) ||
                  "New Conversation",
              }
            : trail,
        ),
      );

      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "user",
          content: finalQuestion,
          imagePreview:
            imagePreviewToSend || undefined,
          imageName: imageNameToSend,
        },
        {
          id: pendingAssistantId,
          role: "assistant",
          content: imageToSend
            ? "StudySnap AI is reading the image..."
            : "StudySnap AI is thinking...",
        },
      ]);

      scrollToBottom();

      if (imageToSend) {
        setImageUploadStatus("uploading");
        setImageUploadProgress(35);

        const analyzingTimer =
          window.setTimeout(() => {
            setImageUploadStatus("analyzing");
            setImageUploadProgress(75);
          }, 800);

        let data;

        try {
          data = await askAiWithImage(
            finalQuestion,
            imageToSend,
            {
              conversationId,
            }
          );
        } finally {
          window.clearTimeout(
            analyzingTimer
          );
        }

        setImageUploadProgress(100);

        const answer = extractAIText(data);

        setMessages((current) =>
          current.map((message) =>
            message.id === pendingAssistantId
              ? {
                  ...message,
                  content: answer,
                }
              : message
          )
        );
      } else {
        let streamedAnswer = "";

        await streamAIMessage(
          conversationId,
          finalQuestion,
          "explain",
          (token) => {
            streamedAnswer += token;

            setMessages((current) =>
              current.map((message) =>
                message.id ===
                pendingAssistantId
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

        if (!streamedAnswer) {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistantId
                ? {
                    ...message,
                    content:
                      "No answer was returned.",
                  }
                : message
            )
          );
        }
      }

      await refreshTrails(conversationId);

      if (imageToSend) {
        removeSelectedImage();
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "StudySnap AI could not reply right now.";

      setMessages((current) =>
        current.map((item) =>
          item.id === pendingAssistantId
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
      inputRef.current?.focus();
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canSend) return;

    if (createImageMode) {
      await createGeneratedImage();
      return;
    }

    await sendMessage();
  }

  function startNewTrail() {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setError("");
    setCopiedId(null);
    setCreateImageMode(false);
    removeSelectedImage();
    inputRef.current?.focus();
  }

  async function selectTrail(
    trail: AIConversation
  ) {
    if (loading) return;

    setActiveConversationId(trail.id);
    setInput("");
    setError("");
    setCreateImageMode(false);
    removeSelectedImage();

    await loadMessages(trail.id);
  }

  async function renameTrail(
    trail: AIConversation
  ) {
    const nextTitle = window.prompt(
      "Rename Study Trail",
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
      const updated =
        await pinAIConversation(
          trail.id,
          !trail.is_pinned
        );

      setTrails((current) =>
        current
          .map((item) =>
            item.id === trail.id
              ? updated
              : item
          )
          .sort(
            (a, b) =>
              Number(b.is_pinned) -
              Number(a.is_pinned)
          )
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

  async function copyMessage(
    message: DisplayMessage
  ) {
    try {
      await copyTextWithFallback(
        message.content
      );

      setCopiedId(message.id);

      window.setTimeout(
        () => setCopiedId(null),
        1200
      );
    } catch {
      setError("Unable to copy this answer.");
    }
  }

  function downloadGeneratedImage(
    message: DisplayMessage
  ) {
    if (!message.imagePreview) return;

    const link = document.createElement("a");

    link.href = message.imagePreview;
    link.download =
      `studysnap-image-${Date.now()}.png`;
    link.rel = "noopener";

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function renderComposer(large = false) {
    return (
      <form
        onSubmit={handleSubmit}
        className={
          large
            ? "rounded-[1.6rem] border border-yellow-300/15 bg-[#08111d]/95 p-4 shadow-[0_0_60px_rgba(250,204,21,0.05)]"
            : "rounded-[1.4rem] border border-white/10 bg-[#08111d]/95 p-3 shadow-[0_20px_70px_rgba(0,0,0,0.42)]"
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(event) => {
            handleImageChange(
              event.currentTarget.files?.[0]
            );
          }}
        />

        {createImageMode ? (
          <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                Image creator
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Describe the diagram, illustration, or study visual you want.
              </p>
            </div>

            <select
              value={imageSize}
              onChange={(event) =>
                setImageSize(
                  event.target
                    .value as GenerateAIImageSize
                )
              }
              className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs font-black text-white outline-none"
              aria-label="Generated image size"
            >
              <option
                value="1024x1024"
                className="bg-[#101826]"
              >
                Square
              </option>
              <option
                value="1536x1024"
                className="bg-[#101826]"
              >
                Landscape
              </option>
              <option
                value="1024x1536"
                className="bg-[#101826]"
              >
                Portrait
              </option>
            </select>
          </div>
        ) : null}

        {selectedImage ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/30">
              {selectedImagePreview ? (
                <img
                  src={selectedImagePreview}
                  alt="Selected upload"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-full"
                    style={{
                      background: `conic-gradient(#fde047 ${
                        imageUploadProgress * 3.6
                      }deg, rgba(255,255,255,0.12) 0deg)`,
                    }}
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-[#08111d] text-[10px] font-black text-yellow-200">
                      {imageUploadStatus === "ready"
                        ? "HEIC"
                        : `${imageUploadProgress}%`}
                    </div>
                  </div>
                </div>
              )}

              {imageUploadStatus === "uploading" ||
              imageUploadStatus === "analyzing" ? (
                <div className="absolute inset-0 grid place-items-center bg-black/65">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-yellow-300" />
                </div>
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-white">
                {selectedImage.name}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {(selectedImage.size / 1024 / 1024).toFixed(2)} MB
                {" · "}
                {imageUploadStatus === "converting"
                  ? `Converting HEIC ${imageUploadProgress}%`
                  : imageUploadStatus === "reading"
                    ? `Preparing image ${imageUploadProgress}%`
                    : imageUploadStatus === "uploading"
                      ? `Uploading ${imageUploadProgress}%`
                      : imageUploadStatus === "analyzing"
                        ? "StudySnap AI is analyzing..."
                        : "Ready to send"}
              </p>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-yellow-300 transition-all duration-200"
                  style={{
                    width: `${imageUploadProgress}%`,
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={removeSelectedImage}
              disabled={
                imageUploadStatus === "uploading" ||
                imageUploadStatus === "analyzing"
              }
              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ) : null}

        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) =>
            setInput(event.target.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();

              if (!canSend) return;

              if (createImageMode) {
                void createGeneratedImage();
              } else {
                void sendMessage();
              }
            }
          }}
          placeholder={
            createImageMode
              ? "Describe the image you want StudySnap to create..."
              : selectedImage
                ? "Ask about this image..."
                : "Message StudySnap AI"
          }
          rows={large ? 4 : 2}
          className={`w-full resize-none bg-transparent px-3 py-3 font-semibold text-white outline-none placeholder:text-slate-500 ${
            large
              ? "min-h-32 text-lg"
              : "max-h-40 min-h-16 text-sm"
          }`}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const attachmentInput =
                  fileInputRef.current;

                if (!attachmentInput) {
                  setError(
                    "The attachment picker could not open. Please refresh and try again.",
                  );
                  return;
                }

                attachmentInput.value = "";
                attachmentInput.click();
              }}
              disabled={createImageMode || loading}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-xl text-slate-300 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              title="Attach image"
            >
              ＋
            </button>

            <button
              type="button"
              aria-pressed={createImageMode}
              onClick={() => {
                setCreateImageMode(
                  (current) => !current
                );
                removeSelectedImage();
                setError("");
                inputRef.current?.focus();
              }}
              className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
                createImageMode
                  ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              {createImageMode
                ? "✦ Image mode"
                : "✦ Create image"}
            </button>

            {(input.trim() ||
              selectedImage) ? (
              <button
                type="button"
                onClick={clearComposer}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:bg-white/[0.08] hover:text-white"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <p className="hidden text-[11px] text-slate-500 sm:block">
              Enter sends · Shift + Enter adds a line
            </p>

            <button
              type="submit"
              disabled={!canSend}
              className={`grid h-10 place-items-center rounded-xl bg-yellow-300 font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                createImageMode
                  ? "min-w-24 px-4 text-xs"
                  : "w-10 text-lg"
              }`}
              title={
                createImageMode
                  ? "Create image"
                  : "Send"
              }
            >
              {loading
                ? "..."
                : createImageMode
                  ? "Create"
                  : "↑"}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">
            AI workspace
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            Open only the panels you need. Your choices stay saved.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={historyOpen}
            onClick={() => {
              setHistoryOpen((current) => {
                const next = !current;

                window.localStorage.setItem(
                  "studysnap:general-ai-history-open",
                  String(next)
                );

                return next;
              });
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
              historyOpen
                ? "border-yellow-300/30 bg-yellow-300/15 text-yellow-100"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {historyOpen
              ? "Hide history"
              : "Show history"}
          </button>

          <button
            type="button"
            aria-pressed={studyToolsOpen}
            onClick={() => {
              setStudyToolsOpen((current) => {
                const next = !current;

                window.localStorage.setItem(
                  "studysnap:general-ai-study-tools-open",
                  String(next)
                );

                return next;
              });
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
              studyToolsOpen
                ? "border-yellow-300/30 bg-yellow-300/15 text-yellow-100"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {studyToolsOpen
              ? "Hide study tools"
              : "Show study tools"}
          </button>
        </div>
      </div>

      <div
        className={`grid gap-4 ${
          historyOpen && studyToolsOpen
            ? "xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_290px]"
            : historyOpen
              ? "xl:grid-cols-[280px_minmax(0,1fr)]"
              : studyToolsOpen
                ? "xl:grid-cols-[minmax(0,1fr)_290px]"
                : "grid-cols-1"
        }`}
      >
        {historyOpen ? (
          <StudyTrailPanel
            trails={trails}
            activeTrailId={activeConversationId}
            loading={loadingTrails}
            search={trailSearch}
            title="Study Trail"
            emptyMessage="Ask your first question to begin a learning journey."
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
        ) : null}

        <div className="min-w-0 space-y-4">
          <header className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(135deg,rgba(250,204,21,0.11),rgba(8,17,29,0.94))] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">
                  StudySnap General AI
                </p>

                <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">
                  {activeTrail?.title ||
                    "Start a new learning trail"}
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Ask anything naturally. StudySnap remembers this conversation while keeping room and learning memory separate.
                </p>
              </div>

              <button
                type="button"
                onClick={startNewTrail}
                className="rounded-2xl border border-yellow-300/25 bg-yellow-300/10 px-5 py-3 text-sm font-black text-yellow-100 transition hover:bg-yellow-300/20"
              >
                New Trail
              </button>
            </div>
          </header>

          {!hasMessages &&
          !loadingMessages ? (
            <div className="rounded-[1.7rem] border border-white/10 bg-[#08111d]/88 p-5">
              <div className="mx-auto max-w-4xl py-6 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.4rem] border border-yellow-300/20 bg-yellow-300/10 text-3xl">
                  ✦
                </div>

                <h3 className="mt-4 text-3xl font-black text-white">
                  What are we learning today?
                </h3>

                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Continue an old trail or begin a fresh conversation. Typos, shorthand, images, and follow-up questions are welcome.
                </p>
              </div>

              {renderComposer(true)}

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() =>
                      void sendMessage(suggestion)
                    }
                    disabled={loading}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:border-yellow-300/30 hover:bg-yellow-300/10 hover:text-white disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-[68vh] min-h-[460px] space-y-4 overflow-y-auto rounded-[1.7rem] border border-white/10 bg-[#08111d]/90 p-4">
                {loadingMessages ? (
                  <p className="py-12 text-center text-sm font-bold text-slate-400">
                    Opening Study Trail...
                  </p>
                ) : null}

                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-[84%] rounded-[1.35rem] bg-yellow-300 px-4 py-3 text-slate-950"
                        : "mr-auto max-w-[92%] rounded-[1.35rem] border border-white/10 bg-white/[0.055] px-4 py-3 text-slate-100"
                    }
                  >
                    {message.imagePreview ? (
                      <img
                        src={message.imagePreview}
                        alt={
                          message.imageName ||
                          "Uploaded image"
                        }
                        className={`mb-3 rounded-2xl object-contain ${
                          message.generatedImage
                            ? "max-h-[520px] w-full"
                            : "max-h-72"
                        }`}
                      />
                    ) : null}

                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-65">
                        {message.role === "user"
                          ? "You"
                          : "StudySnap AI"}
                      </p>

                      {message.role ===
                      "assistant" ? (
                        <div className="flex items-center gap-2">
                          {message.generatedImage &&
                          message.imagePreview ? (
                            <button
                              type="button"
                              onClick={() =>
                                downloadGeneratedImage(
                                  message
                                )
                              }
                              className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black text-slate-300 hover:bg-white/[0.08]"
                            >
                              Download
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() =>
                              void copyMessage(message)
                            }
                            className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black text-slate-300 hover:bg-white/[0.08]"
                          >
                            {copiedId === message.id
                              ? "Copied"
                              : "Copy"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {message.role ===
                    "assistant" ? (
                      <SimpleMarkdown
                        content={message.content}
                        className="text-sm leading-7"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </div>
                    )}
                  </article>
                ))}

                <div ref={bottomRef} />
              </div>

              {renderComposer(false)}
            </>
          )}

          {error ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-100">
              {error}
            </div>
          ) : null}
        </div>

        {studyToolsOpen ? (
          <aside className="space-y-4 xl:col-start-2 2xl:col-start-auto">
            <div className="rounded-[1.4rem] border border-yellow-300/15 bg-yellow-300/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">
                Continue the flow
              </p>

              <div className="mt-3 grid gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() =>
                      void sendMessage(
                        suggestion
                      )
                    }
                    disabled={loading}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm font-black text-white hover:bg-yellow-300/10 disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-cyan-300/15 bg-cyan-300/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                General AI boundary
              </p>

              <p className="mt-3 text-xs leading-6 text-slate-400">
                This trail stays separate from Study Room AI so general questions do not mix with room-specific learning history.
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
