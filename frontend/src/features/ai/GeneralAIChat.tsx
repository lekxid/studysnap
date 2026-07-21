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
  takePendingAIAttachments,
} from "@/lib/aiAttachmentHandoff";
import {
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";
import {
  askAiWithFile,
  askAiWithFiles,
  askAiWithImage,
  createAIConversation,
  getStudyRooms,
  organizeFilesIntoStudyRooms,
  uploadUniversalMaterial,
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
  type StudyRoom,
} from "@/lib/api";

type PendingAttachment = {
  id: string;
  file: File;
  name: string;
  size: number;
  kind: "image" | "file";
  preview?: string;
  status: "ready" | "uploading" | "reading" | "failed";
  progress: number;
};

type MessageAttachment = {
  id: string;
  name: string;
  size: number;
  kind: "image" | "file";
  preview?: string;
};

type RoomCreationOffer = {
  files: File[];
  fileNames: string[];
  status: "ready" | "creating";
};

type DisplayMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  imagePreview?: string;
  imageName?: string;
  documentName?: string;
  documentSize?: number;
  attachments?: MessageAttachment[];
  generatedImage?: boolean;
};

const suggestions = [
  "Summarize notes",
  "Explain a topic",
  "Create a quiz",
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
  const [handoffPrompt, setHandoffPrompt] =
    useState(initialPrompt);

  useEffect(() => {
    const savedPrompt =
      window.sessionStorage.getItem(
        "studysnap:pending-general-ai-prompt",
      );

    const nextPrompt =
      initialPrompt.trim() ||
      savedPrompt?.trim() ||
      "";

    if (!nextPrompt) {
      return;
    }

    setHandoffPrompt(nextPrompt);

    window.sessionStorage.removeItem(
      "studysnap:pending-general-ai-prompt",
    );
  }, [initialPrompt]);

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

  const [
    expandedMessageIds,
    setExpandedMessageIds,
  ] = useState<Set<string | number>>(
    () => new Set()
  );

  const [error, setError] = useState("");

  const [selectedImage, setSelectedImage] =
    useState<File | null>(null);

  const [pendingDocument, setPendingDocument] =
    useState<File | null>(null);

  const [pendingAttachments, setPendingAttachments] =
    useState<PendingAttachment[]>([]);
  const [
    roomCreationOffer,
    setRoomCreationOffer,
  ] = useState<RoomCreationOffer | null>(null);
  const [availableRooms, setAvailableRooms] =
    useState<StudyRoom[]>([]);
  const [roomPickerOpen, setRoomPickerOpen] =
    useState(false);
  const [loadingRooms, setLoadingRooms] =
    useState(false);
  const [documentUploadProgress, setDocumentUploadProgress] =
    useState(0);
  const [documentUploading, setDocumentUploading] =
    useState(false);
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
        selectedImage !== null ||
        pendingDocument !== null ||
        pendingAttachments.length > 0) &&
      !loading &&
      !documentUploading
    );
  }, [
    createImageMode,
    input,
    selectedImage,
    pendingDocument,
    pendingAttachments,
    loading,
    documentUploading,
  ]);

  function scrollToBottom(
    behavior: ScrollBehavior = "smooth"
  ) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({
          behavior,
          block: "end",
        });
      });
    });
  }

  useEffect(() => {
    if (
      messages.length > 0 ||
      loading ||
      loadingMessages
    ) {
      scrollToBottom(
        loadingMessages ? "auto" : "smooth"
      );
    }
  }, [
    messages,
    loading,
    loadingMessages,
  ]);

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
          : "Could not load this chat."
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
    } else {
      setHistoryOpen(window.innerWidth >= 1280);
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
              : "Could not load your chats."
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
    const pendingFiles =
      takePendingAIAttachments();

    if (!pendingFiles.length) {
      return;
    }

    void addAttachments(
      pendingFiles.slice(0, 20)
    );

    window.history.replaceState(
      {},
      "",
      "/general-ai",
    );
  }, []);

  useEffect(() => {
    const prompt = handoffPrompt.trim();

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
    handoffPrompt,
    loading,
    loadingTrails,
  ]);

  function attachmentId(file: File) {
    return [
      file.name,
      file.size,
      file.lastModified,
      Math.random().toString(16).slice(2),
    ].join("-");
  }

  function isImageAttachment(file: File) {
    const extension =
      file.name.split(".").pop()?.toLowerCase() || "";

    return (
      file.type.startsWith("image/") ||
      new Set([
        "png",
        "jpg",
        "jpeg",
        "webp",
        "gif",
        "bmp",
        "tif",
        "tiff",
        "heic",
        "heif",
        "avif",
      ]).has(extension)
    );
  }

  async function addAttachments(files: File[]) {
    if (!files.length) return;

    setCreateImageMode(false);
    setError("");

    const supportedDocuments = new Set([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "txt",
      "md",
      "markdown",
      "csv",
      "tsv",
      "json",
      "jsonl",
      "log",
      "rtf",
      "py",
      "java",
      "js",
      "jsx",
      "ts",
      "tsx",
      "sql",
      "html",
      "css",
      "xml",
      "yaml",
      "yml",
      "toml",
    ]);

    const prepared: PendingAttachment[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "";

      const image = isImageAttachment(file);

      if (
        !image &&
        !supportedDocuments.has(extension)
      ) {
        rejected.push(file.name);
        continue;
      }

      const limit = image
        ? 25 * 1024 * 1024
        : 25 * 1024 * 1024;

      if (file.size > limit) {
        rejected.push(file.name);
        continue;
      }

      prepared.push({
        id: attachmentId(file),
        file,
        name: file.name,
        size: file.size,
        kind: image ? "image" : "file",
        preview: image
          ? URL.createObjectURL(file)
          : undefined,
        status: "ready",
        progress: 0,
      });
    }

    setPendingAttachments((current) => {
      const remainingSlots = Math.max(
        0,
        20 - current.length
      );

      return [
        ...current,
        ...prepared.slice(0, remainingSlots),
      ];
    });

    if (rejected.length) {
      setError(
        `Skipped ${rejected.length} unsupported or oversized file${
          rejected.length === 1 ? "" : "s"
        }.`
      );
    }

    inputRef.current?.focus();
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((current) => {
      const removed = current.find(
        (item) => item.id === id
      );

      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }

      return current.filter(
        (item) => item.id !== id
      );
    });
  }

  function clearPendingAttachments() {
    setPendingAttachments((current) => {
      current.forEach((item) => {
        if (item.preview) {
          URL.revokeObjectURL(item.preview);
        }
      });

      return [];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleMultipleAttachmentChange(
    fileList: FileList | null
  ) {
    if (!fileList?.length) return;

    await addAttachments(
      Array.from(fileList)
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

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

  async function handleAttachmentChange(
    selectedFile: File | undefined
  ) {
    if (!selectedFile) {
      return;
    }

    const extension =
      selectedFile.name.split(".").pop()?.toLowerCase() || "";

    const imageExtensions = new Set([
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "bmp",
      "tif",
      "tiff",
      "heic",
      "heif",
      "avif",
    ]);

    const isImage =
      selectedFile.type.startsWith("image/") ||
      imageExtensions.has(extension);

    if (isImage) {
      setPendingDocument(null);
      await handleImageChange(selectedFile);
      return;
    }

    const supportedDocuments = new Set([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "txt",
      "md",
      "markdown",
      "csv",
      "tsv",
      "json",
      "jsonl",
      "log",
      "rtf",
      "py",
      "java",
      "js",
      "jsx",
      "ts",
      "tsx",
      "sql",
      "html",
      "css",
      "xml",
      "yaml",
      "yml",
      "toml",
    ]);

    if (!supportedDocuments.has(extension)) {
      setError(
        "Use PDF, DOCX, PPTX, XLSX, text, code, CSV, JSON, or an image."
      );
      return;
    }

    if (selectedFile.size > 25 * 1024 * 1024) {
      setError(
        "Direct AI reading supports files up to 25MB."
      );
      return;
    }

    removeSelectedImage();
    setPendingDocument(selectedFile);
    setDocumentUploadProgress(0);
    setRoomPickerOpen(false);
    setError("");
    setCreateImageMode(false);
    inputRef.current?.focus();
  }

  function removeSelectedDocument() {
    if (documentUploading) {
      return;
    }

    setPendingDocument(null);
    setDocumentUploadProgress(0);
    setRoomPickerOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function openSaveToRoomPicker() {
    if (!pendingDocument || loadingRooms) {
      return;
    }

    setRoomPickerOpen(true);
    setLoadingRooms(true);
    setError("");

    try {
      const rooms = await getStudyRooms();
      setAvailableRooms(rooms);
    } catch (err) {
      setRoomPickerOpen(false);
      setError(
        err instanceof Error
          ? err.message
          : "StudySnap could not load your rooms."
      );
    } finally {
      setLoadingRooms(false);
    }
  }

  async function uploadDocumentToRoom(room: StudyRoom) {
    if (!pendingDocument || documentUploading) {
      return;
    }

    try {
      setDocumentUploading(true);
      setDocumentUploadProgress(0);
      setError("");

      await uploadUniversalMaterial({
        file: pendingDocument,
        studyRoomId: room.id,
        onProgress: setDocumentUploadProgress,
      });

      setRoomPickerOpen(false);
      setDocumentUploadProgress(100);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The document could not be saved to the room."
      );
    } finally {
      setDocumentUploading(false);
    }
  }

  function cancelDocumentUpload() {
    if (documentUploading) {
      return;
    }

    setRoomPickerOpen(false);
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
    removeSelectedDocument();
    clearPendingAttachments();
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
      setDocumentUploading(false);
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

    const documentToSend = pendingDocument;
    const attachmentsToSend = pendingAttachments;

    if (
      (
        !question &&
        !imageToSend &&
        !documentToSend &&
        attachmentsToSend.length === 0
      ) ||
      loading ||
      documentUploading
    ) {
      return;
    }

    const finalQuestion =
      question ||
      (
        attachmentsToSend.length > 1
          ? "Explain these files clearly and connect the important points."
          : attachmentsToSend.length === 1
            ? (
                attachmentsToSend[0].kind === "image"
                  ? "Describe this image clearly."
                  : "Summarize this file clearly."
              )
            : documentToSend
              ? "Summarize this file clearly."
              : "Describe this image clearly."
      );

    if (!imageToSend && !documentToSend && question) {
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

    if (attachmentsToSend.length > 0) {
      setRoomCreationOffer(null);
    }

    // Keep an attached image visible until the request succeeds.
    if (!imageToSend && !documentToSend) {
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
          documentName: documentToSend?.name,
          documentSize: documentToSend?.size,
          attachments:
            attachmentsToSend.length > 0
              ? attachmentsToSend.map(
                  (attachment) => ({
                    id: attachment.id,
                    name: attachment.name,
                    size: attachment.size,
                    kind: attachment.kind,
                    preview: attachment.preview,
                  })
                )
              : undefined,
        },
        {
          id: pendingAssistantId,
          role: "assistant",
          content:
            attachmentsToSend.length > 0
              ? `StudySnap AI is reading ${
                  attachmentsToSend.length
                } file${
                  attachmentsToSend.length === 1
                    ? ""
                    : "s"
                }...`
              : imageToSend
                ? "StudySnap AI is reading the image..."
                : documentToSend
                  ? "StudySnap AI is reading the file..."
                  : "StudySnap AI is thinking...",
        },
      ]);

      scrollToBottom();

      if (attachmentsToSend.length > 0) {
        setPendingAttachments((current) =>
          current.map((attachment) =>
            attachmentsToSend.some(
              (selected) =>
                selected.id === attachment.id
            )
              ? {
                  ...attachment,
                  status: "uploading",
                  progress: 5,
                }
              : attachment
          )
        );

        const data = await askAiWithFiles({
          question: finalQuestion,
          files: attachmentsToSend.map(
            (attachment) => attachment.file
          ),
          conversationId,
          onProgress: (percent) => {
            setPendingAttachments((current) =>
              current.map((attachment) =>
                attachmentsToSend.some(
                  (selected) =>
                    selected.id === attachment.id
                )
                  ? {
                      ...attachment,
                      status:
                        percent >= 100
                          ? "reading"
                          : "uploading",
                      progress: percent,
                    }
                  : attachment
              )
            );

            scrollToBottom();
          },
        });

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

        setRoomCreationOffer({
          files: attachmentsToSend.map(
            (attachment) => attachment.file
          ),
          fileNames: attachmentsToSend.map(
            (attachment) => attachment.name
          ),
          status: "ready",
        });

        clearPendingAttachments();
      } else if (documentToSend) {
        setDocumentUploading(true);
        setDocumentUploadProgress(35);

        const progressTimer =
          window.setTimeout(() => {
            setDocumentUploadProgress(75);
          }, 700);

        let data;

        try {
          data = await askAiWithFile(
            finalQuestion,
            documentToSend,
            {
              conversationId,
            }
          );
        } finally {
          window.clearTimeout(progressTimer);
        }

        setDocumentUploadProgress(100);

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
      } else if (imageToSend) {
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

      if (documentToSend) {
        removeSelectedDocument();
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

  function updateHistoryOpen(next: boolean) {
    setHistoryOpen(next);

    window.localStorage.setItem(
      "studysnap:general-ai-history-open",
      String(next)
    );
  }

  function updateStudyToolsOpen(next: boolean) {
    setStudyToolsOpen(next);

    window.localStorage.setItem(
      "studysnap:general-ai-study-tools-open",
      String(next)
    );
  }

  function startNewTrail() {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setError("");
    setCopiedId(null);
    setExpandedMessageIds(new Set());
    setCreateImageMode(false);
    setRoomCreationOffer(null);
    removeSelectedImage();
    clearPendingAttachments();
    inputRef.current?.focus();
  }

  async function resetCurrentChat() {
    if (loading) return;

    if (
      activeConversationId === null ||
      messages.length === 0
    ) {
      startNewTrail();
      return;
    }

    const confirmed = window.confirm(
      "Reset this chat? Its messages will be permanently removed."
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setError("");

      await deleteAIConversation(
        activeConversationId
      );

      setTrails((current) =>
        current.filter(
          (trail) =>
            trail.id !== activeConversationId
        )
      );

      startNewTrail();
      updateHistoryOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reset this chat."
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleMessageExpanded(
    messageId: string | number
  ) {
    setExpandedMessageIds((current) => {
      const next = new Set(current);

      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }

      return next;
    });
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

    if (window.innerWidth < 1280) {
      updateHistoryOpen(false);
    }
  }

  async function renameTrail(
    trail: AIConversation
  ) {
    const nextTitle = window.prompt(
      "Rename chat",
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
          : "Could not rename this chat."
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
          : "Could not update this chat."
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
          : "Could not delete this chat."
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

  async function createStudyRoomFromFiles() {
    if (
      !roomCreationOffer ||
      roomCreationOffer.status === "creating"
    ) {
      return;
    }

    const files = roomCreationOffer.files;

    try {
      setError("");

      setRoomCreationOffer((current) =>
        current
          ? {
              ...current,
              status: "creating",
            }
          : null
      );

      const result =
        await organizeFilesIntoStudyRooms(files);

      const firstRoom = result.rooms[0];

      if (!firstRoom) {
        throw new Error(
          "StudySnap could not create a room from these files."
        );
      }

      saveProjectRoomId(firstRoom.id);
      setRoomCreationOffer(null);

      router.push(
        `/study-rooms/${firstRoom.id}`
      );
    } catch (err) {
      setRoomCreationOffer((current) =>
        current
          ? {
              ...current,
              status: "ready",
            }
          : null
      );

      setError(
        err instanceof Error
          ? err.message
          : "The study room could not be created."
      );
    }
  }

  function renderComposer(large = false) {
    return (
      <form
        onSubmit={handleSubmit}
        className={
          large
            ? "rounded-[1.6rem] border border-[#c9ad50]/[0.18] bg-[#12181e] p-4"
            : "rounded-[1.4rem] border border-white/10 bg-[#12181e] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.42)]"
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.heic,.heif,.pdf,.docx,.pptx,.xlsx,.txt,.rtf,.csv,.md,.json,.py,.js,.ts,.tsx,.sql,.html,.css,.xml,.yaml,.yml"
          className="hidden"
          onChange={(event) => {
            void handleMultipleAttachmentChange(
              event.currentTarget.files
            );
          }}
        />

        {roomCreationOffer ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#c9ad50]/20 bg-[#c9ad50]/[0.07] p-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-white">
                Keep these files together
              </p>
              <p className="mt-1 truncate text-xs text-slate-400">
                {roomCreationOffer.fileNames.length === 1
                  ? roomCreationOffer.fileNames[0]
                  : `${roomCreationOffer.fileNames.length} files`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setRoomCreationOffer(null)
                }
                disabled={
                  roomCreationOffer.status ===
                  "creating"
                }
                aria-label="Dismiss study room suggestion"
                title="Dismiss"
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
              >
                ×
              </button>

              <button
                type="button"
                onClick={() =>
                  void createStudyRoomFromFiles()
                }
                disabled={
                  roomCreationOffer.status ===
                  "creating"
                }
                className="rounded-xl bg-[#c9ad50] px-3 py-2 text-xs font-black text-[#111317] transition hover:bg-[#d5bb63] disabled:opacity-50"
              >
                {roomCreationOffer.status ===
                "creating"
                  ? "Creating..."
                  : "Create study room"}
              </button>
            </div>
          </div>
        ) : null}

        {createImageMode ? (
          <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a8b5bd]">
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
                className="bg-[#151c23]"
              >
                Square
              </option>
              <option
                value="1536x1024"
                className="bg-[#151c23]"
              >
                Landscape
              </option>
              <option
                value="1024x1536"
                className="bg-[#151c23]"
              >
                Portrait
              </option>
            </select>
          </div>
        ) : null}

        {pendingAttachments.length > 0 ? (
          <div className="mb-3 min-w-0 max-w-full overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2">
              {pendingAttachments.map(
                (attachment) => (
                  <div
                    key={attachment.id}
                    className="relative w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25 sm:w-44"
                  >
                    {attachment.kind === "image" &&
                    attachment.preview ? (
                      <img
                        src={attachment.preview}
                        alt={attachment.name}
                        className="h-24 w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-24 place-items-center bg-white/[0.035] text-3xl">
                        📄
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        removePendingAttachment(
                          attachment.id
                        )
                      }
                      disabled={
                        attachment.status ===
                          "uploading" ||
                        attachment.status ===
                          "reading"
                      }
                      aria-label={`Remove ${attachment.name}`}
                      title="Remove"
                      className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/75 text-sm font-black text-white backdrop-blur disabled:opacity-40"
                    >
                      ×
                    </button>

                    <div className="p-2.5">
                      <p className="truncate text-xs font-black text-white">
                        {attachment.name}
                      </p>

                      <p className="mt-1 text-[10px] font-bold text-slate-500">
                        {attachment.status ===
                        "uploading"
                          ? `Uploading ${attachment.progress}%`
                          : attachment.status ===
                              "reading"
                            ? "Reading…"
                            : attachment.status ===
                                "failed"
                              ? "Failed"
                              : `${(
                                  attachment.size /
                                  1024 /
                                  1024
                                ).toFixed(2)} MB`}
                      </p>

                      {attachment.status ===
                        "uploading" ||
                      attachment.status ===
                        "reading" ? (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[#c9ad50] transition-all"
                            style={{
                              width: `${
                                attachment.status ===
                                "reading"
                                  ? 100
                                  : attachment.progress
                              }%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        ) : null}

        {pendingDocument ? (
          <div className="mb-3 rounded-2xl border border-[#c9ad50]/[0.18] bg-[#c9ad50]/[0.07] p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/25 text-xl">
                📄
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-white">
                  {pendingDocument.name}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {(pendingDocument.size / 1024 / 1024).toFixed(2)} MB
                  {" · "}
                  {documentUploading
                    ? `Reading ${documentUploadProgress}%`
                    : "Ready for AI"}
                </p>
              </div>

              <button
                type="button"
                onClick={removeSelectedDocument}
                disabled={documentUploading}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 disabled:opacity-40"
              >
                Remove
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openSaveToRoomPicker()}
                disabled={documentUploading}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-200 disabled:opacity-40"
              >
                Save to room
              </button>

              <span className="text-xs text-slate-500">
                Optional
              </span>
            </div>
          </div>
        ) : null}

        {selectedImage ? (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#c9ad50]/[0.16] bg-[#c9ad50]/[0.075] p-3">
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
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-[#0d1218] text-[10px] font-black text-[#cec18d]">
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
                  className="h-full rounded-full bg-[#c9ad50] transition-all duration-200"
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
              : pendingAttachments.length > 1
                ? "Ask about these files..."
                : pendingAttachments.length === 1
                  ? "Ask about this file..."
                  : selectedImage
                    ? "Ask about this image..."
                    : pendingDocument
                      ? "Ask about this file..."
                      : "Message..."
          }
          rows={large ? 4 : 2}
          className={`w-full resize-none bg-transparent px-3 py-3 font-semibold text-white outline-none placeholder:text-slate-500 ${
            large
              ? "min-h-32 text-lg"
              : "max-h-40 min-h-16 text-sm"
          }`}
        />

        <div className="flex min-w-0 flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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
              title="Attach a file"
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
              className={`max-w-full rounded-xl border px-3 py-2 text-xs font-black transition ${
                createImageMode
                  ? "border-[#c9ad50]/[0.20] bg-[#c9ad50]/[0.09] text-[#ece8da]"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              {createImageMode
                ? "✦ Image mode"
                : "✦ Create image"}
            </button>

            {(input.trim() ||
              selectedImage ||
              pendingDocument ||
              pendingAttachments.length > 0) ? (
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
              className={`grid h-10 place-items-center rounded-xl bg-[#c9ad50] font-black text-[#111317] transition hover:bg-[#d5bb63] disabled:cursor-not-allowed disabled:opacity-40 ${
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
    <section className="relative min-h-[calc(100dvh-10rem)] min-w-0 max-w-full overflow-x-clip">
      <div className="sticky top-[60px] z-30 -mx-3 border-b border-white/[0.08] bg-[#0b0f14]/[0.97] px-3 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-[72px] lg:mx-0 lg:mb-3 lg:rounded-2xl lg:border">
        <div className="flex min-h-12 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              updateHistoryOpen(!historyOpen)
            }
            aria-label="Open chat history"
            aria-expanded={historyOpen}
            title="Chat history"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-base transition ${
              historyOpen
                ? "border-[#c9ad50]/30 bg-[#c9ad50]/10 text-[#e6daa0]"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
            }`}
          >
            ☰
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">
              Ask
            </p>

            <p className="truncate text-[11px] text-slate-500">
              {activeTrail?.title || "New chat"}
            </p>
          </div>

          <button
            type="button"
            onClick={startNewTrail}
            aria-label="Start a new chat"
            title="New chat"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-xl text-slate-200 transition hover:bg-white/[0.08]"
          >
            ＋
          </button>

          <button
            type="button"
            onClick={() =>
              void resetCurrentChat()
            }
            disabled={
              loading ||
              (
                !hasMessages &&
                !input.trim() &&
                !selectedImage
              )
            }
            aria-label="Reset current chat"
            title="Reset chat"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-lg text-slate-300 transition hover:border-red-300/20 hover:bg-red-400/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-35"
          >
            ↻
          </button>

          <button
            type="button"
            onClick={() =>
              updateStudyToolsOpen(
                !studyToolsOpen
              )
            }
            aria-label="Open study tools"
            aria-expanded={studyToolsOpen}
            title="Study tools"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-sm font-black tracking-[0.12em] transition ${
              studyToolsOpen
                ? "border-[#c9ad50]/30 bg-[#c9ad50]/10 text-[#e6daa0]"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
            }`}
          >
            •••
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div className="fixed inset-0 z-[90] xl:hidden">
          <button
            type="button"
            aria-label="Close chat history"
            onClick={() =>
              updateHistoryOpen(false)
            }
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />

          <aside className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 top-[60px] w-[min(88vw,350px)] overflow-y-auto border-r border-white/10 bg-[#0d1218] p-2 shadow-2xl">
            <div className="flex h-11 items-center justify-end px-1">
              <button
                type="button"
                onClick={() =>
                  updateHistoryOpen(false)
                }
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-lg text-slate-300"
                aria-label="Close chat history"
                title="Close"
              >
                ×
              </button>
            </div>

            <StudyTrailPanel
              trails={trails}
              activeTrailId={activeConversationId}
              loading={loadingTrails}
              search={trailSearch}
              title="Chats"
              emptyMessage="Start your first chat."
              onSearchChange={setTrailSearch}
              onSelect={(trail) =>
                void selectTrail(trail)
              }
              onNew={() => {
                startNewTrail();
                updateHistoryOpen(false);
              }}
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
          </aside>
        </div>
      ) : null}

      <div
        className={`grid min-w-0 gap-4 ${
          historyOpen
            ? "xl:grid-cols-[280px_minmax(0,1fr)]"
            : "grid-cols-1"
        }`}
      >
        {historyOpen ? (
          <aside className="hidden min-w-0 xl:block">
            <div className="sticky top-[9.25rem]">
              <StudyTrailPanel
                trails={trails}
                activeTrailId={activeConversationId}
                loading={loadingTrails}
                search={trailSearch}
                title="Chats"
                emptyMessage="Start your first chat."
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
            </div>
          </aside>
        ) : null}

        <div className="min-w-0">
          {!hasMessages &&
          !loadingMessages ? (
            <div className="mx-auto flex min-h-[calc(100dvh-15rem)] max-w-3xl flex-col justify-center py-6">
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-[#c9ad50]/20 bg-[#c9ad50]/10 text-xl text-[#e3d589]">
                  ✦
                </div>

                <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
                  How can I help?
                </h2>
              </div>

              <div className="mt-6">
                {renderComposer(false)}
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() =>
                      void sendMessage(suggestion)
                    }
                    disabled={loading}
                    className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-[#c9ad50]/20 hover:bg-[#c9ad50]/10 hover:text-white disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 px-0.5 pb-48 pt-4 sm:px-2">
                {loadingMessages ? (
                  <p className="py-12 text-center text-sm font-bold text-slate-400">
                    Opening chat...
                  </p>
                ) : null}

                {messages.map((message) => {
                  const collapseLimit =
                    message.role === "user"
                      ? 420
                      : 760;

                  const longMessage =
                    message.content.length >
                    collapseLimit;

                  const expanded =
                    expandedMessageIds.has(
                      message.id
                    );

                  const displayedContent =
                    longMessage && !expanded
                      ? `${message.content
                          .slice(
                            0,
                            collapseLimit,
                          )
                          .trimEnd()}…`
                      : message.content;

                  return (
                    <article
                      key={message.id}
                      className={
                        message.role === "user"
                          ? "ml-auto max-w-[88%] rounded-2xl border border-[#c9ad50]/15 bg-[#c9ad50]/10 px-4 py-3 text-[#ece8da] sm:max-w-[76%]"
                          : "mr-auto max-w-[96%] rounded-2xl border border-white/[0.07] bg-[#12181e] px-4 py-3 text-slate-100 sm:max-w-[86%]"
                      }
                    >
                      {message.attachments?.length ? (
                        <div className="mb-3 flex max-w-full gap-2 overflow-x-auto pb-1">
                          {message.attachments.map(
                            (attachment) => (
                              <div
                                key={attachment.id}
                                className="w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
                              >
                                {attachment.kind === "image" &&
                                attachment.preview ? (
                                  <img
                                    src={attachment.preview}
                                    alt={attachment.name}
                                    className="h-24 w-full object-cover"
                                  />
                                ) : (
                                  <div className="grid h-24 place-items-center text-3xl">
                                    📄
                                  </div>
                                )}

                                <div className="p-2">
                                  <p className="truncate text-[11px] font-black text-white">
                                    {attachment.name}
                                  </p>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      ) : null}

                      {message.documentName ? (
                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <span className="text-xl">📄</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">
                          {message.documentName}
                        </p>
                        {typeof message.documentSize === "number" ? (
                          <p className="text-xs text-slate-500">
                            {(message.documentSize / 1024 / 1024).toFixed(2)} MB
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {message.imagePreview ? (
                        <img
                          src={message.imagePreview}
                          alt={
                            message.imageName ||
                            "Uploaded image"
                          }
                          className={`mb-3 rounded-xl object-contain ${
                            message.generatedImage
                              ? "max-h-[520px] w-full"
                              : "max-h-72"
                          }`}
                        />
                      ) : null}

                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-55">
                          {message.role === "user"
                            ? "You"
                            : "AI"}
                        </p>

                        {message.role ===
                        "assistant" ? (
                          <div className="flex items-center gap-1.5">
                            {message.generatedImage &&
                            message.imagePreview ? (
                              <button
                                type="button"
                                onClick={() =>
                                  downloadGeneratedImage(
                                    message
                                  )
                                }
                                title="Download image"
                                className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-black text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
                              >
                                ↓
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() =>
                                void copyMessage(
                                  message
                                )
                              }
                              title="Copy answer"
                              className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-black text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
                            >
                              {copiedId === message.id
                                ? "✓"
                                : "Copy"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {message.role ===
                      "assistant" ? (
                        <SimpleMarkdown
                          content={displayedContent}
                          className="text-sm leading-7"
                        />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-6">
                          {displayedContent}
                        </div>
                      )}

                      {longMessage ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleMessageExpanded(
                              message.id
                            )
                          }
                          className="mt-3 text-xs font-black text-[#d9ca83] hover:text-[#eee3ac]"
                        >
                          {expanded
                            ? "Show less"
                            : "Show more"}
                        </button>
                      ) : null}
                    </article>
                  );
                })}

                <div ref={bottomRef} />
              </div>

              <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 bg-gradient-to-t from-[#0b0f14] via-[#0b0f14]/95 to-transparent px-1 pb-2 pt-5 lg:bottom-3">
                {renderComposer(false)}
              </div>
            </>
          )}

          {error ? (
            <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
              {error}
            </div>
          ) : null}
        </div>
      </div>


      {roomPickerOpen ? (
        <div className="fixed inset-0 z-[110] grid place-items-end bg-black/70 p-3 backdrop-blur-sm sm:place-items-center">
          <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12181e] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c9ad50]">
                  Add to a room
                </p>

                <h2 className="mt-1 truncate text-lg font-black text-white">
                  {pendingDocument?.name || "Selected document"}
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Choose where this document belongs.
                </p>
              </div>

              <button
                type="button"
                onClick={cancelDocumentUpload}
                disabled={documentUploading}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-300"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {documentUploading ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>Uploading</span>
                  <span>{documentUploadProgress}%</span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#c9ad50] transition-all"
                    style={{
                      width: `${documentUploadProgress}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {loadingRooms ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  Loading rooms...
                </p>
              ) : availableRooms.length ? (
                availableRooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => void uploadDocumentToRoom(room)}
                    disabled={documentUploading}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#c9ad50]/10">
                      📚
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-white">
                        {room.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {room.subject || "Study room"}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="py-7 text-center">
                  <p className="text-sm font-bold text-white">
                    No study room found
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Create a room before adding documents.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {studyToolsOpen ? (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="Close study tools"
            onClick={() =>
              updateStudyToolsOpen(false)
            }
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />

          <aside className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 rounded-2xl border border-white/10 bg-[#12181e] p-4 shadow-2xl lg:bottom-auto lg:left-1/2 lg:right-auto lg:top-1/2 lg:w-[420px] lg:-translate-x-1/2 lg:-translate-y-1/2">
            <div className="flex items-center justify-between">
              <p className="font-black text-white">
                Study tools
              </p>

              <button
                type="button"
                onClick={() =>
                  updateStudyToolsOpen(false)
                }
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-lg text-slate-300"
                aria-label="Close study tools"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={`tool-${suggestion}`}
                  type="button"
                  onClick={() => {
                    updateStudyToolsOpen(false);
                    void sendMessage(suggestion);
                  }}
                  disabled={loading}
                  className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-sm font-bold text-slate-200 transition hover:bg-[#c9ad50]/10 hover:text-white disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setCreateImageMode(true);
                  removeSelectedImage();
                  setError("");
                  updateStudyToolsOpen(false);
                  inputRef.current?.focus();
                }}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left text-sm font-bold text-slate-200 transition hover:bg-[#c9ad50]/10 hover:text-white"
              >
                ✦ Create an image
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
