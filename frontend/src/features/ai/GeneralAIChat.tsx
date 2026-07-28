"use client";

/* eslint-disable @next/next/no-img-element -- General AI renders uploaded, generated, blob-backed, and data-URL previews that intentionally use native images. */

import CentralActionBar from "@/components/ai/CentralActionBar";
import AIActivityPanel, {
  type AIActivityStep,
} from "@/components/ai/AIActivityPanel";

import {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import StudyTrailPanel from "@/components/ai/StudyTrailPanel";
import SimpleMarkdown from "@/components/ui/SimpleMarkdown";
import SmartActionLinks from "@/components/ai/SmartActionLinks";
import GeneralAIMessageActions from "@/components/ai/GeneralAIMessageActions";
import ArtifactFileCards from "@/components/ai/ArtifactFileCards";
import AttachmentPreviewButton from "@/components/ai/AttachmentPreviewButton";

import { resolveStudyCommand } from "@/lib/studyCommandRouter";
import { detectGeneralAIActionIntent } from "@/lib/generalAiActionIntent";
import { resolveGeneralAIActionTarget } from "@/lib/generalAiActionContext";
import { asksForLiveResearch } from "@/lib/generalAiIntent";
import {
  buildFileBrainDisplayAttachments,
  useGeneralAIFileBrainQueue,
} from "@/features/ai/GeneralAIFileBrainQueue";
import { takePendingAIAttachments } from "@/lib/aiAttachmentHandoff";
import { saveProjectRoomId } from "@/features/projects/projectRoomContext";
import {
  askAiWithFile,
  askAiWithFiles,
  askAiWithImage,
  createAIConversation,
  createImagePdfArtifact,
  getStudyRooms,
  organizeFilesIntoStudyRooms,
  uploadUniversalMaterial,
  editAIImage,
  generateAIImage,
  deleteAIConversation,
  getAIMessages,
  getAIAttachmentDataUrl,
  getStudyTrails,
  pinAIConversation,
  renameAIConversation,
  streamAIMessage,
  cancelAIMessage,
  type AIMessageActionResponse,
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
  "Explain this material in simple words",
  "Teach me this material step by step",
  "Quiz me on this material",
  "Give me clear examples from this material",
  "Simplify this material for a beginner",
  "Give me practice questions on this material",
  "Summarize the most important points",
];

const GENERAL_AI_HIDDEN_FILE_QUEUE_KEY =
  "studysnap:general-ai-hidden-file-queue-v1";


function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


function parseGeneralAIRoomId(
  value: string | null
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

function buildGeneralAIUrl({
  studyRoomId,
  materialId,
  materialName,
}: {
  studyRoomId: number | null;
  materialId: number | null;
  materialName: string;
}): string {
  const params = new URLSearchParams();

  if (studyRoomId !== null) {
    params.set(
      "roomId",
      String(studyRoomId)
    );
  }

  if (
    studyRoomId !== null &&
    materialId !== null
  ) {
    params.set(
      "materialId",
      String(materialId)
    );
  }

  if (
    studyRoomId !== null &&
    materialName.trim()
  ) {
    params.set(
      "materialName",
      materialName.trim()
    );
  }

  const query = params.toString();

  return query
    ? `/general-ai?${query}`
    : "/general-ai";
}



function hasExplicitImageGenerationRequest(
  value: string,
  hasImageContext: boolean,
): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  const explicitPatterns = [
    /\b(?:create|generate|draw|design|render|make)\b[\s\S]{0,60}\b(?:image|picture|photo|diagram|illustration|poster|logo|artwork)\b/i,
    /\b(?:image|picture|photo|diagram|illustration|poster|logo|artwork)\b[\s\S]{0,60}\b(?:create|generate|draw|design|render|make)\b/i,
  ];

  if (
    explicitPatterns.some(
      (pattern) => pattern.test(normalized)
    )
  ) {
    return true;
  }

  return (
    hasImageContext &&
    /\b(?:another one|one more|new one|regenerate(?: it)?|redo(?: it)?)\b/i.test(
      normalized
    )
  );
}


function buildRecentImageContext(
  recentMessages: Array<{
    role: string;
    content: string;
  }>,
): string[] {
  return recentMessages
    .slice(-8)
    .map((message) => {
      const content = message.content
        .replace(/\s+/g, " ")
        .trim();

      if (
        !content ||
        content.startsWith(
          "[Generated image]"
        ) ||
        content.includes(
          "StudySnap is creating the image"
        )
      ) {
        return "";
      }

      return (
        `${message.role}: `
        + content.slice(0, 600)
      );
    })
    .filter(
      (item): item is string =>
        Boolean(item)
    );
}


function preserveGeneralAIHandoff(
  targetUrl: string,
): string {
  if (typeof window === "undefined") {
    return targetUrl;
  }

  const currentParams =
    new URLSearchParams(
      window.location.search,
    );

  const handoffId =
    (
      currentParams.get(
        "handoff",
      )
      ?? ""
    ).trim();

  if (!handoffId) {
    return targetUrl;
  }

  const nextUrl =
    new URL(
      targetUrl,
      window.location.origin,
    );

  nextUrl.searchParams.set(
    "handoff",
    handoffId,
  );

  return (
    nextUrl.pathname
    + nextUrl.search
    + nextUrl.hash
  );
}

function consumeGeneralAIStartupUrl() {
  const nextUrl =
    new URL(
      window.location.href,
    );

  nextUrl.searchParams.delete(
    "new",
  );

  nextUrl.searchParams.delete(
    "prompt",
  );

  window.history.replaceState(
    {},
    "",
    (
      nextUrl.pathname
      + nextUrl.search
      + nextUrl.hash
    ),
  );
}

function cleanStoredMessageContent(message: AIMessage): string {
  const content = message.content.trim();

  if (content.startsWith("[Create image]")) {
    const prompt = content.replace("[Create image]", "").trim();

    return prompt ? `Create an image: ${prompt}` : "Create an image";
  }

  if (content.startsWith("[Edit image]")) {
    const prompt = content
      .replace("[Edit image]", "")
      .trim();

    return prompt
      ? `Recreate image: ${prompt}`
      : "Recreate image";
  }

  if (content.startsWith("[Generated image]")) {
    return "Image created";
  }

  if (content.startsWith("[Image uploaded]")) {
    return content.replace("[Image uploaded]", "").trim();
  }

  if (content.startsWith("[File:")) {
    const closingBracket = content.indexOf("]");

    if (closingBracket >= 0) {
      return content.slice(closingBracket + 1).trim();
    }
  }

  return message.content;
}

function mapStoredMessage(
  message: AIMessage,
  attachmentPreview?: string,
): DisplayMessage {
  const attachment = message.attachment;

  const generatedImage =
    message.role === "assistant" && attachment?.kind === "image";

  const storedAttachment: MessageAttachment | undefined = attachment
    ? {
        id: `stored-${message.id}`,
        name: attachment.filename,
        size: attachment.file_size || 0,
        kind: attachment.kind,
        preview: attachment.kind === "image" ? attachmentPreview : undefined,
      }
    : undefined;

  return {
    id: message.id,
    role: message.role,
    content: cleanStoredMessageContent(message),
    created_at: message.created_at,
    imagePreview: generatedImage ? attachmentPreview : undefined,
    imageName: generatedImage ? attachment?.filename : undefined,
    generatedImage,
    attachments:
      storedAttachment && !generatedImage ? [storedAttachment] : undefined,
  };
}

function isStoredFileBrainAttachmentMessage(
  message: DisplayMessage,
): boolean {
  return (
    message.role === "user"
    && (
      message.attachments?.length
      ?? 0
    ) > 0
    && /^Attached from File Brain:/i.test(
      message.content.trim(),
    )
  );
}

function mergeStoredMessageAttachments(
  messages: DisplayMessage[],
): MessageAttachment[] | undefined {
  const attachments =
    new Map<
      string,
      MessageAttachment
    >();

  messages.forEach((message) => {
    message.attachments?.forEach(
      (attachment) => {
        const key = [
          attachment.name,
          attachment.size,
          attachment.kind,
        ].join("::");

        const existing =
          attachments.get(key);

        if (
          !existing
          || (
            !existing.preview
            && attachment.preview
          )
        ) {
          attachments.set(
            key,
            attachment,
          );
        }
      },
    );
  });

  const values = [
    ...attachments.values(),
  ];

  return values.length > 0
    ? values
    : undefined;
}

function collapseStoredFileBrainTurns(
  messages: DisplayMessage[],
): DisplayMessage[] {
  const collapsed:
    DisplayMessage[] = [];

  let index = 0;

  while (index < messages.length) {
    const message =
      messages[index];

    if (message.role !== "user") {
      collapsed.push(message);
      index += 1;
      continue;
    }

    let end = index + 1;

    while (
      end < messages.length
      && messages[end].role ===
        "user"
    ) {
      end += 1;
    }

    const userRun =
      messages.slice(
        index,
        end,
      );

    const containsStoredFileBrainMessage =
      userRun.some(
        isStoredFileBrainAttachmentMessage,
      );

    if (
      userRun.length === 1
      || !containsStoredFileBrainMessage
    ) {
      collapsed.push(
        ...userRun,
      );

      index = end;
      continue;
    }

    const meaningfulMessages =
      userRun.filter(
        (item) =>
          item.content.trim()
          && !isStoredFileBrainAttachmentMessage(
            item,
          ),
      );

    const anchor =
      meaningfulMessages[
        meaningfulMessages.length - 1
      ]
      ?? userRun[
        userRun.length - 1
      ];

    const meaningfulContent =
      [
        ...new Set(
          meaningfulMessages
            .map(
              (item) =>
                item.content.trim(),
            )
            .filter(Boolean),
        ),
      ].join("\n\n");

    const imageMessage =
      userRun.find(
        (item) =>
          Boolean(
            item.imagePreview,
          ),
      );

    const documentMessage =
      userRun.find(
        (item) =>
          Boolean(
            item.documentName,
          ),
      );

    collapsed.push({
      ...anchor,

      // Use the final persisted user record as the
      // branch boundary for the complete file turn.
      id:
        userRun[
          userRun.length - 1
        ].id,

      content:
        meaningfulContent,

      created_at:
        userRun[0].created_at
        ?? anchor.created_at,

      imagePreview:
        anchor.imagePreview
        ?? imageMessage
          ?.imagePreview,

      imageName:
        anchor.imageName
        ?? imageMessage
          ?.imageName,

      documentName:
        anchor.documentName
        ?? documentMessage
          ?.documentName,

      documentSize:
        anchor.documentSize
        ?? documentMessage
          ?.documentSize,

      attachments:
        mergeStoredMessageAttachments(
          userRun,
        ),
    });

    index = end;
  }

  return collapsed;
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
      if (typeof value[key] === "string" && value[key]) {
        return value[key] as string;
      }
    }
  }

  return "I could not read the AI response.";
}

async function copyTextWithFallback(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
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

function shouldResolveAsStudyCommand(
  value: string,
) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  if (
    text.length > 180 ||
    text.includes("\n")
  ) {
    return false;
  }

  const codePattern =
    /```|^#!|bash\s+<<|\b(set|cd|git|npm|npx|python|python3|curl|grep|sed|cat|echo|sudo|systemctl)\b|[{};$]|=>|\\$/im;

  return !codePattern.test(text);
}

function findLatestActionTargetMessage(
  items: DisplayMessage[],
  pressedMessageId: number | null = null,
): DisplayMessage | null {
  return resolveGeneralAIActionTarget(
    items,
    {
      pressedMessageId,
      isTransient: (message) =>
        pendingAssistantActivityLabel(
          message.content,
        ) !== null,
    },
  );
}

type AIActivityState = {
  label: string;
  detail: string;
  progress?: number;
};

const GENERAL_AI_DRAFT_KEY =
  "studysnap:general-ai-draft-v1";

const GENERAL_AI_ACTIVE_CONVERSATION_KEY =
  "studysnap:general-ai-active-conversation-v1";

function asksForCurrentInformation(
  value: string,
) {
  return asksForLiveResearch(
    value
  );
}

function asksToCreateImage(
  value: string,
) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  const explicitVisualRequest =
    /\b(create|generate|draw|design|render|illustrate|paint|sketch|make)\b[\s\S]{0,100}\b(image|picture|photo|portrait|diagram|illustration|graphic|visual|poster|infographic|logo|wallpaper|icon|artwork)\b/i.test(
      text
    ) ||
    /\b(image|picture|photo|portrait|diagram|illustration|graphic|visual|poster|infographic|logo|wallpaper|icon|artwork)\b[\s\S]{0,100}\b(create|generate|draw|design|render|illustrate|paint|sketch|make)\b/i.test(
      text
    );

  if (explicitVisualRequest) {
    return true;
  }

  const directCreationRequest =
    /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:create|generate|draw|design|render|illustrate|paint|sketch)\b/i.test(
      text
    );

  if (!directCreationRequest) {
    return false;
  }

  const clearlyNonVisualTarget =
    /\b(note|notes|quiz|questions?|flashcards?|room|project|plan|schedule|summary|document|pdf|file|folder|code|app|application|website|database|api|script|function|class|spreadsheet|presentation|email|message|table|study guide|care plan)\b/i.test(
      text
    );

  return !clearlyNonVisualTarget;
}


type ArtifactExportTarget =
  | "pdf"
  | "docx"
  | "txt"
  | "md";


function detectArtifactExportTarget(
  value: string,
): ArtifactExportTarget | null {
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  if (
    /^(?:what is|what are|how do|how does|how can|why does|explain)\b/i.test(
      normalized
    )
  ) {
    return null;
  }

  const hasAction =
    /\b(?:create|make|turn|convert|change|transform|save|export|download|prepare|generate|send|give)\b/i.test(
      normalized
    );

  if (!hasAction) {
    return null;
  }

  if (
    /\b(?:docx|word document|word file|word doc)\b/i.test(
      normalized
    )
  ) {
    return "docx";
  }

  if (
    /\b(?:pdf|dpf)\b/i.test(
      normalized
    )
  ) {
    return "pdf";
  }

  if (
    /\b(?:markdown|md file)\b/i.test(
      normalized
    )
  ) {
    return "md";
  }

  if (
    /\b(?:txt|text file)\b/i.test(
      normalized
    )
  ) {
    return "txt";
  }

  return null;
}


function asksToEditImage(
  value: string,
) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  const explanationRequest =
    /\b(explain|describe|analyse|analyze|identify|read|summarize|summarise|what is|what does|who is|tell me about|what can you see|what is in)\b/i.test(
      text
    );

  if (explanationRequest) {
    return false;
  }

  const explicitEditRequest =
    /\b(edit|adjust|change|improve|enhance|fix|recreate|redo|retouch|restore|remove|replace|brighten|darken|sharpen|crop|resize|restyle|stylize|colourize|colorize|blur|unblur|upscale|upgrade|fine[\s-]?tune|touch[\s-]?up|clean[\s-]?up|polish|beautify|refine|transform|modify|convert)\b/i.test(
      text
    );

  const qualityRequest =
    /\b(best|better|highest|high)\s+(?:image\s+|photo\s+|picture\s+|pic\s+)?quality\b|\b(?:hd|full\s*hd|4k|8k|high[\s-]?resolution|higher[\s-]?resolution|clearer|cleaner|sharper|brighter|fresher|fresh|professional|studio[\s-]?quality|crisp|natural|realistic)\b/i.test(
      text
    );

  const directMakeRequest =
    /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?make\b/i.test(
      text
    );

  const imageReference =
    /\b(?:it|this|that|same|image|photo|picture|pic|portrait|face|background|version)\b/i.test(
      text
    );

  const contextualFollowUp =
    /^(?:please\s+)?(?:add|remove|change|replace|keep|use|try|put|give|make|turn|convert|enhance|improve|fine[\s-]?tune|freshen)\b/i.test(
      text
    );

  const clearlyNonImageOutput =
    /\b(note|notes|quiz|questions?|flashcards?|room|project|plan|schedule|summary|document|pdf|file|folder|code|app|application|website|database|api|script|function|class|spreadsheet|presentation|email|message|table|study guide|care plan)\b/i.test(
      text
    );

  return (
    explicitEditRequest ||
    qualityRequest ||
    (
      directMakeRequest &&
      !clearlyNonImageOutput
    ) ||
    (
      contextualFollowUp &&
      imageReference &&
      !clearlyNonImageOutput
    )
  );
}

function asksAboutExistingImage(
  value: string,
) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  return (
    /\b(image|photo|picture|portrait|diagram|visual|screenshot|graphic|illustration)\b/i.test(
      text
    ) ||
    /\b(this|it)\b[\s\S]{0,50}\b(show|mean|contain|look|say|explain|describe|read|identify)\b/i.test(
      text
    )
  );
}

async function imageSourceToFile(
  source: string,
  filename = "studysnap-image.png",
) {
  const response = await fetch(source);

  if (!response.ok) {
    throw new Error(
      "StudySnap could not prepare the generated image for another edit."
    );
  }

  const blob = await response.blob();

  return new File(
    [blob],
    filename,
    {
      type:
        blob.type ||
        "image/png",
      lastModified: Date.now(),
    }
  );
}

function makeAIRequestId() {
  if (
    typeof crypto !== "undefined"
    && "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36)
    + "-"
    + Math.random()
      .toString(36)
      .slice(2)
  );
}


function pendingAssistantActivityLabel(
  content: string,
): string | null {
  const text = content
    .trim()
    .replace(/[.…]+$/u, "");

  if (
    !text ||
    text.length > 190
  ) {
    return null;
  }

  const looksLikeActivity =
    /^(?:studysnap(?:\s+ai)?\s+(?:is|will)\s+)?(?:thinking|searching|researching|reading|analyzing|analysing|uploading|saving|writing|editing|generating|creating|processing)|^(?:one moment|please wait)/i.test(
      text,
    );

  if (!looksLikeActivity) {
    return null;
  }

  if (
    /\b(uploading|files queued)\b/i.test(
      text,
    )
  ) {
    return "Uploading";
  }

  if (
    /\b(searching|researching)\b/i.test(
      text,
    )
  ) {
    return "Searching";
  }

  if (
    /\b(reading|analyzing|analysing)\b/i.test(
      text,
    )
  ) {
    return "Reading";
  }

  if (
    /\b(editing|generating|creating)\b/i.test(
      text,
    ) &&
    /\b(image|photo|picture|visual)\b/i.test(
      text,
    )
  ) {
    return "Generating image";
  }

  if (
    /\bsaving\b/i.test(
      text,
    )
  ) {
    return "Saving";
  }

  if (
    /\bwriting\b/i.test(
      text,
    )
  ) {
    return "Writing";
  }

  if (
    /\bprocessing\b/i.test(
      text,
    )
  ) {
    return "Processing";
  }

  return "Thinking";
}


// GENERAL_AI_TASK_AWARE_ACTIVITY_V1

type AIActivityVisual = {
  symbol: string;
  fallbackLabel: string;
};

function getAIActivityVisual(
  label: string
): AIActivityVisual {
  const normalized =
    label
      .trim()
      .toLowerCase();

  if (
    normalized.includes("finish") ||
    normalized.includes("complete") ||
    normalized.includes("ready")
  ) {
    return {
      symbol: "✓",
      fallbackLabel: "Finishing",
    };
  }

  if (
    normalized.includes("image") ||
    normalized.includes("picture") ||
    normalized.includes("photo") ||
    normalized.includes("visual")
  ) {
    return {
      symbol: "◩",
      fallbackLabel: "Creating image",
    };
  }

  if (
    normalized.includes("quiz") ||
    normalized.includes("question")
  ) {
    return {
      symbol: "?",
      fallbackLabel: "Creating quiz",
    };
  }

  if (
    normalized.includes("flashcard") ||
    normalized.includes("card")
  ) {
    return {
      symbol: "▦",
      fallbackLabel: "Creating cards",
    };
  }

  if (
    normalized.includes("note") ||
    normalized.includes("summary") ||
    normalized.includes("saving")
  ) {
    return {
      symbol: "▣",
      fallbackLabel: "Creating notes",
    };
  }

  if (
    normalized.includes("search") ||
    normalized.includes("research") ||
    normalized.includes("web") ||
    normalized.includes("source")
  ) {
    return {
      symbol: "⌕",
      fallbackLabel: "Searching",
    };
  }

  if (
    normalized.includes("read") ||
    normalized.includes("analyz") ||
    normalized.includes("upload") ||
    normalized.includes("file") ||
    normalized.includes("document") ||
    normalized.includes("material")
  ) {
    return {
      symbol: "▤",
      fallbackLabel: "Reading files",
    };
  }

  if (
    normalized.includes("organiz") ||
    normalized.includes("process") ||
    normalized.includes("classif") ||
    normalized.includes("arrang")
  ) {
    return {
      symbol: "◇",
      fallbackLabel: "Organizing",
    };
  }

  if (
    normalized.includes("writing") ||
    normalized.includes("responding")
  ) {
    return {
      symbol: "✦",
      fallbackLabel: "Writing",
    };
  }

  if (
    normalized.includes("stop") ||
    normalized.includes("cancel") ||
    normalized.includes("fail") ||
    normalized.includes("error")
  ) {
    return {
      symbol: "!",
      fallbackLabel: "Stopped",
    };
  }

  return {
    symbol: "S",
    fallbackLabel: "Thinking",
  };
}

function AIActivityIndicator({
  label,
}: {
  label: string;
}) {
  const visual =
    getAIActivityVisual(
      label
    );

  const visibleLabel =
    label.trim() ||
    visual.fallbackLabel;

  return (
    <div
      className="flex min-h-16 flex-col items-start justify-center gap-2 py-1"
      role="status"
      aria-live="polite"
      aria-label={`${visibleLabel}. StudySnap is working.`}
    >
      <span
        className="relative grid h-9 w-9 place-items-center"
        title={visual.fallbackLabel}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-xl border border-[#c9ad50]/20 border-t-[#eadf9f]"
        />

        <span
          aria-hidden="true"
          className="absolute inset-[5px] animate-pulse rounded-lg bg-[#c9ad50]/[0.08]"
        />

        <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-[#c9ad50]/10 text-[12px] font-black text-[#dfcf80]">
          {visual.symbol}
        </span>
      </span>

      <span className="flex items-center text-xs font-bold text-zinc-400">
        {visibleLabel}

        <span
          aria-hidden="true"
          className="ml-1 inline-block animate-pulse tracking-[0.12em]"
        >
          •••
        </span>
      </span>
    </div>
  );
}


export default function GeneralAIChat({
  initialPrompt = "",
  startFresh = false,
}: {
  initialPrompt?: string;
  startFresh?: boolean;
}) {
  const router = useRouter();
  const initialPromptHandledRef = useRef(false);
  const [handoffPrompt, setHandoffPrompt] = useState(initialPrompt);

  const [
    activeStudyRoomId,
    setActiveStudyRoomId,
  ] = useState<number | null>(null);

  const [
    activeMaterialId,
    setActiveMaterialId,
  ] = useState<number | null>(null);

  const [
    activeMaterialName,
    setActiveMaterialName,
  ] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(
      window.location.search
    );

    const roomId = parseGeneralAIRoomId(
      params.get("roomId")
    );

    const materialId =
      parseGeneralAIRoomId(
        params.get("materialId")
      );

    const materialName = (
      params.get("materialName") ?? ""
    ).trim();

    if (roomId !== null) {
      saveProjectRoomId(roomId);
    }

    const timer = window.setTimeout(() => {
      setActiveStudyRoomId(roomId);
      setActiveMaterialId(roomId !== null ? materialId : null);
      setActiveMaterialName(roomId !== null ? materialName : "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const savedPrompt = window.sessionStorage.getItem(
      "studysnap:pending-general-ai-prompt",
    );

    const nextPrompt = initialPrompt.trim() || savedPrompt?.trim() || "";

    if (!nextPrompt) {
      return;
    }

    const timer = window.setTimeout(
      () => setHandoffPrompt(nextPrompt),
      0,
    );

    window.sessionStorage.removeItem("studysnap:pending-general-ai-prompt");

    return () => window.clearTimeout(timer);
  }, [initialPrompt]);

  const [trails, setTrails] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    number | null
  >(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);

  const [input, setInput] = useState("");
  const [trailSearch, setTrailSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [activity, setActivity] =
    useState<AIActivityState | null>(null);

  const [
    activitySteps,
    setActivitySteps,
  ] = useState<AIActivityStep[]>([]);

  const [
    activityStartedAt,
    setActivityStartedAt,
  ] = useState<number | null>(null);

  const [canStopCurrent, setCanStopCurrent] =
    useState(false);
  const [loadingTrails, setLoadingTrails] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [downloadingImageId, setDownloadingImageId] = useState<string | number | null>(null);
  const [downloadedImageId, setDownloadedImageId] = useState<string | number | null>(null);

  const [expandedMessageIds, setExpandedMessageIds] = useState<
    Set<string | number>
  >(() => new Set());

  const [error, setError] = useState("");

  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  const [pendingDocument, setPendingDocument] = useState<File | null>(null);

  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);

  const fileBrainQueue =
    useGeneralAIFileBrainQueue();
  const [
    hiddenFileQueueTaskIds,
    setHiddenFileQueueTaskIds,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  const startFreshQueueHandledRef =
    useRef(false);

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem(
          GENERAL_AI_HIDDEN_FILE_QUEUE_KEY,
        );

      if (!raw) {
        return;
      }

      const parsed =
        JSON.parse(raw) as unknown;

      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(
          GENERAL_AI_HIDDEN_FILE_QUEUE_KEY,
        );
        return;
      }

      const restored =
        new Set(
          parsed.filter(
            (value): value is string =>
              typeof value === "string" &&
              value.trim().length > 0,
          ),
        );

      queueMicrotask(() => {
        setHiddenFileQueueTaskIds(
          restored,
        );
      });
    } catch {
      window.localStorage.removeItem(
        GENERAL_AI_HIDDEN_FILE_QUEUE_KEY,
      );
    }
  }, []);

  useEffect(() => {
    if (!fileBrainQueue.hydrated) {
      return;
    }

    const activeTaskIds =
      new Set(
        fileBrainQueue.tasks.map(
          (task) => task.localId,
        ),
      );

    const timer = window.setTimeout(
      () => {
        setHiddenFileQueueTaskIds(
          (current) => {
            const next =
              new Set(
                [...current].filter(
                  (localId) =>
                    activeTaskIds.has(
                      localId,
                    ),
                ),
              );

            if (
              next.size === current.size &&
              [...next].every(
                (localId) =>
                  current.has(localId),
              )
            ) {
              return current;
            }

            if (next.size === 0) {
              window.localStorage.removeItem(
                GENERAL_AI_HIDDEN_FILE_QUEUE_KEY,
              );
            } else {
              window.localStorage.setItem(
                GENERAL_AI_HIDDEN_FILE_QUEUE_KEY,
                JSON.stringify([...next]),
              );
            }

            return next;
          },
        );
      },
      0,
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    fileBrainQueue.hydrated,
    fileBrainQueue.tasks,
  ]);

  const [roomCreationOffer, setRoomCreationOffer] =
    useState<RoomCreationOffer | null>(null);
  const [availableRooms, setAvailableRooms] = useState<StudyRoom[]>([]);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [documentUploadProgress, setDocumentUploadProgress] = useState(0);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState("");

  const [
    lastGeneratedImage,
    setLastGeneratedImage,
  ] = useState<File | null>(null);

  const [
    lastGeneratedImagePreview,
    setLastGeneratedImagePreview,
  ] = useState("");

  const [
    lastGeneratedImageName,
    setLastGeneratedImageName,
  ] = useState("");

  const [
    identityReferenceImage,
    setIdentityReferenceImage,
  ] = useState<File | null>(null);

  const [
    identityReferencePreview,
    setIdentityReferencePreview,
  ] = useState("");

  const [
    identityReferenceName,
    setIdentityReferenceName,
  ] = useState("");

  const [, setImageUploadProgress] = useState(0);

  const [, setImageUploadStatus] = useState<
    "idle" | "converting" | "reading" | "ready" | "uploading" | "analyzing"
  >("idle");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [studyToolsOpen, setStudyToolsOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);

  const [deleteRequest, setDeleteRequest] =
    useState<AIConversation | null>(null);

  const [deletingTrail, setDeletingTrail] =
    useState(false);

  // MOBILE_DELETE_FEEDBACK_V1
  const [
    deleteNotice,
    setDeleteNotice,
  ] = useState("");

  const deleteNoticeTimerRef =
    useRef<number | null>(
      null
    );

  const [
    bulkDeleteRequest,
    setBulkDeleteRequest,
  ] = useState<AIConversation[]>([]);

  const [, setQueuedFollowUp] =
    useState("");

  const [createImageMode, setCreateImageMode] = useState(false);
  const [imageSize, setImageSize] = useState<GenerateAIImageSize>("1024x1024");

  const [composerDragging, setComposerDragging] =
    useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // GENERAL_AI_PROFESSIONAL_CHAT_SHELL_V8
  const chatScrollRef =
    useRef<HTMLDivElement | null>(null);

  const shouldStickToBottomRef =
    useRef(false);

  const activeRequestRef =
    useRef<AbortController | null>(null);


  const imageRequestRef =
    useRef<AbortController | null>(null);

  const activeImageAssistantIdRef =
    useRef<string | number | null>(null);

  const activeServerRequestIdRef =
    useRef<string | null>(null);

  const queuedFollowUpRef =
    useRef<string | null>(null);

  const activityTimerRef =
    useRef<number | null>(null);

  const activitySessionRef =
    useRef<{
      startedAt: number;
      active: boolean;
    } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceImageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;

  const hasStudyActionTarget =
    findLatestActionTargetMessage(
      messages,
    ) !== null;

  const activeTrail = trails.find((trail) => trail.id === activeConversationId);

  function showDeleteNotice(
    message: string
  ) {
    setDeleteNotice(
      message
    );

    if (
      deleteNoticeTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        deleteNoticeTimerRef.current
      );
    }

    deleteNoticeTimerRef.current =
      window.setTimeout(
        () => {
          setDeleteNotice("");
          deleteNoticeTimerRef.current =
            null;
        },
        2400
      );
  }

  const canSend = useMemo(() => {
    if (createImageMode) {
      return (
        (
          input.trim().length > 0 ||
          selectedImage !== null
        ) &&
        !loading
      );
    }

    return (
      (input.trim().length > 0 ||
        selectedImage !== null ||
        pendingDocument !== null ||
        pendingAttachments.length > 0 ||
        fileBrainQueue.selectedReadyCount > 0) &&
      !loading &&
      !documentUploading
    );
  }, [
    createImageMode,
    input,
    selectedImage,
    pendingDocument,
    pendingAttachments,
    fileBrainQueue.selectedReadyCount,
    loading,
    documentUploading,
  ]);

  function scrollToBottom(
    behavior: ScrollBehavior = "smooth"
  ) {
    const scroller =
      chatScrollRef.current;

    if (!scroller) {
      return;
    }

    window.requestAnimationFrame(() => {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior,
      });
    });
  }

  function resetChatScroll() {
    shouldStickToBottomRef.current =
      false;

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    chatScrollRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }

  function handleChatScroll() {
    const scroller =
      chatScrollRef.current;

    if (!scroller) {
      return;
    }

    const distanceFromBottom =
      scroller.scrollHeight -
      scroller.scrollTop -
      scroller.clientHeight;

    shouldStickToBottomRef.current =
      distanceFromBottom < 140;
  }

  useEffect(() => {
    if (
      (
        messages.length > 0 ||
        loading ||
        loadingMessages
      ) &&
      shouldStickToBottomRef.current
    ) {
      scrollToBottom(
        loadingMessages
          ? "auto"
          : "smooth"
      );
    }
  }, [
    messages,
    loading,
    loadingMessages,
  ]);

  useEffect(() => {
    const previousRestoration =
      window.history.scrollRestoration;

    window.history.scrollRestoration =
      "manual";

    resetChatScroll();

    return () => {
      window.history.scrollRestoration =
        previousRestoration;
    };

    // Initial route positioning is intentionally fixed.
  }, []);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";

    const maxHeight =
      window.matchMedia("(max-width: 640px)").matches
        ? 132
        : 160;

    const height = Math.min(
      Math.max(textarea.scrollHeight, 42),
      maxHeight
    );

    textarea.style.height = `${height}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight
        ? "auto"
        : "hidden";
  }, [input]);

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    function syncViewport() {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;

      root.style.setProperty(
        "--studysnap-visual-viewport-height",
        `${Math.max(320, Math.round(height))}px`
      );

      root.style.setProperty(
        "--studysnap-visual-viewport-offset-top",
        `${Math.max(0, Math.round(offsetTop))}px`
      );
    }

    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);

    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      root.style.removeProperty("--studysnap-visual-viewport-height");
      root.style.removeProperty("--studysnap-visual-viewport-offset-top");
    };
  }, []);


  function clearRememberedConversation() {
    window.sessionStorage.removeItem(
      GENERAL_AI_ACTIVE_CONVERSATION_KEY
    );
  }

  function rememberedConversationId() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const requested = Number(
      params.get("conversationId") ??
      params.get("conversation_id")
    );

    if (
      Number.isInteger(requested) &&
      requested > 0
    ) {
      return requested;
    }

    const remembered = Number(
      window.sessionStorage.getItem(
        GENERAL_AI_ACTIVE_CONVERSATION_KEY
      )
    );

    if (
      Number.isInteger(remembered) &&
      remembered > 0
    ) {
      return remembered;
    }

    return null;
  }

  function trailMaterialId(
    trail: AIConversation
  ) {
    return (
      (
        trail.context_type ===
          "study_material" ||
        trail.context_type ===
          "material"
      ) &&
      typeof trail.context_id ===
        "number"
        ? trail.context_id
        : null
    );
  }

  function rememberActiveTrail(
    trail: AIConversation
  ) {
    const nextRoomId =
      typeof trail.study_room_id ===
        "number"
        ? trail.study_room_id
        : null;

    const nextMaterialId =
      trailMaterialId(trail);

    setActiveConversationId(
      trail.id
    );

    setActiveStudyRoomId(
      nextRoomId
    );

    setActiveMaterialId(
      nextMaterialId
    );

    setActiveMaterialName("");

    if (nextRoomId !== null) {
      saveProjectRoomId(
        nextRoomId
      );
    }

    window.sessionStorage.setItem(
      GENERAL_AI_ACTIVE_CONVERSATION_KEY,
      String(trail.id)
    );

    const baseUrl =
      buildGeneralAIUrl({
        studyRoomId:
          nextRoomId,
        materialId:
          nextMaterialId,
        materialName: "",
      });

    const separator =
      baseUrl.includes("?")
        ? "&"
        : "?";

    window.history.replaceState(
      {},
      "",
      preserveGeneralAIHandoff(
        `${baseUrl}${separator}conversationId=${trail.id}`,
      ),
    );
  }

  function takeMessageActionFocus(
    conversationId: number,
  ): boolean {
    const raw =
      window.sessionStorage.getItem(
        "studysnap:general-ai-message-action-focus",
      );

    if (!raw) {
      return false;
    }

    window.sessionStorage.removeItem(
      "studysnap:general-ai-message-action-focus",
    );

    const requestedId =
      Number(raw);

    return (
      Number.isInteger(
        requestedId,
      )
      && requestedId ===
        conversationId
    );
  }


  function findMessageScrollContainer(
    target: HTMLElement,
  ): HTMLElement | null {
    let current =
      target.parentElement;

    while (current) {
      const style =
        window.getComputedStyle(
          current,
        );

      const canScroll =
        (
          style.overflowY ===
            "auto"
          || style.overflowY ===
            "scroll"
        )
        && current.scrollHeight >
          current.clientHeight;

      if (canScroll) {
        return current;
      }

      current =
        current.parentElement;
    }

    return null;
  }


  function scrollLatestMessageIntoView() {
    const target =
      bottomRef.current;

    if (!target) {
      return;
    }

    const scrollContainer =
      findMessageScrollContainer(
        target,
      );

    if (scrollContainer) {
      scrollContainer.scrollTo({
        top:
          scrollContainer.scrollHeight,
        behavior: "auto",
      });
    }

    target.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }


  function focusLatestMessageAfterRender() {
    const delays = [
      0,
      60,
      150,
      320,
      650,
      1100,
      1700,
    ];

    const timeoutIds =
      delays.map(
        (delay) =>
          window.setTimeout(
            () => {
              window.requestAnimationFrame(
                scrollLatestMessageIntoView,
              );
            },
            delay,
          ),
      );

    const observedNode =
      bottomRef.current
        ?.parentElement
      ?? null;

    let observer:
      ResizeObserver
      | null = null;

    if (
      observedNode
      && typeof ResizeObserver !==
        "undefined"
    ) {
      observer =
        new ResizeObserver(
          () => {
            scrollLatestMessageIntoView();
          },
        );

      observer.observe(
        observedNode,
      );
    }

    window.setTimeout(
      () => {
        timeoutIds.forEach(
          (timeoutId) =>
            window.clearTimeout(
              timeoutId,
            ),
        );

        observer?.disconnect();

        scrollLatestMessageIntoView();

        inputRef.current?.focus({
          preventScroll: true,
        });
      },
      1950,
    );
  }


  async function loadMessages(conversationId: number) {
    try {
      setLoadingMessages(true);
      setError("");

      const storedMessages = await getAIMessages(conversationId);

      const mappedMessages = await Promise.all(
        storedMessages.map(async (message) => {
          let attachmentPreview: string | undefined;

          if (message.attachment?.kind === "image") {
            try {
              attachmentPreview = await getAIAttachmentDataUrl(message.id);
            } catch {
              attachmentPreview = undefined;
            }
          }

          return mapStoredMessage(message, attachmentPreview);
        }),
      );

      const displayMessages =
        collapseStoredFileBrainTurns(
          mappedMessages,
        );

      setMessages(displayMessages);

      if (
        takeMessageActionFocus(
          conversationId,
        )
      ) {
        focusLatestMessageAfterRender();
      }

      const latestGeneratedIndex =
        displayMessages.findLastIndex(
          (message) =>
            message.generatedImage &&
            message.imagePreview
        );

      const latestGenerated =
        latestGeneratedIndex >= 0
          ? displayMessages[
              latestGeneratedIndex
            ]
          : undefined;

      const identityCandidate =
        [
          ...displayMessages.slice(
            0,
            latestGeneratedIndex >= 0
              ? latestGeneratedIndex + 1
              : displayMessages.length,
          ),
        ]
          .reverse()
          .find(
            (message) =>
              message.role === "user" &&
              Boolean(
                message.imagePreview
              )
          );

      if (
        latestGenerated?.imagePreview
      ) {
        try {
          const imageFile =
            await imageSourceToFile(
              latestGenerated.imagePreview,
              latestGenerated.imageName ||
                "studysnap-last-image.png",
            );

          setLastGeneratedImage(
            imageFile
          );

          setLastGeneratedImagePreview(
            latestGenerated.imagePreview
          );

          setLastGeneratedImageName(
            latestGenerated.imageName ||
              imageFile.name
          );
        } catch {
          setLastGeneratedImage(null);
          setLastGeneratedImagePreview("");
          setLastGeneratedImageName("");
        }
      } else {
        setLastGeneratedImage(null);
        setLastGeneratedImagePreview("");
        setLastGeneratedImageName("");
      }

      if (
        identityCandidate?.imagePreview
      ) {
        try {
          const identityFile =
            await imageSourceToFile(
              identityCandidate.imagePreview,
              identityCandidate.imageName ||
                "studysnap-identity-reference.png",
            );

          setIdentityReferenceImage(
            identityFile
          );

          setIdentityReferencePreview(
            identityCandidate.imagePreview
          );

          setIdentityReferenceName(
            identityCandidate.imageName ||
              identityFile.name
          );
        } catch {
          setIdentityReferenceImage(null);
          setIdentityReferencePreview("");
          setIdentityReferenceName("");
        }
      } else {
        setIdentityReferenceImage(null);
        setIdentityReferencePreview("");
        setIdentityReferenceName("");
      }
    } catch (err) {
      setMessages([]);
      setError(
        err instanceof Error ? err.message : "Could not load this chat.",
      );
    } finally {
      setLoadingMessages(false);
    }
  }

  async function refreshTrails(preferredConversationId?: number) {
    const list = await getStudyTrails("general_ai", "", 100);

    setTrails(list);

    if (
      typeof preferredConversationId ===
        "number"
    ) {
      const preferredTrail =
        list.find(
          (trail) =>
            trail.id ===
            preferredConversationId
        );

      if (preferredTrail) {
        rememberActiveTrail(
          preferredTrail
        );
      }
    }

    return list;
  }


  async function handleMessageActionComplete(
    result: AIMessageActionResponse,
  ) {
    const destination =
      result.conversation;

    const staysInCurrentChat =
      result.action === "regenerate";

    if (
      staysInCurrentChat
      && destination.id !==
        activeConversationId
    ) {
      throw new Error(
        "Regenerate returned a different chat. Nothing was changed."
      );
    }

    if (
      !staysInCurrentChat
      && destination.id ===
        activeConversationId
    ) {
      throw new Error(
        "StudySnap could not create a separate branch."
      );
    }

    window.sessionStorage.setItem(
      "studysnap:general-ai-message-action-focus",
      String(destination.id),
    );

    setTrails((current) => [
      destination,
      ...current.filter(
        (trail) =>
          trail.id !==
          destination.id
      ),
    ]);

    rememberActiveTrail(
      destination
    );

    await loadMessages(
      destination.id
    );

    await refreshTrails(
      destination.id
    );

    if (
      result.action === "branch"
    ) {
      showDeleteNotice(
        "🌿 Branch created."
      );

      return;
    }

    if (
      result.action === "regenerate"
    ) {
      showDeleteNotice(
        "↻ New answer ready."
      );

      return;
    }

    showDeleteNotice(
      "New branch ready."
    );
  }

  useEffect(() => {
    queueMicrotask(() => {
      setHistoryOpen(false);
      setStudyToolsOpen(false);
      setAiToolsOpen(false);
    });

    window.localStorage.setItem(
      "studysnap:general-ai-history-drawer-v2",
      "false",
    );

    window.localStorage.removeItem(
      "studysnap:general-ai-study-tools-open",
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setLoadingTrails(true);
        setError("");

        const list = await getStudyTrails("general_ai", "", 100);

        if (cancelled) return;

        setTrails(list);

        if (
          !startFresh &&
          list.length > 0
        ) {
          const rememberedId =
            rememberedConversationId();

          const preferredTrail =
            (
              rememberedId !== null
                ? list.find(
                    (trail) =>
                      trail.id ===
                      rememberedId
                  )
                : undefined
            ) ||
            list[0];

          rememberActiveTrail(
            preferredTrail
          );

          await loadMessages(
            preferredTrail.id
          );
        } else {
          clearRememberedConversation();
          setActiveConversationId(null);
          setMessages([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load your chats.",
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
  // A unique Dashboard handoff key remounts this tree.
  // Initialization runs once for each mounted handoff.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!startFresh) {
      startFreshQueueHandledRef.current =
        false;
      return;
    }

    if (
      !fileBrainQueue.hydrated ||
      startFreshQueueHandledRef.current
    ) {
      return;
    }

    startFreshQueueHandledRef.current =
      true;

    hideFileQueueForNewConversation();

    // The reset helper intentionally reads
    // the latest queue snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startFresh,
    fileBrainQueue.hydrated,
    fileBrainQueue.tasks,
  ]);

  useEffect(() => {
    if (!aiToolsOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function closeOnEscape(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        setAiToolsOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      closeOnEscape
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        closeOnEscape
      );
    };
  }, [aiToolsOpen]);

  useEffect(() => {
    const savedDraft =
      window.localStorage.getItem(
        GENERAL_AI_DRAFT_KEY
      );

    if (savedDraft) {
      queueMicrotask(() => {
        setInput((current) =>
          current.trim()
            ? current
            : savedDraft
        );
      });
    }

    // Saved responsive General AI draft
  }, []);

  useEffect(() => {
    if (input) {
      window.localStorage.setItem(
        GENERAL_AI_DRAFT_KEY,
        input
      );
    } else {
      window.localStorage.removeItem(
        GENERAL_AI_DRAFT_KEY
      );
    }
  }, [input]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const nextMessage =
      queuedFollowUpRef.current;

    if (!nextMessage) {
      return;
    }

    queuedFollowUpRef.current =
      null;

    setQueuedFollowUp("");

    void sendMessage(
      nextMessage
    );

    // Release the queued follow-up only when loading completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConversationId]);

  useEffect(() => {
    if (!fileBrainQueue.hydrated) {
      return;
    }

    const previouslyAskedTaskIds =
      fileBrainQueue.tasks
        .filter(
          (task) =>
            (
              task.message
              ?? ""
            ).trim() ===
              "Ready for another question.",
        )
        .map(
          (task) =>
            task.localId,
        );

    hideFileBrainTaskIds(
      previouslyAskedTaskIds,
    );

    // The helper is a stable function declaration and
    // reads only the task IDs supplied above.

  }, [
    fileBrainQueue.hydrated,
    fileBrainQueue.tasks,
  ]);


  useEffect(() => {
    const pendingFiles = takePendingAIAttachments();

    if (!pendingFiles.length) {
      return;
    }

    void fileBrainQueue
      .addFiles(
        pendingFiles.slice(0, 100)
      )
      .catch(() =>
        addAttachments(
          pendingFiles.slice(0, 10)
        )
      );

    consumeGeneralAIStartupUrl();

    // Pending attachment handoff is intentionally consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    consumeGeneralAIStartupUrl();

    void sendMessage(prompt);

    // Consume the initial handoff only after trails finish loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffPrompt, loading, loadingTrails]);

  function attachmentId(file: File) {
    return [
      file.name,
      file.size,
      file.lastModified,
      Math.random().toString(16).slice(2),
    ].join("-");
  }

  function isImageAttachment(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

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
      const extension = file.name.split(".").pop()?.toLowerCase() || "";

      const image = isImageAttachment(file);

      if (!image && !supportedDocuments.has(extension)) {
        rejected.push(file.name);
        continue;
      }

      const limit = image ? 25 * 1024 * 1024 : 25 * 1024 * 1024;

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
        preview: image ? URL.createObjectURL(file) : undefined,
        status: "ready",
        progress: 0,
      });
    }

    setPendingAttachments((current) => {
      const remainingSlots = Math.max(0, 20 - current.length);

      return [...current, ...prepared.slice(0, remainingSlots)];
    });

    if (rejected.length) {
      setError(
        `Skipped ${rejected.length} unsupported or oversized file${
          rejected.length === 1 ? "" : "s"
        }.`,
      );
    }

    inputRef.current?.focus();
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((current) => {
      const removed = current.find((item) => item.id === id);

      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }

      return current.filter((item) => item.id !== id);
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
    const files =
      Array.from(
        fileList ?? []
      );

    if (!files.length) {
      return;
    }

    try {
      await addComposerFiles(
        files
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value =
          "";
      }

      inputRef.current?.focus();
    }
  }

  async function handleImageChange(selectedFile: File | undefined) {
    if (!selectedFile) {
      return;
    }

    setError("");
    setImageUploadProgress(0);

    const originalExtension =
      selectedFile.name.split(".").pop()?.toLowerCase() || "";

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
        "Please choose a PNG, JPG, JPEG, WEBP, GIF, HEIC, or HEIF image.",
      );
      return;
    }

    // Allow a larger HEIC source because JPEG conversion often reduces it.
    const maximumSourceSize = isHeic ? 25 * 1024 * 1024 : 8 * 1024 * 1024;

    if (selectedFile.size > maximumSourceSize) {
      setError(
        isHeic
          ? "This HEIC image is too large. Please choose one smaller than 25 MB."
          : "This image is too large. Please choose one smaller than 8 MB.",
      );
      return;
    }

    let file = selectedFile;

    try {
      if (isHeic) {
        setImageUploadStatus("converting");
        setImageUploadProgress(15);

        const heicModule = await import("heic2any");

        const heic2any = heicModule.default;

        const convertedResult = await heic2any({
          blob: selectedFile,
          toType: "image/jpeg",
          quality: 0.88,
        });

        const convertedBlob = Array.isArray(convertedResult)
          ? convertedResult[0]
          : convertedResult;

        const jpegName =
          selectedFile.name.replace(/\.(heic|heif)$/i, "") + ".jpg";

        file = new File([convertedBlob], jpegName, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });

        setImageUploadProgress(45);
      }

      if (file.size > 8 * 1024 * 1024) {
        setImageUploadStatus("idle");
        setImageUploadProgress(0);
        setError(
          "The prepared image is still larger than 8 MB. Please choose a smaller image.",
        );
        return;
      }

      setCreateImageMode(false);
      setSelectedImage(file);
      setSelectedImagePreview("");
      setImageUploadStatus("reading");
      setImageUploadProgress(isHeic ? 50 : 0);

      const reader = new FileReader();

      reader.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const readPercent = (event.loaded / event.total) * 100;

        const progress = isHeic
          ? Math.round(50 + readPercent * 0.5)
          : Math.round(readPercent);

        setImageUploadProgress(progress);
      };

      reader.onload = () => {
        setSelectedImagePreview(String(reader.result || ""));
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
          "StudySnap could not prepare this image. Please try another image.",
        );
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.warn(
        "Browser HEIC conversion failed; using backend fallback:",
        error,
      );

      if (!isHeic) {
        setSelectedImage(null);
        setSelectedImagePreview("");
        setImageUploadProgress(0);
        setImageUploadStatus("idle");
        setError(
          "StudySnap could not prepare this image. Please try another image.",
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained for single-file input compatibility.
  async function handleAttachmentChange(selectedFile: File | undefined) {
    if (!selectedFile) {
      return;
    }

    const extension = selectedFile.name.split(".").pop()?.toLowerCase() || "";

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
      selectedFile.type.startsWith("image/") || imageExtensions.has(extension);

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
        "Use PDF, DOCX, PPTX, XLSX, text, code, CSV, JSON, or an image.",
      );
      return;
    }

    if (selectedFile.size > 25 * 1024 * 1024) {
      setError("Direct AI reading supports files up to 25MB.");
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained for the explicit save-to-room action.
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
          : "StudySnap could not load your rooms.",
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
          : "The document could not be saved to the room.",
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

    if (
      referenceImageInputRef.current
    ) {
      referenceImageInputRef.current.value =
        "";
    }
  }

  function clearLastGeneratedImage() {
    setLastGeneratedImage(null);
    setLastGeneratedImagePreview("");
    setLastGeneratedImageName("");

    setIdentityReferenceImage(null);
    setIdentityReferencePreview("");
    setIdentityReferenceName("");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained for the composer reset action.
  function clearComposer() {
    setInput("");
    removeSelectedImage();
    removeSelectedDocument();
    clearPendingAttachments();
    setError("");
    inputRef.current?.focus();
  }

  function startActivitySession() {
    clearActivityTimer();

    const startedAt = Date.now();

    activitySessionRef.current = {
      startedAt,
      active: true,
    };

    setActivityStartedAt(startedAt);
    setActivitySteps([]);
  }

  function recordActivity(
    nextActivity: AIActivityState,
  ) {
    clearActivityTimer();

    if (
      !activitySessionRef.current ||
      !activitySessionRef.current.active
    ) {
      startActivitySession();
    }

    const now = Date.now();

    setActivity(nextActivity);

    setActivitySteps((current) => {
      const previous =
        current[current.length - 1];

      if (
        previous &&
        previous.label ===
          nextActivity.label &&
        previous.detail ===
          nextActivity.detail
      ) {
        return current.map(
          (step, index) =>
            index === current.length - 1
              ? {
                  ...step,
                  progress:
                    nextActivity.progress,
                }
              : step
        );
      }

      const completed =
        current.map(
          (step, index) =>
            index === current.length - 1 &&
            step.status === "active"
              ? {
                  ...step,
                  status:
                    "complete" as const,
                  completedAt: now,
                }
              : step
        );

      return [
        ...completed,
        {
          id:
            `${now}-`
            + Math.random()
              .toString(36)
              .slice(2, 8),
          label:
            nextActivity.label,
          detail:
            nextActivity.detail,
          progress:
            nextActivity.progress,
          startedAt: now,
          status: "active",
        },
      ];
    });
  }

  function completeActivitySession() {
    const now = Date.now();

    if (activitySessionRef.current) {
      activitySessionRef.current = {
        ...activitySessionRef.current,
        active: false,
      };
    }

    setActivitySteps((current) =>
      current.map(
        (step, index) => {
          if (
            index !==
              current.length - 1 ||
            step.status !== "active"
          ) {
            return step;
          }

          const normalized =
            step.label.toLowerCase();

          const status =
            normalized.includes("stop") ||
            normalized.includes("cancel")
              ? "stopped"
              : normalized.includes("fail") ||
                  normalized.includes("error")
                ? "failed"
                : "complete";

          return {
            ...step,
            status,
            completedAt: now,
          };
        }
      )
    );
  }

  function clearActivityTimer() {
    if (
      activityTimerRef.current !== null
    ) {
      window.clearTimeout(
        activityTimerRef.current
      );

      activityTimerRef.current = null;
    }
  }

  function clearActivityAfter(
    delay = 1000,
  ) {
    clearActivityTimer();
    completeActivitySession();

    activityTimerRef.current =
      window.setTimeout(() => {
        setActivity(null);
        setActivityStartedAt(null);
        activitySessionRef.current = null;
        activityTimerRef.current = null;
      }, delay);
  }

  function stopCurrentResponse() {
    if (imageRequestRef.current) {
      const assistantId =
        activeImageAssistantIdRef.current;

      imageRequestRef.current.abort();
      imageRequestRef.current = null;
      activeImageAssistantIdRef.current =
        null;

      setCanStopCurrent(false);

      if (assistantId !== null) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content:
                    "Image generation stopped.",
                }
              : message
          )
        );
      }

      recordActivity({
        label: "Image stopped",
        detail:
          "The current image request was stopped.",
      });

      clearActivityAfter(1800);
      inputRef.current?.focus();

      return;
    }

    if (!canStopCurrent) {
      return;
    }

    const serverRequestId =
      activeServerRequestIdRef.current;

    activeServerRequestIdRef.current =
      null;

    if (serverRequestId) {
      void cancelAIMessage(
        serverRequestId
      ).catch(() => {
        // Browser abort still runs below.
      });
    }

    activeRequestRef.current?.abort();
    activeRequestRef.current = null;

    setCanStopCurrent(false);

    recordActivity({
      label: "Response stopped",
      detail:
        "Your partial answer and typed "
        + "details were kept. Press Send "
        + "to continue.",
    });

    clearActivityAfter(1800);

    inputRef.current?.focus();
  }

  function queueFollowUpAndStop() {
    const nextMessage =
      input.trim();

    if (
      !loading ||
      !canStopCurrent ||
      !nextMessage ||
      createImageMode
    ) {
      return false;
    }

    queuedFollowUpRef.current =
      nextMessage;

    setQueuedFollowUp(
      nextMessage
    );

    setInput("");

    stopCurrentResponse();

    clearActivityTimer();

    recordActivity({
      label: "Follow-up queued",
      detail:
        "Stopping the current response, then sending your update.",
    });

    return true;
  }

  async function ensureConversation() {
    const activeTrailContext =
      activeTrail as
        | (AIConversation & {
            study_room_id?: number | null;
            context_type?: string | null;
            context_id?: number | null;
          })
        | undefined;

    const conversationMatchesContext =
      activeStudyRoomId === null
        ? (
            activeTrailContext?.study_room_id == null
          )
        : activeMaterialId !== null
          ? (
              activeTrailContext?.study_room_id ===
                activeStudyRoomId &&
              activeTrailContext?.context_type ===
                "study_material" &&
              activeTrailContext?.context_id ===
                activeMaterialId
            )
          : (
              activeTrailContext?.study_room_id ===
                activeStudyRoomId &&
              activeTrailContext?.context_type !==
                "study_material"
            );

    if (
      activeConversationId !== null &&
      conversationMatchesContext
    ) {
      return activeConversationId;
    }

    const conversation = await createAIConversation({
      studyRoomId: activeStudyRoomId,
      title:
        activeMaterialId !== null
          ? `Study ${
              activeMaterialName ||
              "selected material"
            }`
          : activeStudyRoomId !== null
            ? "Room Study Trail"
            : "New Conversation",
      mode: "general",
      surface: "general_ai",
      contextType:
        activeMaterialId !== null
          ? "study_material"
          : activeStudyRoomId !== null
            ? "study_room"
            : "general",
      contextId:
        activeMaterialId ??
        activeStudyRoomId,
      forceNew: true,
    });

    setTrails((current) => [
      conversation,
      ...current.filter(
        (trail) =>
          trail.id !== conversation.id
      ),
    ]);

    rememberActiveTrail(
      conversation
    );

    return conversation.id;
  }


  async function createPdfFromImage(
    command: string,
    imageFile: File,
  ) {
    if (
      loading ||
      !command.trim()
    ) {
      return;
    }

    const pendingUserId =
      makeId();

    const pendingAssistantId =
      makeId();

    shouldStickToBottomRef.current =
      true;

    try {
      setLoading(true);
      setCanStopCurrent(false);
      setCreateImageMode(false);
      setError("");
      setInput("");

      startActivitySession();

      recordActivity({
        label: "Creating PDF",
        detail:
          "StudySnap is placing the image "
          + "into a verified PDF.",
        progress: 25,
      });

      const conversationId =
        await ensureConversation();

      setMessages((current) => [
        ...current,
        {
          id: pendingUserId,
          role: "user",
          content: command,
          imagePreview:
            lastGeneratedImagePreview ||
            selectedImagePreview ||
            undefined,
          imageName:
            imageFile.name,
        },
        {
          id: pendingAssistantId,
          role: "assistant",
          content:
            "StudySnap is creating the PDF...",
        },
      ]);

      const cleanName =
        (
          lastGeneratedImageName ||
          imageFile.name ||
          "StudySnap Image"
        )
          .replace(
            /\.[^.]+$/,
            ""
          )
          .trim();

      await createImagePdfArtifact(
        imageFile,
        {
          conversationId,
          command,
          title:
            cleanName ||
            "StudySnap Image",
        }
      );

      recordActivity({
        label: "PDF ready",
        detail:
          "The PDF passed storage "
          + "and file verification.",
        progress: 100,
      });

      await loadMessages(
        conversationId
      );

      await refreshTrails(
        conversationId
      );

      if (
        selectedImage ===
        imageFile
      ) {
        removeSelectedImage();
      }

      setPendingAttachments(
        (current) =>
          current.filter(
            (attachment) =>
              attachment.file !==
              imageFile
          )
      );

      scrollToBottom();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (
              "StudySnap could not "
              + "create the image PDF."
            );

      setMessages((current) =>
        current.filter(
          (item) =>
            item.id !==
              pendingUserId &&
            item.id !==
              pendingAssistantId
        )
      );

      setInput(command);
      setError(message);

      recordActivity({
        label: "PDF failed",
        detail: message,
      });
    } finally {
      clearActivityAfter();
      setLoading(false);
      inputRef.current?.focus();
    }
  }


  async function createGeneratedImage(
    promptText?: string,
    forceNew = false,
    allowPreviousReference = false,
  ) {
    const pendingImageReference =
      pendingAttachments.find(
        (attachment) =>
          attachment.kind === "image"
      );

    const explicitReference =
      forceNew
        ? null
        : selectedImage;

    const queuedReference =
      forceNew || explicitReference
        ? null
        : pendingImageReference?.file ||
          null;

    const previousReference =
      forceNew ||
      explicitReference ||
      queuedReference ||
      !allowPreviousReference
        ? null
        : lastGeneratedImage;

    const referenceImage =
      explicitReference ||
      queuedReference ||
      previousReference;

    const newIdentityReference =
      forceNew
        ? null
        : (
            explicitReference ||
            queuedReference
          );

    const identityImageForRequest =
      newIdentityReference ||
      (
        forceNew
          ? null
          : identityReferenceImage
      );

    const referencePreview =
      explicitReference
        ? selectedImagePreview
        : queuedReference
          ? pendingImageReference?.preview || ""
          : "";

    const referenceName =
      explicitReference
        ? selectedImage?.name || "Attached image"
        : queuedReference
          ? pendingImageReference?.name || "Attached image"
          : "";

    const identityPreviewForState =
      explicitReference
        ? selectedImagePreview
        : queuedReference
          ? pendingImageReference?.preview ||
            ""
          : identityReferencePreview;

    const identityNameForState =
      newIdentityReference?.name ||
      identityReferenceName ||
      "studysnap-identity-reference.png";

    const typedPrompt = (
      promptText ?? input
    ).trim();

    const prompt =
      typedPrompt ||
      (
        referenceImage
          ? (
              "Improve this image while "
              + "preserving the person's "
              + "exact recognizable identity."
            )
          : ""
      );

    if (!prompt || loading) {
      return;
    }

    const userMessageId =
      makeId();

    const assistantMessageId =
      makeId();

    shouldStickToBottomRef.current =
      true;

    const imageController =
      new AbortController();

    imageRequestRef.current?.abort();
    imageRequestRef.current =
      imageController;

    activeImageAssistantIdRef.current =
      assistantMessageId;

    try {
      setLoading(true);
      setCanStopCurrent(true);
      setError("");
      setInput("");

      startActivitySession();

      recordActivity({
        label: referenceImage
          ? "Editing image"
          : "Creating image",
        detail: referenceImage
          ? (
              "Applying your change to the attached image."
            )
          : "Generating a new image.",
        progress: 20,
      });

      const conversationId =
        await ensureConversation();

      setMessages((current) => [
        ...current,
        {
          id: userMessageId,
          role: "user",
          content: referenceImage
            ? `Edit image: ${prompt}`
            : `Create an image: ${prompt}`,
          imagePreview:
            explicitReference ||
            queuedReference
              ? referencePreview ||
                undefined
              : undefined,
          imageName:
            explicitReference ||
            queuedReference
              ? referenceName
              : undefined,
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: referenceImage
            ? (
                "StudySnap is editing the attached image..."
              )
            : (
                "StudySnap is creating "
                + "the image..."
              ),
        },
      ]);

      scrollToBottom();

      recordActivity({
        label: referenceImage
          ? "High-fidelity edit"
          : "Creating image",
        detail:
          "Preparing the finished result.",
        progress: 65,
      });

      const result = referenceImage
        ? await editAIImage(
            (
              prompt
              + "\n\nEdit the attached image only. "
              + "Keep its original subject, layout, text, labels, "
              + "and spelling unchanged unless the user explicitly "
              + "asks to change them. Improve only the requested "
              + "visual qualities. Do not invent labels or replace "
              + "the image with a different diagram."
            ),
            referenceImage,
            {
              conversationId,
              size: imageSize,
              quality: "high",
              signal: imageController.signal,
              identityImage:
                identityImageForRequest &&
                identityImageForRequest !==
                  referenceImage
                  ? identityImageForRequest
                  : null,
            }
          )
        : await generateAIImage(
            prompt,
            {
              conversationId,
              size: imageSize,
              quality: "medium",
              signal: imageController.signal,
              contextMessages:
                buildRecentImageContext(
                  messages
                ),
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

      const generatedFile =
        await imageSourceToFile(
          imageSource,
          `studysnap-image-${Date.now()}.png`,
        );

      setLastGeneratedImage(
        generatedFile
      );

      setLastGeneratedImagePreview(
        imageSource
      );

      setLastGeneratedImageName(
        generatedFile.name
      );

      if (forceNew) {
        setIdentityReferenceImage(null);
        setIdentityReferencePreview("");
        setIdentityReferenceName("");
      }

      if (
        newIdentityReference
      ) {
        setIdentityReferenceImage(
          newIdentityReference
        );

        setIdentityReferencePreview(
          identityPreviewForState
        );

        setIdentityReferenceName(
          identityNameForState
        );
      }

      removeSelectedImage();

      if (pendingImageReference) {
        setPendingAttachments(
          (current) =>
            current.filter(
              (attachment) =>
                attachment.id !==
                pendingImageReference.id
            )
        );
      }

      setCreateImageMode(false);

      recordActivity({
        label: "Image ready",
        detail:
          newIdentityReference ||
          identityImageForRequest
            ? (
                "The image and its identity "
                + "reference are ready for "
                + "your next edit."
              )
            : "The image is ready.",
        progress: 100,
      });

      await loadMessages(
        conversationId
      );

      if (
        newIdentityReference
      ) {
        setIdentityReferenceImage(
          newIdentityReference
        );

        setIdentityReferencePreview(
          identityPreviewForState
        );

        setIdentityReferenceName(
          identityNameForState
        );
      }

      await refreshTrails(
        conversationId
      );

      scrollToBottom();
    } catch (err) {
      const requestWasStopped =
        (
          err instanceof DOMException &&
          err.name === "AbortError"
        ) ||
        (
          err instanceof Error &&
          err.name === "AbortError"
        );

      if (requestWasStopped) {
        setMessages((current) =>
          current.map((message) =>
            message.id ===
            assistantMessageId
              ? {
                  ...message,
                  content:
                    "Image generation stopped.",
                }
              : message
          )
        );

        recordActivity({
          label: "Image stopped",
          detail:
            "The current image request was stopped.",
        });

        clearActivityAfter(1800);

        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : (
              "StudySnap could not "
              + "complete the image request."
            );

      setMessages((current) =>
        current.filter(
          (item) =>
            item.id !== userMessageId &&
            item.id !== assistantMessageId
        )
      );

      setInput(
        typedPrompt
      );

      setError(message);
    } finally {
      if (
        imageRequestRef.current ===
        imageController
      ) {
        imageRequestRef.current = null;
      }

      if (
        activeImageAssistantIdRef.current ===
        assistantMessageId
      ) {
        activeImageAssistantIdRef.current =
          null;
      }

      setCanStopCurrent(false);

      clearActivityAfter();
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function sendMessage(messageText?: string) {
    const question = (messageText ?? input).trim();

    const useLastGeneratedImage =
      selectedImage === null &&
      lastGeneratedImage !== null &&
      asksAboutExistingImage(
        question
      );

    const imageToSend =
      selectedImage ||
      (
        useLastGeneratedImage
          ? lastGeneratedImage
          : null
      );

    const imagePreviewToSend =
      selectedImage
        ? selectedImagePreview
        : useLastGeneratedImage
          ? lastGeneratedImagePreview
          : "";

    const imageNameToSend =
      selectedImage?.name ||
      (
        useLastGeneratedImage
          ? lastGeneratedImageName
          : undefined
      );

    const documentToSend = pendingDocument;
    const attachmentsToSend = pendingAttachments;

    const fileBrainItemsToSend =
      imageToSend || documentToSend
        ? []
        : fileBrainQueue.selectedReadyItems
            .slice(0, 10);

    if (
      (!question &&
        !imageToSend &&
        !documentToSend &&
        attachmentsToSend.length === 0 &&
        fileBrainItemsToSend.length === 0) ||
      loading ||
      documentUploading
    ) {
      return;
    }

    const finalQuestion =
      question ||
      (
        fileBrainItemsToSend.length > 1
          ? "Explain these uploaded files clearly and connect the important points."
          : fileBrainItemsToSend.length === 1
            ? "Summarize this uploaded file clearly."
            : attachmentsToSend.length > 1
              ? "Explain these files clearly and connect the important points."
              : attachmentsToSend.length === 1
                ? attachmentsToSend[0].kind === "image"
                  ? "Describe this image clearly."
                  : "Summarize this file clearly."
                : documentToSend
                  ? "Summarize this file clearly."
                  : "Describe this image clearly."
      );

    const fileBrainDisplayAttachments =
      buildFileBrainDisplayAttachments(
        fileBrainItemsToSend
      );

    const actionIntent =
      !imageToSend &&
      !documentToSend &&
      attachmentsToSend.length === 0 &&
      fileBrainItemsToSend.length === 0
        ? detectGeneralAIActionIntent(
            question
          )
        : null;

    if (actionIntent) {
      const targetMessage =
        findLatestActionTargetMessage(
          messages
        );

      if (!targetMessage) {
        setError(
          "Ask StudySnap to explain or create something first, then save that answer."
        );

        inputRef.current?.focus();
        return;
      }

      setInput("");
      setError("");
      updateStudyToolsOpen(false);
      setAiToolsOpen(false);

      window.dispatchEvent(
        new CustomEvent(
          "studysnap:open-study-actions",
          {
            detail: {
              messageId:
                targetMessage.id,
              actionType:
                actionIntent.actionType,
              roomHint:
                actionIntent.roomHint,
              plannerDraft:
                actionIntent.plannerDraft,
            },
          }
        )
      );

      return;
    }

    if (
      !imageToSend &&
      !documentToSend &&
      question &&
      shouldResolveAsStudyCommand(
        question
      )
    ) {
      const commandResult =
        await resolveStudyCommand(
          question
        );

      if (commandResult.handled) {
        setInput("");
        setError("");

        router.push(
          commandResult.href
        );

        return;
      }
    }

    const currentInformationRequested =
      asksForCurrentInformation(
        finalQuestion
      );

    shouldStickToBottomRef.current =
      true;

    setLoading(true);
    setError("");
    setInput("");

    startActivitySession();

    recordActivity({
      label: currentInformationRequested
        ? "Checking information needs"
        : "Preparing your request",
      detail: currentInformationRequested
        ? "StudySnap is deciding whether current information is required."
        : "Connecting to StudySnap AI.",
    });

    if (
      attachmentsToSend.length > 0 ||
      fileBrainItemsToSend.length > 0
    ) {
      setRoomCreationOffer(null);
    }

    // Keep an attached image visible until the request succeeds.
    if (!imageToSend && !documentToSend) {
      removeSelectedImage();
    }

    const pendingAssistantId = makeId();
    let streamedAnswer = "";

    try {
      const conversationId = await ensureConversation();

      setTrails((current) =>
        current.map((trail) =>
          trail.id === conversationId
            ? {
                ...trail,
                title: finalQuestion.slice(0, 60) || "New Conversation",
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
          imagePreview: imagePreviewToSend || undefined,
          imageName: imageNameToSend,
          documentName: documentToSend?.name,
          documentSize: documentToSend?.size,
          attachments:
            fileBrainDisplayAttachments.length > 0
              ? fileBrainDisplayAttachments
              : attachmentsToSend.length > 0
                ? attachmentsToSend.map((attachment) => ({
                    id: attachment.id,
                    name: attachment.name,
                    size: attachment.size,
                    kind: attachment.kind,
                    preview: attachment.preview,
                  }))
                : undefined,
        },
        {
          id: pendingAssistantId,
          role: "assistant",
          content:
            fileBrainItemsToSend.length > 0
              ? `StudySnap AI is reading ${fileBrainItemsToSend.length} securely uploaded file${
                  fileBrainItemsToSend.length === 1 ? "" : "s"
                }...`
              : attachmentsToSend.length > 0
                ? `StudySnap AI is reading ${attachmentsToSend.length} file${
                  attachmentsToSend.length === 1 ? "" : "s"
                }...`
              : imageToSend
                ? "StudySnap AI is reading the image..."
                : documentToSend
                  ? "StudySnap AI is reading the file..."
                  : "StudySnap AI is thinking...",
        },
      ]);

      scrollToBottom();

      const requestController =
        new AbortController();

      activeRequestRef.current =
        requestController;

      setCanStopCurrent(true);

      if (fileBrainItemsToSend.length > 0) {
        recordActivity({
          label: "Reading files",
          detail:
            `StudySnap is reading ${fileBrainItemsToSend.length} completed File Brain item${fileBrainItemsToSend.length === 1 ? "" : "s"} without uploading them again.`,
          progress: 100,
        });

        const data =
          await fileBrainQueue.askItems(
            fileBrainItemsToSend,
            {
              question:
                finalQuestion,
              conversationId,
              signal:
                requestController.signal,
            }
          );

        const answer =
          extractAIText(data);

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

        fileBrainQueue.markAsked(
          fileBrainItemsToSend.map(
            (task) => task.itemId
          )
        );

        hideFileBrainTaskIds(
          fileBrainItemsToSend.map(
            (task) =>
              task.localId,
          ),
        );
      } else if (attachmentsToSend.length > 0) {
        setPendingAttachments((current) =>
          current.map((attachment) =>
            attachmentsToSend.some((selected) => selected.id === attachment.id)
              ? {
                  ...attachment,
                  status: "uploading",
                  progress: 5,
                }
              : attachment,
          ),
        );

        const data = await askAiWithFiles({
          question: finalQuestion,
          files: attachmentsToSend.map((attachment) => attachment.file),
          conversationId,
          signal: requestController.signal,
          onProgress: (percent) => {
            recordActivity({
              label:
                percent >= 100
                  ? "Reading files"
                  : "Uploading files",
              detail:
                percent >= 100
                  ? "Upload complete. StudySnap is reading the material."
                  : `Uploading ${attachmentsToSend.length} file${
                      attachmentsToSend.length === 1
                        ? ""
                        : "s"
                    }.`,
              progress: percent,
            });

            setPendingAttachments((current) =>
              current.map((attachment) =>
                attachmentsToSend.some(
                  (selected) => selected.id === attachment.id,
                )
                  ? {
                      ...attachment,
                      status: percent >= 100 ? "reading" : "uploading",
                      progress: percent,
                    }
                  : attachment,
              ),
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
              : message,
          ),
        );

        setRoomCreationOffer({
          files: attachmentsToSend.map((attachment) => attachment.file),
          fileNames: attachmentsToSend.map((attachment) => attachment.name),
          status: "ready",
        });

        clearPendingAttachments();
      } else if (documentToSend) {
        recordActivity({
          label: "Uploading file",
          detail:
            "StudySnap is securely uploading your document.",
          progress: 35,
        });

        setDocumentUploading(true);
        setDocumentUploadProgress(35);

        const progressTimer = window.setTimeout(() => {
          setDocumentUploadProgress(75);
        }, 700);

        let data;

        try {
          data = await askAiWithFile(
            finalQuestion,
            documentToSend,
            {
              conversationId,
              signal:
                requestController.signal,
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
              : message,
          ),
        );
      } else if (imageToSend) {
        recordActivity({
          label: "Reading image",
          detail:
            "StudySnap is uploading and examining the image.",
          progress: 35,
        });

        setImageUploadStatus("uploading");
        setImageUploadProgress(35);

        const analyzingTimer = window.setTimeout(() => {
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
              signal:
                requestController.signal,
            }
          );
        } finally {
          window.clearTimeout(analyzingTimer);
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
              : message,
          ),
        );
      } else {
        recordActivity({
          label: currentInformationRequested
            ? "Checking information needs"
            : "Thinking",
          detail: currentInformationRequested
            ? "StudySnap is preparing an answer that may require current information."
            : "StudySnap is preparing a clear answer.",
        });

        let firstTokenReceived = false;

        const serverRequestId =
          makeAIRequestId();

        activeServerRequestIdRef.current =
          serverRequestId;

        await streamAIMessage(
          conversationId,
          finalQuestion,
          "explain",
          (token) => {
            if (!firstTokenReceived) {
              firstTokenReceived = true;

              recordActivity({
                label: "Writing answer",
                detail:
                  "StudySnap is responding. You can keep typing below.",
              });
            }

            streamedAnswer += token;

            setMessages((current) =>
              current.map((message) =>
                message.id ===
                pendingAssistantId
                  ? {
                      ...message,
                      content:
                        streamedAnswer,
                    }
                  : message
              )
            );

            scrollToBottom();
          },
          "",
          {
            requestId: serverRequestId,
            signal: requestController.signal,
            onConnected: () => {
              recordActivity({
                label: currentInformationRequested
                  ? "Checking information needs"
                  : "Thinking",
                detail:
                  "Connected to StudySnap AI. Preparing the response.",
              });
            },
          }
        );

        await loadMessages(
          conversationId
        );

        if (!streamedAnswer) {
          setMessages((current) =>
            current.map((message) =>
              message.id ===
              pendingAssistantId
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

      if (
        detectArtifactExportTarget(
          finalQuestion
        ) !== null
      ) {
        await loadMessages(
          conversationId
        );
      }

      if (imageToSend) {
        removeSelectedImage();
      }

      if (documentToSend) {
        removeSelectedDocument();
      }
    } catch (err) {
      const errorName =
        err instanceof Error
          ? err.name
          : "";

      const errorMessage =
        err instanceof Error
          ? err.message
          : "";

      if (
        errorName === "AbortError" ||
        /cancelled|canceled/i.test(
          errorMessage
        )
      ) {
        setMessages((current) =>
          current.map((item) =>
            item.id === pendingAssistantId
              ? {
                  ...item,
                  content:
                    streamedAnswer ||
                    "Response stopped.",
                }
              : item
          )
        );

        if (
          queuedFollowUpRef.current
        ) {
          recordActivity({
            label: "Sending follow-up",
            detail:
              "The previous response stopped. Your update will send next.",
          });
        } else {
          recordActivity({
            label: "Response stopped",
            detail:
              "The partial answer was kept. You can continue.",
          });

          clearActivityAfter(
            1600
          );
        }

        return;
      }

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
            : item,
        ),
      );

      setError(message);
    } finally {
      activeRequestRef.current = null;
      activeServerRequestIdRef.current =
        null;
      setCanStopCurrent(false);

      clearActivityAfter();

      setLoading(false);
      inputRef.current?.focus();
    }
  }
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      queueFollowUpAndStop();
      return;
    }

    if (!canSend) {
      return;
    }

    const cleanInput =
      input.trim();

    const queuedImage =
      pendingAttachments.find(
        (attachment) =>
          attachment.kind === "image"
      ) ?? null;

    const hasCurrentImage =
      selectedImage !== null ||
      queuedImage !== null ||
      lastGeneratedImage !== null;

    const artifactTarget =
      detectArtifactExportTarget(
        cleanInput
      );

    if (
      artifactTarget === "pdf" &&
      hasCurrentImage
    ) {
      const imageForPdf =
        selectedImage ||
        queuedImage?.file ||
        lastGeneratedImage;

      if (imageForPdf) {
        await createPdfFromImage(
          cleanInput,
          imageForPdf,
        );

        return;
      }
    }

    if (
      artifactTarget !== null
    ) {
      if (
        hasCurrentImage &&
        artifactTarget !== "pdf"
      ) {
        setError(
          "StudySnap can currently convert "
          + "images directly to PDF. Ask it "
          + "to describe the image first "
          + "before exporting DOCX, TXT, "
          + "or Markdown."
        );

        return;
      }

      setCreateImageMode(false);
      await sendMessage();
      return;
    }

    if (
      hasCurrentImage &&
      asksToEditImage(cleanInput)
    ) {
      await createGeneratedImage(
        cleanInput ||
          "Improve this image while keeping its important details.",
        false,
        true,
      );
      return;
    }

    if (
      createImageMode ||
      (
        asksToCreateImage(
          cleanInput
        ) &&
        hasExplicitImageGenerationRequest(
          cleanInput,
          hasCurrentImage,
        )
      )
    ) {
      const forceNewImage =
        selectedImage === null &&
        queuedImage === null;

      await createGeneratedImage(
        cleanInput,
        forceNewImage
      );
      return;
    }

    await sendMessage();
  }

  function updateHistoryOpen(next: boolean) {
    setHistoryOpen(next);

    window.localStorage.setItem(
      "studysnap:general-ai-history-drawer-v2",
      String(next),
    );
  }

  function updateStudyToolsOpen(next: boolean) {
    setStudyToolsOpen(next);
  }

  function hideFileBrainTaskIds(
    taskIds: string[],
  ) {
    const safeTaskIds = [
      ...new Set(
        taskIds.filter(Boolean),
      ),
    ];

    if (!safeTaskIds.length) {
      return;
    }

    setHiddenFileQueueTaskIds(
      (current) => {
        if (
          safeTaskIds.every(
            (localId) =>
              current.has(localId),
          )
        ) {
          return current;
        }

        const next =
          new Set(current);

        safeTaskIds.forEach(
          (localId) =>
            next.add(localId),
        );

        window.localStorage.setItem(
          GENERAL_AI_HIDDEN_FILE_QUEUE_KEY,
          JSON.stringify([...next]),
        );

        return next;
      },
    );
  }


  function hideFileQueueForNewConversation() {
    const currentTasks =
      fileBrainQueue.tasks;

    const currentTaskIds =
      currentTasks.map(
        (task) => task.localId,
      );

    if (currentTaskIds.length > 0) {
      setHiddenFileQueueTaskIds(
        (current) => {
          const next =
            new Set(current);

          currentTaskIds.forEach(
            (localId) =>
              next.add(localId),
          );

          window.localStorage.setItem(
            GENERAL_AI_HIDDEN_FILE_QUEUE_KEY,
            JSON.stringify([...next]),
          );

          return next;
        },
      );
    }

    currentTasks
      .filter((task) =>
        [
          "ready",
          "duplicate",
          "failed",
          "cancelled",
        ].includes(task.status),
      )
      .forEach((task) => {
        fileBrainQueue.dismissTask(
          task.localId,
        );
      });

    fileBrainQueue.clearSelection();
  }


  function startNewTrail() {
    clearRememberedConversation();

    window.history.replaceState(
      {},
      "",
      buildGeneralAIUrl({
        studyRoomId:
          activeStudyRoomId,
        materialId:
          activeMaterialId,
        materialName:
          activeMaterialName,
      })
    );

    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setError("");
    setCopiedId(null);
    setExpandedMessageIds(new Set());
    setCreateImageMode(false);
    setRoomCreationOffer(null);

    removeSelectedImage();
    removeSelectedDocument();
    clearLastGeneratedImage();
    clearPendingAttachments();

    hideFileQueueForNewConversation();

    resetChatScroll();

    inputRef.current?.focus();
  }

  async function resetCurrentChat() {
    if (loading) return;

    if (activeConversationId === null || messages.length === 0) {
      startNewTrail();
      return;
    }

    const confirmed = window.confirm(
      "Reset this chat? Its messages will be permanently removed.",
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setError("");

      await deleteAIConversation(activeConversationId);

      setTrails((current) =>
        current.filter((trail) => trail.id !== activeConversationId),
      );

      startNewTrail();
      updateHistoryOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset this chat.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleMessageExpanded(messageId: string | number) {
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

  async function selectTrail(trail: AIConversation) {
    if (loading) return;

    rememberActiveTrail(
      trail
    );

    setInput("");
    setError("");
    setCreateImageMode(false);
    setRoomCreationOffer(null);

    removeSelectedImage();
    removeSelectedDocument();
    clearLastGeneratedImage();
    clearPendingAttachments();
    fileBrainQueue.clearSelection();

    // Stay inside unified General AI while
    // restoring the exact selected chat.
    updateHistoryOpen(false);

    await loadMessages(
      trail.id
    );

    resetChatScroll();
  }

  async function renameTrail(trail: AIConversation) {
    const nextTitle = window.prompt("Rename chat", trail.title);

    if (nextTitle === null) return;

    const cleanTitle = nextTitle.trim();

    if (!cleanTitle) return;

    try {
      const updated = await renameAIConversation(trail.id, cleanTitle);

      setTrails((current) =>
        current.map((item) => (item.id === trail.id ? updated : item)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not rename this chat.",
      );
    }
  }

  async function togglePinTrail(trail: AIConversation) {
    try {
      const updated = await pinAIConversation(trail.id, !trail.is_pinned);

      setTrails((current) =>
        current
          .map((item) => (item.id === trail.id ? updated : item))
          .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update this chat.",
      );
    }
  }

  function deleteTrail(
    trail: AIConversation,
  ) {
    if (
      loading ||
      deletingTrail
    ) {
      return;
    }

    setDeleteRequest(trail);
  }

  async function confirmDeleteTrail() {
    if (
      !deleteRequest ||
      deletingTrail
    ) {
      return;
    }

    const trail = deleteRequest;

    try {
      setDeletingTrail(true);
      setError("");

      await deleteAIConversation(
        trail.id
      );

      const remaining =
        trails.filter(
          (item) =>
            item.id !== trail.id
        );

      setTrails(remaining);

      if (
        activeConversationId ===
        trail.id
      ) {
        if (remaining.length > 0) {
          rememberActiveTrail(
            remaining[0]
          );

          await loadMessages(
            remaining[0].id
          );
        } else {
          startNewTrail();
        }
      }

      setDeleteRequest(null);

      showDeleteNotice(
        "Chat deleted."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete this chat."
      );
    } finally {
      setDeletingTrail(false);
    }
  }

  function requestBulkDelete(
    selectedTrails: AIConversation[],
  ) {
    if (
      selectedTrails.length === 0 ||
      loading ||
      deletingTrail
    ) {
      return;
    }

    setBulkDeleteRequest(
      selectedTrails
    );
  }

  async function confirmBulkDeleteTrails() {
    if (
      bulkDeleteRequest.length === 0 ||
      deletingTrail
    ) {
      return;
    }

    const deletedIds =
      new Set<number>();

    const failedTitles:
      string[] = [];

    try {
      setDeletingTrail(true);
      setError("");

      for (
        const trail
        of bulkDeleteRequest
      ) {
        try {
          await deleteAIConversation(
            trail.id
          );

          deletedIds.add(
            trail.id
          );
        } catch {
          failedTitles.push(
            trail.title
          );
        }
      }

      const remaining =
        trails.filter(
          (trail) =>
            !deletedIds.has(
              trail.id
            )
        );

      setTrails(remaining);

      if (
        activeConversationId !==
          null &&
        deletedIds.has(
          activeConversationId
        )
      ) {
        if (
          remaining.length > 0
        ) {
          rememberActiveTrail(
            remaining[0]
          );

          await loadMessages(
            remaining[0].id
          );
        } else {
          startNewTrail();
        }
      }

      setBulkDeleteRequest([]);

      if (
        deletedIds.size > 0
      ) {
        showDeleteNotice(
          `Deleted ${deletedIds.size} chat${
            deletedIds.size === 1
              ? ""
              : "s"
          }.`
        );
      }

      if (
        failedTitles.length > 0
      ) {
        setError(
          `Deleted ${deletedIds.size} chat${
            deletedIds.size === 1
              ? ""
              : "s"
          }. Could not delete: ${failedTitles.join(
            ", "
          )}.`
        );
      }
    } finally {
      setDeletingTrail(false);
    }
  }

  async function copyMessage(message: DisplayMessage) {
    try {
      await copyTextWithFallback(message.content);

      setCopiedId(message.id);

      window.setTimeout(() => setCopiedId(null), 1200);
    } catch {
      setError("Unable to copy this answer.");
    }
  }

  async function downloadGeneratedImage(
    message: DisplayMessage
  ) {
    if (
      !message.imagePreview ||
      downloadingImageId === message.id
    ) {
      return;
    }

    setDownloadingImageId(message.id);
    setDownloadedImageId(null);
    setError("");

    let objectUrl = "";

    try {
      const response = await fetch(
        message.imagePreview,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          "StudySnap could not prepare this image for download."
        );
      }

      const blob = await response.blob();

      if (!blob.size) {
        throw new Error(
          "The generated image file is empty."
        );
      }

      const extensionByType: Record<string, string> = {
        "image/avif": "avif",
        "image/gif": "gif",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };

      const originalName =
        message.imageName?.trim() || "";

      const originalExtension =
        originalName
          .split(".")
          .pop()
          ?.toLowerCase();

      const extension =
        (
          originalExtension &&
          /^[a-z0-9]{2,5}$/.test(
            originalExtension
          )
        )
          ? originalExtension
          : (
              extensionByType[
                blob.type.toLowerCase()
              ] || "png"
            );

      const baseName =
        (
          originalName
            .replace(/\.[^.]+$/, "")
            .replace(
              /[^a-z0-9._-]+/gi,
              "-"
            )
            .replace(
              /^[-_.]+|[-_.]+$/g,
              ""
            )
        ) || "studysnap-image";

      const filename =
        `${baseName}-${Date.now()}.${extension}`;

      const file = new File(
        [blob],
        filename,
        {
          type:
            blob.type ||
            `image/${extension}`,
          lastModified: Date.now(),
        }
      );

      const navigatorWithShare =
        navigator as Navigator & {
          canShare?: (
            data: ShareData
          ) => boolean;
        };

      const isAppleMobile =
        /iPhone|iPad|iPod/i.test(
          navigator.userAgent
        ) ||
        (
          navigator.platform === "MacIntel" &&
          navigator.maxTouchPoints > 1
        );

      const canShareFile =
        typeof navigator.share === "function" &&
        typeof navigatorWithShare.canShare === "function" &&
        navigatorWithShare.canShare({
          files: [file],
        });

      if (
        isAppleMobile &&
        canShareFile
      ) {
        await navigator.share({
          files: [file],
          title: "Save StudySnap image",
        });
      } else {
        objectUrl =
          window.URL.createObjectURL(
            blob
          );

        const link =
          document.createElement("a");

        link.href = objectUrl;
        link.download = filename;
        link.rel = "noopener noreferrer";
        link.style.display = "none";

        document.body.appendChild(
          link
        );

        link.click();
        link.remove();

        window.setTimeout(
          () => {
            if (objectUrl) {
              window.URL.revokeObjectURL(
                objectUrl
              );
            }
          },
          60_000
        );
      }

      setDownloadedImageId(
        message.id
      );

      window.setTimeout(
        () =>
          setDownloadedImageId(
            (current) =>
              current === message.id
                ? null
                : current
          ),
        1800
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      setError(
        error instanceof Error
          ? error.message
          : "Unable to download this image."
      );

      if (objectUrl) {
        window.URL.revokeObjectURL(
          objectUrl
        );
      }
    } finally {
      setDownloadingImageId(null);
    }
  }

  async function createStudyRoomFromFiles() {
    if (!roomCreationOffer || roomCreationOffer.status === "creating") {
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
          : null,
      );

      const result = await organizeFilesIntoStudyRooms(files);

      const firstRoom = result.rooms[0];

      if (!firstRoom) {
        throw new Error("StudySnap could not create a room from these files.");
      }

      saveProjectRoomId(firstRoom.id);
      setRoomCreationOffer(null);

      router.push(`/study-rooms/${firstRoom.id}`);
    } catch (err) {
      setRoomCreationOffer((current) =>
        current
          ? {
              ...current,
              status: "ready",
            }
          : null,
      );

      setError(
        err instanceof Error
          ? err.message
          : "The study room could not be created.",
      );
    }
  }

  function normalizeComposerFiles(files: File[]) {
    const stamp = Date.now();

    return files.map((file, index) => {
      if (file.name.trim()) return file;

      const extension =
        file.type.includes("/")
          ? file.type.split("/")[1].replace(/[^a-z0-9]+/gi, "") || "bin"
          : "bin";

      return new File(
        [file],
        `pasted-file-${stamp}-${index + 1}.${extension}`,
        {
          type: file.type || "application/octet-stream",
          lastModified: file.lastModified || stamp,
        }
      );
    });
  }

    async function addComposerFiles(
    incomingFiles: File[]
  ) {
    const files =
      normalizeComposerFiles(
        incomingFiles
      );

    if (!files.length) {
      return;
    }

    setError("");
    setCreateImageMode(false);

    // Every normal attachment now uses one connected queue.
    // This prevents a legacy single image from silently
    // suppressing other files marked Included.
    removeSelectedImage();
    clearPendingAttachments();

    try {
      const result =
        await fileBrainQueue.addFiles(
          files
        );

      if (result.accepted > 0) {
        recordActivity({
          label: "Files queued",
          detail:
            `${result.accepted} file${result.accepted === 1 ? "" : "s"} will upload privately.`,
          progress: 0,
        });

        clearActivityAfter(
          1600
        );
      }

      if (result.rejected > 0) {
        setError(
          `${result.rejected} file${result.rejected === 1 ? " was" : "s were"} not added.`
        );
      }
    } catch (queueError) {
      await addAttachments(
        files.slice(0, 10)
      );

      setError(
        (
          queueError instanceof Error
            ? `${queueError.message} `
            : ""
        )
        + "StudySnap kept up to 10 files in the immediate-upload fallback."
      );
    } finally {
      updateStudyToolsOpen(false);
      inputRef.current?.focus();
    }
  }

  function clipboardFileKey(
    file: File,
  ) {
    return [
      file.name,
      file.size,
      file.type,
      file.lastModified,
    ].join("::");
  }

  function collectClipboardFiles(
    clipboard: DataTransfer,
  ): File[] {
    const directFiles =
      Array.from(
        clipboard.files ?? [],
      );

    const itemFiles =
      Array.from(
        clipboard.items ?? [],
      )
        .filter(
          (item) =>
            item.kind === "file",
        )
        .map(
          (item) =>
            item.getAsFile(),
        )
        .filter(
          (file): file is File =>
            file !== null,
        );

    const uniqueFiles =
      new Map<string, File>();

    [
      ...directFiles,
      ...itemFiles,
    ].forEach((file) => {
      uniqueFiles.set(
        clipboardFileKey(file),
        file,
      );
    });

    return [
      ...uniqueFiles.values(),
    ];
  }

  function insertComposerPasteText(
    target: HTMLTextAreaElement,
    text: string,
  ) {
    const start =
      target.selectionStart
      ?? target.value.length;

    const end =
      target.selectionEnd
      ?? start;

    const cursor =
      start + text.length;

    setInput(
      (current) =>
        current.slice(0, start)
        + text
        + current.slice(end),
    );

    window.requestAnimationFrame(
      () => {
        const textarea =
          inputRef.current;

        textarea?.focus();
        textarea?.setSelectionRange(
          cursor,
          cursor,
        );
      },
    );
  }

  function handleComposerPaste(
    event: ReactClipboardEvent<HTMLTextAreaElement>
  ) {
    const files =
      collectClipboardFiles(
        event.clipboardData,
      );

    if (!files.length) {
      return;
    }

    event.preventDefault();

    const text =
      event.clipboardData.getData(
        "text/plain",
      );

    if (text) {
      insertComposerPasteText(
        event.currentTarget,
        text,
      );
    }

    if (fileInputRef.current) {
      fileInputRef.current.value =
        "";
    }

    void addComposerFiles(files);
  }

  function dragHasFiles(
    event: ReactDragEvent<HTMLFormElement>
  ) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleComposerDragEnter(
    event: ReactDragEvent<HTMLFormElement>
  ) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setComposerDragging(true);
  }

  function handleComposerDragOver(
    event: ReactDragEvent<HTMLFormElement>
  ) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setComposerDragging(true);
  }

  function handleComposerDragLeave(
    event: ReactDragEvent<HTMLFormElement>
  ) {
    const next = event.relatedTarget;

    if (
      next instanceof Node &&
      event.currentTarget.contains(next)
    ) {
      return;
    }

    setComposerDragging(false);
  }

  function handleComposerDrop(
    event: ReactDragEvent<HTMLFormElement>
  ) {
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;

    event.preventDefault();
    setComposerDragging(false);
    void addComposerFiles(files);
  }

  function openFeatureFilePicker() {
    setError("");
    setAiToolsOpen(false);
    updateStudyToolsOpen(false);

    const picker =
      fileInputRef.current;

    if (!picker) {
      setError(
        "The file picker could not open. Please refresh and try again.",
      );

      return;
    }

    picker.value = "";
    picker.click();
  }


  function openFeatureCamera() {
    setError("");
    setAiToolsOpen(false);
    updateStudyToolsOpen(false);

    const camera =
      cameraInputRef.current;

    if (!camera) {
      setError(
        "The camera picker could not open on this device.",
      );

      return;
    }

    camera.value = "";
    camera.click();
  }


  function beginFeatureImageCreation() {
    setAiToolsOpen(false);
    updateStudyToolsOpen(false);
    setCreateImageMode(true);
    removeSelectedImage();
    setError("");

    window.requestAnimationFrame(
      () =>
        inputRef.current?.focus(),
    );
  }


  function prepareFeatureWebSearch() {
    setAiToolsOpen(false);
    updateStudyToolsOpen(false);
    setError("");

    setInput((current) => {
      const clean =
        current.trim();

      if (!clean) {
        return "Search the web for ";
      }

      if (
        /^search the web\b/i.test(
          clean,
        )
      ) {
        return current;
      }

      return `Search the web for ${clean}`;
    });

    window.requestAnimationFrame(
      () =>
        inputRef.current?.focus(),
    );
  }


  function runVisibleStudyAction(
    command: string,
  ) {
    setAiToolsOpen(false);
    updateStudyToolsOpen(false);

    if (!hasStudyActionTarget) {
      setError(
        "Ask StudySnap something first, then use this study action on the latest answer.",
      );

      inputRef.current?.focus();
      return;
    }

    void sendMessage(command);
  }


  function renderComposer(
    large = false
  ) {
    const compactQueueTasks =
      fileBrainQueue.tasks.filter(
      (task) =>
        !hiddenFileQueueTaskIds.has(
          task.localId,
        ),
    )
        .filter((task) => task.status !== "cancelled");

    return (
      <form
        onSubmit={handleSubmit}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
        aria-label="Message StudySnap"
        className={`studysnap-composer relative overflow-hidden border border-white/[0.09] ${
          composerDragging
            ? "studysnap-composer-dragging"
            : ""
        } ${
          large
            ? "rounded-[1.45rem] p-2"
            : "rounded-[1.35rem] p-2"
        }`}
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

        <input
          ref={referenceImageInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(event) => {
            const selected =
              event.currentTarget.files?.[0];

            void handleImageChange(
              selected
            );

            event.currentTarget.value =
              "";
          }}
        />

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const selected =
              event.currentTarget.files?.[0];

            void handleImageChange(
              selected
            );

            event.currentTarget.value =
              "";
          }}
        />

        {roomCreationOffer ? (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-[10px] font-bold text-zinc-300">
              Keep these files in a Study Room?
            </p>

            <button
              type="button"
              onClick={() =>
                setRoomCreationOffer(null)
              }
              className="grid h-7 w-7 place-items-center rounded-full text-zinc-400"
              aria-label="Dismiss"
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
              className="rounded-full bg-[#c9ad50] px-3 py-1.5 text-[9px] font-black text-black disabled:opacity-50"
            >
              {roomCreationOffer.status ===
              "creating"
                ? "Creating"
                : "Create"}
            </button>
          </div>
        ) : null}

        {pendingDocument ? (
          <div className="mb-2 flex h-12 items-center gap-2 rounded-xl bg-white/[0.05] px-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/25">
              ▤
            </span>

            <p className="min-w-0 flex-1 truncate text-[10px] font-bold text-zinc-300">
              {pendingDocument.name}
            </p>

            <button
              type="button"
              onClick={
                removeSelectedDocument
              }
              className="grid h-7 w-7 place-items-center rounded-full text-zinc-400"
              aria-label="Remove document"
            >
              ×
            </button>
          </div>
        ) : null}

        {compactQueueTasks.length > 0 ? (
          <div
            className="studysnap-composer-files mb-1.5 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1"
            aria-label="File upload queue"
            aria-live="polite"
          >
            {compactQueueTasks.map((task) => {
              const selectable =
                task.status === "ready" ||
                task.status === "duplicate";

              const canPause =
                task.status === "uploading";

              const canResume =
                task.status === "paused";

              const canRetry =
                task.status === "failed";

              const canCancel =
                task.status === "queued" ||
                task.status === "uploading" ||
                task.status === "paused" ||
                task.status === "failed";

              const canDismiss =
                task.status === "ready" ||
                task.status === "duplicate" ||
                task.status === "cancelled";

              const statusLabel =
                task.selectedForAsk
                  ? "Included"
                  : selectable
                    ? "Tap to include"
                    : task.status === "uploading"
                      ? `${Math.round(task.progress)}%`
                      : task.status === "paused"
                        ? `Paused · ${Math.round(task.progress)}%`
                        : task.status === "failed"
                          ? "Retry available"
                          : task.status;

              return (
                <div
                  key={task.localId}
                  className={`studysnap-composer-file-chip flex h-12 max-w-[14.5rem] shrink-0 items-center gap-1 rounded-xl border p-1 ${
                    task.selectedForAsk
                      ? "border-[#c9ad50]/45 bg-[#c9ad50]/12"
                      : task.status === "failed"
                        ? "border-red-300/20 bg-red-300/[0.06]"
                        : task.status === "paused"
                          ? "border-amber-200/20 bg-amber-200/[0.055]"
                          : "border-white/[0.08] bg-white/[0.045]"
                  }`}
                >
                  {task.previewUrl ? (
                    <AttachmentPreviewButton
                      src={task.previewUrl}
                      name={task.filename}
                      groupId="composer-file-brain-attachments"
                      variant="composer"
                      className="h-9 w-9 shrink-0 rounded-lg"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/25 text-[12px] text-zinc-400"
                    >
                      ▤
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={!selectable}
                    onClick={() =>
                      fileBrainQueue.toggleSelected(
                        task.localId
                      )
                    }
                    aria-pressed={
                      task.selectedForAsk
                    }
                    aria-label={
                      selectable
                        ? `${statusLabel}: ${task.filename}`
                        : `${task.filename}: ${statusLabel}`
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left disabled:cursor-default"
                  >


                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-bold text-zinc-200">
                        {task.filename}
                      </span>

                      <span className="block truncate text-[9px] text-zinc-500">
                        {statusLabel}
                      </span>
                    </span>
                  </button>

                  <span className="flex shrink-0 items-center gap-0.5">
                    {canPause ? (
                      <button
                        type="button"
                        onClick={() =>
                          void fileBrainQueue.pauseTask(
                            task.localId
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-[12px] font-black text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
                        aria-label={`Pause upload ${task.filename}`}
                        title="Pause"
                      >
                        Ⅱ
                      </button>
                    ) : null}

                    {canResume ? (
                      <button
                        type="button"
                        onClick={() =>
                          fileBrainQueue.resumeTask(
                            task.localId
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-[12px] font-black text-[#d8c878] transition hover:bg-[#c9ad50]/12"
                        aria-label={`Resume upload ${task.filename}`}
                        title="Resume"
                      >
                        ▶
                      </button>
                    ) : null}

                    {canRetry ? (
                      <button
                        type="button"
                        onClick={() =>
                          fileBrainQueue.retryTask(
                            task.localId
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-[15px] font-black text-red-200 transition hover:bg-red-200/[0.08]"
                        aria-label={`Retry upload ${task.filename}`}
                        title="Retry"
                      >
                        ↻
                      </button>
                    ) : null}

                    {canCancel ? (
                      <button
                        type="button"
                        onClick={() =>
                          void fileBrainQueue.cancelTask(
                            task.localId
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-[17px] text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
                        aria-label={`Cancel upload ${task.filename}`}
                        title="Cancel"
                      >
                        ×
                      </button>
                    ) : canDismiss ? (
                      <button
                        type="button"
                        onClick={() =>
                          fileBrainQueue.dismissTask(
                            task.localId
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-[17px] text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
                        aria-label={`Dismiss file ${task.filename}`}
                        title="Dismiss"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {fileBrainQueue.error ||
        fileBrainQueue.recoveryWarning ? (
          <p className="mb-1 truncate px-2 text-[9px] text-amber-200/80">
            {fileBrainQueue.error ||
              fileBrainQueue.recoveryWarning}
          </p>
        ) : null}

        {pendingAttachments.length > 0 ? (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {pendingAttachments.map(
              (attachment) => (
                <div
                  key={attachment.id}
                  className="relative flex h-12 max-w-[12rem] shrink-0 items-center gap-2 rounded-xl bg-white/[0.05] px-2 pr-8"
                >
                  {attachment.preview ? (
                    <AttachmentPreviewButton
                      src={attachment.preview}
                      name={attachment.name}
                      groupId="composer-pending-attachments"
                      variant="composer"
                    />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/25">
                      ▤
                    </span>
                  )}

                  <p className="min-w-0 truncate text-[10px] font-bold text-zinc-300">
                    {attachment.name}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      removePendingAttachment(
                        attachment.id
                      )
                    }
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full text-zinc-400"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        ) : null}

        {selectedImage ? (
          <div className="mb-2 flex h-12 items-center gap-2 rounded-xl bg-white/[0.05] px-2">
            {selectedImagePreview ? (
              <AttachmentPreviewButton
                src={selectedImagePreview}
                name={selectedImage.name}
                groupId="composer-selected-image"
                variant="composer"
              />
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-bold text-zinc-200">
                {selectedImage.name}
              </p>

              <p className="text-[9px] text-[#c9ad50]">
                Image attached
              </p>
            </div>

            <button
              type="button"
              onClick={removeSelectedImage}
              className="grid h-7 w-7 place-items-center rounded-full text-zinc-400"
              aria-label="Remove image"
            >
              ×
            </button>
          </div>
        ) : null}

        {false &&
        !selectedImage &&
        lastGeneratedImage &&
        lastGeneratedImagePreview ? (
          <div className="mb-2 flex h-11 items-center gap-2 rounded-xl bg-[#c9ad50]/[0.07] px-2">
            <img
              src={lastGeneratedImagePreview}
              alt="Last generated image"
              className="h-8 w-8 shrink-0 rounded-lg object-cover"
            />

            <p className="min-w-0 flex-1 truncate text-[10px] font-bold text-[#d8c878]">
              Editing last image
            </p>

            <button
              type="button"
              onClick={
                clearLastGeneratedImage
              }
              className="grid h-7 w-7 place-items-center rounded-full text-zinc-400"
              aria-label="Stop using last image"
            >
              ×
            </button>
          </div>
        ) : null}

        {createImageMode ? (
          <div className="mb-1 flex items-center justify-between px-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#c9ad50]">
            <span>New image</span>

            <button
              type="button"
              onClick={() => {
                setCreateImageMode(false);
                inputRef.current?.focus();
              }}
              className="normal-case tracking-normal text-zinc-500"
            >
              Cancel
            </button>
          </div>
        ) : null}

        <div className="studysnap-composer-input-row flex items-end gap-2 px-1">
          <button
            type="button"
            onClick={() => {
              setError("");
              updateStudyToolsOpen(false);

              const picker =
                fileInputRef.current;

              if (!picker) {
                setError(
                  "The file picker could not open. Please refresh and try again."
                );

                return;
              }

              picker.value = "";
              picker.click();
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xl font-light text-zinc-100 transition hover:bg-white/[0.13]"
            aria-label="Attach photos and files"
            title="Attach photos and files"
          >
            ＋
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onPaste={handleComposerPaste}
            onKeyDown={(event) => {
              const explicitSend =
                event.ctrlKey || event.metaKey;

              const desktopEnter =
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                window.matchMedia("(pointer: fine)").matches;

              if (
                event.key === "Enter" &&
                (explicitSend || desktopEnter)
              ) {
                event.preventDefault();

                if (canSend) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            enterKeyHint="enter"
            placeholder={
              selectedImage
                ? "Tell StudySnap what to do with this image..."
                : createImageMode
                  ? "Describe the image you want..."
                  : "Message StudySnap..."
            }
            rows={1}
            className="min-h-[42px] max-h-40 min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent px-1.5 py-2 text-[16px] font-medium leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
          />

          <button
            type={loading ? "button" : "submit"}
            onClick={
              loading && canStopCurrent
                ? stopCurrentResponse
                : undefined
            }
            disabled={
              loading
                ? !canStopCurrent
                : !canSend
            }
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-black transition disabled:cursor-not-allowed disabled:opacity-30 ${
              loading && canStopCurrent
                ? "bg-white text-black"
                : "bg-[#c9ad50] text-black hover:bg-[#d7bd63]"
            }`}
            aria-label={
              loading && canStopCurrent
                ? "Stop response"
                : "Send"
            }
          >
            {loading
              ? canStopCurrent
                ? "■"
                : "…"
              : "↑"}
          </button>
        </div>

        {activity ? (
          <div className="mt-1 flex items-center justify-between gap-3 px-2 text-[9px] font-bold text-zinc-500">
            <span className="truncate">
              {activity.label}
            </span>

            {typeof activity.progress ===
            "number" ? (
              <span>
                {Math.round(
                  activity.progress
                )}
                %
              </span>
            ) : null}
          </div>
        ) : null}
      </form>
    );
  }

  return (
    <section className="studysnap-ai-workspace studysnap-general-ai-fullscreen relative flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <header className="studysnap-ai-fullscreen-header flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-black/92 px-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={() =>
            router.push("/dashboard")
          }
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-[#111111] text-xs font-black text-[#c9ad50] transition hover:bg-[#181818]"
          aria-label="Return to dashboard"
          title="Return to dashboard"
        >
          S
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">
            StudySnap
          </p>

          <p className="truncate text-[10px] text-zinc-500">
            {activeTrail?.title || "New conversation"}
          </p>
        </div>

        <AIActivityPanel
          steps={activitySteps}
          startedAt={activityStartedAt}
          active={
            loading &&
            activity !== null
          }
          onStop={
            canStopCurrent
              ? stopCurrentResponse
              : undefined
          }
        />

        <button
          type="button"
          data-studysnap-tools-trigger="true"
          onClick={() => {
            updateStudyToolsOpen(false);

            setAiToolsOpen(
              (current) => !current
            );
          }}
          aria-label="Open StudySnap AI tools"
          aria-expanded={aiToolsOpen}
          title="StudySnap AI tools"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-[11px] font-black transition ${
            aiToolsOpen
              ? "border-[#c9ad50]/40 bg-[#c9ad50]/15 text-[#eadf9f]"
              : "border-white/[0.08] bg-[#111111] text-[#c9ad50] hover:bg-[#181818]"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 7h14M5 12h14M5 17h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
</button>
      </header>

      {aiToolsOpen ? (
        <div className="fixed inset-0 z-[230]">
          <button
            type="button"
            aria-label="Close AI tools"
            onClick={() =>
              setAiToolsOpen(false)
            }
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="StudySnap tools"
            className="studysnap-ai-tools-panel absolute left-3 right-3 top-[calc(4rem+env(safe-area-inset-top))] max-h-[min(72dvh,38rem)] overflow-y-auto overscroll-contain rounded-[1.5rem] border border-white/[0.10] bg-[#202020]/[0.98] p-2 shadow-[0_28px_90px_rgba(0,0,0,0.72)] backdrop-blur-2xl sm:left-auto sm:right-4 sm:w-[24rem]"
          >
            <div className="flex h-10 items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#c9ad50]/25 bg-[#c9ad50]/10 text-[10px] font-black text-[#dfcf80]">
                  S
                </span>

                <p className="text-xs font-bold text-zinc-200">
                  StudySnap tools
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setAiToolsOpen(false)
                }
                className="grid h-7 w-7 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.09] hover:text-white"
                aria-label="Close AI tools"
              >
                ×
              </button>
            </div>

            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setAiToolsOpen(false);
                  startNewTrail();
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium text-zinc-100 hover:bg-white/[0.08]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06]">
                  ＋
                </span>

                New conversation
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiToolsOpen(false);
                  updateHistoryOpen(true);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium text-zinc-100 hover:bg-white/[0.08]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06]">
                  ≡
                </span>

                Chat history
              </button>

              <div
                data-studysnap-ai-feature-grid="true"
                className="mt-1 grid grid-cols-2 gap-1"
              >
                <button
                  type="button"
                  onClick={
                    beginFeatureImageCreation
                  }
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-white/[0.035] px-2.5 text-left text-xs font-bold text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#c9ad50]/10 text-[#dfcf80]">
                    ✦
                  </span>
                  Create image
                </button>

                <button
                  type="button"
                  onClick={
                    openFeatureFilePicker
                  }
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-white/[0.035] px-2.5 text-left text-xs font-bold text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06]">
                    ↥
                  </span>
                  Upload files
                </button>

                <button
                  type="button"
                  onClick={
                    openFeatureCamera
                  }
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-white/[0.035] px-2.5 text-left text-xs font-bold text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06]">
                    ◉
                  </span>
                  Take photo
                </button>

                <button
                  type="button"
                  onClick={
                    prepareFeatureWebSearch
                  }
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-white/[0.035] px-2.5 text-left text-xs font-bold text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06]">
                    ◌
                  </span>
                  Search web
                </button>
              </div>

              <section
                data-studysnap-visible-study-actions="true"
                className="mt-2 rounded-xl border border-white/[0.07] bg-black/15 p-1.5"
                aria-label="Study actions"
              >
                <p className="px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  Study actions
                </p>

                <div className="grid grid-cols-2 gap-1">
                  {[
                    [
                      "▤",
                      "Save note",
                      "Save this as a note",
                    ],
                    [
                      "▧",
                      "Make cards",
                      "Make flashcards from this",
                    ],
                    [
                      "?",
                      "Make quiz",
                      "Make a quiz from this",
                    ],
                    [
                      "◷",
                      "Add to planner",
                      "Add this to my planner",
                    ],
                  ].map(
                    ([
                      symbol,
                      label,
                      command,
                    ]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={
                          !hasStudyActionTarget
                        }
                        onClick={() =>
                          runVisibleStudyAction(
                            command,
                          )
                        }
                        title={
                          hasStudyActionTarget
                            ? label
                            : "Ask something first"
                        }
                        className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-[11px] font-bold text-zinc-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-white/[0.05] text-[#d8c878]">
                          {symbol}
                        </span>
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </section>

              <details className="rounded-xl" data-studysnap-quick-prompts="true">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl px-2.5 text-sm font-medium text-zinc-100 hover:bg-white/[0.08]">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06]">
                    •••
                  </span>

                  <span className="flex-1">
                    Quick prompts
                  </span>

                  <span className="text-[10px] text-zinc-500">
                    ▼
                  </span>
                </summary>

                <div className="ml-3 mt-1 space-y-1 border-l border-white/[0.09] pb-1 pl-3">
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl px-2 text-xs text-zinc-300 hover:bg-white/[0.06]">
                    <span>
                      Image shape
                    </span>

                    <select
                      value={imageSize}
                      onChange={(event) =>
                        setImageSize(
                          event.target
                            .value as GenerateAIImageSize
                        )
                      }
                      className="max-w-[7rem] rounded-lg border border-white/[0.08] bg-[#222222] px-2 py-1.5 text-xs text-zinc-200 outline-none"
                      aria-label="Image shape"
                    >
                      <option value="1024x1024">
                        Square
                      </option>

                      <option value="1024x1536">
                        Portrait
                      </option>

                      <option value="1536x1024">
                        Landscape
                      </option>
                    </select>
                  </label>

                  {suggestions.map(
                    (suggestion) => (
                      <button
                        key={`ai-menu-${suggestion}`}
                        type="button"
                        onClick={() => {
                          setCreateImageMode(false);
                          setAiToolsOpen(false);

                          void sendMessage(
                            suggestion
                          );
                        }}
                        disabled={loading}
                        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-medium text-zinc-200 hover:bg-white/[0.07] disabled:opacity-50"
                      >
                        <span className="text-[#d8c878]">
                          ✦
                        </span>

                        {suggestion}
                      </button>
                    )
                  )}

                  {lastGeneratedImage ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearLastGeneratedImage();
                        setAiToolsOpen(false);
                      }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-medium text-zinc-300 hover:bg-white/[0.07]"
                    >
                      <span>×</span>

                      Stop editing last image
                    </button>
                  ) : null}

                  {/* GENERAL_AI_CURRENT_CHAT_PIN_V1 */}
                  {activeTrail ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAiToolsOpen(false);

                        void togglePinTrail(
                          activeTrail
                        );
                      }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-medium text-zinc-200 hover:bg-white/[0.07]"
                    >
                      <span className="text-[#d8c878]">
                        {activeTrail.is_pinned
                          ? "−"
                          : "S"}
                      </span>

                      {activeTrail.is_pinned
                        ? "Unpin conversation"
                        : "Pin conversation"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setAiToolsOpen(false);
                      void resetCurrentChat();
                    }}
                    disabled={
                      loading ||
                      (
                        !hasMessages &&
                        !input.trim() &&
                        !selectedImage &&
                        !lastGeneratedImage
                      )
                    }
                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-medium text-red-200 hover:bg-red-400/10 disabled:opacity-40"
                  >
                    <span>↻</span>

                    Clear current chat
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAiToolsOpen(false);
                      router.push(
                        "/dashboard"
                      );
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-medium text-zinc-300 hover:bg-white/[0.07]"
                  >
                    <span>⌂</span>

                    Open dashboard
                  </button>
                </div>
              </details>
            </div>
          </aside>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-[90] xl:hidden">
          <button
            type="button"
            aria-label="Close chat history"
            onClick={() => updateHistoryOpen(false)}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />

          <aside className="absolute bottom-0 left-0 top-[calc(3.5rem+env(safe-area-inset-top))] w-[min(88vw,350px)] overflow-y-auto border-r border-white/10 bg-[#0a0a0a] p-2 shadow-2xl">
            <div className="flex h-11 items-center justify-end px-1">
              <button
                type="button"
                onClick={() => updateHistoryOpen(false)}
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
              onSelect={(trail) => void selectTrail(trail)}
              onNew={() => {
                startNewTrail();
                updateHistoryOpen(false);
              }}
              onRename={(trail) => void renameTrail(trail)}
              onDelete={(trail) => void deleteTrail(trail)}
              onTogglePin={(trail) => void togglePinTrail(trail)}
              onBulkDelete={(selectedTrails) =>
                requestBulkDelete(selectedTrails)
              }
            />
          </aside>
        </div>
      ) : null}

      <div className="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden">
        <nav
          aria-label="AI tools"
          className="hidden"
        >
          <button
            type="button"
            onClick={startNewTrail}
            aria-label="Start a new chat"
            title="New chat"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#c9ad50] text-xl font-black text-[#111317] transition hover:bg-[#d5bb63] active:scale-95"
          >
            ✎
          </button>

          <button
            type="button"
            onClick={() => updateHistoryOpen(!historyOpen)}
            aria-label="Open chat history"
            aria-expanded={historyOpen}
            title="Chats"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-base transition ${
              historyOpen
                ? "border-[#c9ad50]/30 bg-[#c9ad50]/10 text-[#e6daa0]"
                : "border-white/[0.09] bg-white/[0.04] text-slate-300 hover:bg-white/[0.09]"
            }`}
          >
            ☰
          </button>

          <button
            type="button"
            onClick={() => {
              const attachmentInput = fileInputRef.current;

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
            aria-label="Attach files"
            title="Attach files"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-base font-black text-slate-300 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ↥
          </button>

          <button
            type="button"
            aria-pressed={createImageMode}
            onClick={() => {
              setCreateImageMode((current) => !current);
              removeSelectedImage();
              setError("");
              inputRef.current?.focus();
            }}
            aria-label="Create an image"
            title="Create image"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-sm font-black transition ${
              createImageMode
                ? "border-[#c9ad50]/30 bg-[#c9ad50]/10 text-[#e6daa0]"
                : "border-white/[0.09] bg-white/[0.04] text-slate-300 hover:bg-white/[0.09]"
            }`}
          >
            ✦
          </button>

          <div className="ml-auto flex flex-row gap-2 sm:ml-0 sm:mt-auto sm:flex-col">
            <button
              type="button"
              onClick={() => void resetCurrentChat()}
              disabled={
                loading || (!hasMessages && !input.trim() && !selectedImage)
              }
              aria-label="Reset current chat"
              title="Reset chat"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-base text-slate-400 transition hover:border-red-300/20 hover:bg-red-400/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              ↻
            </button>

            <button
              type="button"
              onClick={() => {
                setAiToolsOpen(false);
                updateStudyToolsOpen(
                  !studyToolsOpen
                );
              }}
              aria-label="Open study tools"
              aria-expanded={studyToolsOpen}
              title="More tools"
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-[11px] font-black tracking-[0.08em] transition ${
                studyToolsOpen
                  ? "border-[#c9ad50]/30 bg-[#c9ad50]/10 text-[#e6daa0]"
                  : "border-white/[0.09] bg-white/[0.04] text-slate-400 hover:bg-white/[0.09] hover:text-white"
              }`}
            >
              •••
            </button>
          </div>
        </nav>
        {historyOpen ? (
          <aside className="absolute bottom-0 left-0 top-0 z-40 hidden w-[280px] min-w-0 overflow-hidden rounded-2xl border border-white/[0.10] bg-[#080c10]/95 p-2 shadow-[0_28px_80px_rgba(0,0,0,0.60),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-3xl xl:block">
            <div className="h-full">
              <StudyTrailPanel
                trails={trails}
                activeTrailId={activeConversationId}
                loading={loadingTrails}
                search={trailSearch}
                title="Chats"
                emptyMessage="Start your first chat."
                onSearchChange={setTrailSearch}
                onSelect={(trail) => void selectTrail(trail)}
                onNew={startNewTrail}
                onRename={(trail) => void renameTrail(trail)}
                onDelete={(trail) => void deleteTrail(trail)}
                onTogglePin={(trail) => void togglePinTrail(trail)}
              onBulkDelete={(selectedTrails) =>
                requestBulkDelete(selectedTrails)
              }
              />
            </div>
          </aside>
        ) : null}

        <div className="studysnap-chat-surface relative flex min-h-0 min-w-0 flex-col overflow-hidden border-0 bg-black">
          {!hasMessages && !loadingMessages ? (
            <div className="mx-auto flex h-full w-full max-w-[960px] flex-col justify-center overflow-y-auto px-3 py-6">
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl text-[#e3d589]">
                  ✦
                </div>

                <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
                  How can I help?
                </h2>
              </div>

              <div className="mt-6">{renderComposer(false)}</div>

              <div className="hidden">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    disabled={loading}
                    className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div
                  ref={chatScrollRef}
                  onScroll={handleChatScroll}
                  className="studysnap-scroll mx-auto min-h-0 w-full max-w-[820px] flex-1 space-y-6 overflow-y-auto px-4 pb-7 pt-5 sm:px-6 overscroll-contain"
                >
                {loadingMessages ? (
                  <p className="py-12 text-center text-sm font-bold text-slate-400">
                    Opening chat...
                  </p>
                ) : null}

                {messages.map((message) => {
                  const collapseLimit = message.role === "user" ? 420 : 760;

                  const longMessage = message.content.length > collapseLimit;

                  const expanded = expandedMessageIds.has(message.id);

                  const displayedContent =
                    longMessage && !expanded
                      ? `${message.content.slice(0, collapseLimit).trimEnd()}…`
                      : message.content;

                  const assistantActivity =
                    message.role === "assistant"
                      ? pendingAssistantActivityLabel(
                          message.content
                        )
                      : null;

                  return (
                    <article
                      key={message.id}
                      className={
                        message.role === "user"
                          ? "ml-auto min-w-0 w-fit max-w-[88%] overflow-hidden rounded-[1.3rem] bg-[#202020] px-4 py-3 text-[#f5f5f5] sm:max-w-[76%]"
                          : "mr-auto min-w-0 w-full max-w-full overflow-hidden bg-transparent px-0 py-0 text-zinc-100"
                      }
                    >
                      {message.attachments?.length ? (
                        <div className="studysnap-message-attachment-gallery mb-3 flex max-w-full gap-2 overflow-x-auto pb-1 overscroll-x-contain">
                          {message.attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
                            >
                              {attachment.kind === "image" &&
                              attachment.preview ? (
                                <AttachmentPreviewButton
                                  src={attachment.preview}
                                  name={attachment.name}
                                  groupId={`message-${message.id}-attachments`}
                                  variant="message"
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
                          ))}
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
                                {(message.documentSize / 1024 / 1024).toFixed(
                                  2,
                                )}{" "}
                                MB
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {message.imagePreview ? (
                        <AttachmentPreviewButton
                          src={message.imagePreview}
                          name={
                            message.imageName ||
                            (
                              message.generatedImage
                                ? "StudySnap image.png"
                                : "Uploaded image"
                            )
                          }
                          groupId={`message-${message.id}-primary-image`}
                          variant={
                            message.generatedImage
                              ? "generated"
                              : "message"
                          }
                        />
                      ) : null}

                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/[0.055] pb-3">
                        {message.role === "user" ? (
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-55">
                            You
                          </p>
                        ) : typeof message.id === "number" ? (
                          <CentralActionBar
                            messageId={message.id}
                            messageContent={displayedContent}
                            preferredStudyRoomId={
                              activeStudyRoomId
                            }
                          />
                        ) : (
                          <span
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-[#c9ad50]/20 bg-[#c9ad50]/10 text-[11px] font-black text-[#d8c878]"
                            aria-label="StudySnap"
                            title="StudySnap"
                          >
                            S
                          </span>
                        )}

                        {message.role === "assistant" ? (
                          <div
                            className="flex items-center gap-1 rounded-2xl border border-white/[0.075] bg-black/15 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                            aria-label="Message actions"
                          >
                            {message.generatedImage &&
                            message.imagePreview ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void downloadGeneratedImage(
                                    message
                                  )
                                }
                                disabled={
                                  downloadingImageId ===
                                  message.id
                                }
                                title={
                                  downloadedImageId ===
                                  message.id
                                    ? "Image saved"
                                    : "Download image"
                                }
                                aria-label={
                                  downloadedImageId ===
                                  message.id
                                    ? "Image saved"
                                    : "Download image"
                                }
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:opacity-60"
                              >
                                {downloadingImageId ===
                                message.id ? (
                                  <span
                                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                                    aria-hidden="true"
                                  />
                                ) : downloadedImageId ===
                                  message.id ? (
                                  <svg
                                    viewBox="0 0 24 24"
                                    width="18"
                                    height="18"
                                    fill="none"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="m5 12 4 4L19 6"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 24 24"
                                    width="18"
                                    height="18"
                                    fill="none"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"
                                      stroke="currentColor"
                                      strokeWidth="1.9"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() =>
                                void copyMessage(
                                  message
                                )
                              }
                              title={
                                copiedId === message.id
                                  ? "Copied"
                                  : "Copy answer"
                              }
                              aria-label={
                                copiedId === message.id
                                  ? "Copied"
                                  : "Copy answer"
                              }
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
                            >
                              {copiedId ===
                              message.id ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  width="18"
                                  height="18"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="m5 12 4 4L19 6"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  viewBox="0 0 24 24"
                                  width="18"
                                  height="18"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <rect
                                    x="9"
                                    y="9"
                                    width="10"
                                    height="10"
                                    rx="2"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                  />
                                  <path
                                    d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {message.role === "assistant" ? (
                        assistantActivity ? (
                          <AIActivityIndicator
                            label={
                              assistantActivity
                            }
                          />
                        ) : (
                          <>
                            <SimpleMarkdown
                              content={displayedContent}
                              className="text-sm leading-7"
                            />

                            <SmartActionLinks
                              content={displayedContent}
                            />

                            {typeof message.id === "number" ? (
                              <ArtifactFileCards messageId={message.id} />
                            ) : null}

                          </>
                        )
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-6">
                          {displayedContent}
                        </div>
                      )}

                      <GeneralAIMessageActions
                        message={message}
                        conversationId={
                          activeConversationId
                        }
                        onActionComplete={
                          handleMessageActionComplete
                        }
                      />

                      {longMessage ? (
                        <button
                          type="button"
                          onClick={() => toggleMessageExpanded(message.id)}
                          className="mt-3 text-xs font-black text-[#d9ca83] hover:text-[#eee3ac]"
                        >
                          {expanded ? "Show less" : "Show more"}
                        </button>
                      ) : null}
                    </article>
                  );
                })}

                <div ref={bottomRef} />
              </div>

              <div className="studysnap-ai-composer-dock shrink-0 bg-black/95 px-3 pb-2 pt-1.5 backdrop-blur-2xl sm:px-5 sm:pb-3">
                <div className="mx-auto w-full max-w-[820px]">
                  <nav
                    data-studysnap-visible-ai-actions="true"
                    aria-label="General AI quick actions"
                    className="mb-1 flex w-full items-center gap-1 overflow-x-auto px-1 pb-1"
                  >
                    <button
                      type="button"
                      onClick={startNewTrail}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-[10px] font-black text-zinc-300 transition hover:bg-white/[0.09]"
                      title="New conversation"
                    >
                      <span className="text-sm text-[#d8c878]">
                        ＋
                      </span>
                      New
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAiToolsOpen(false);
                        updateHistoryOpen(true);
                      }}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-[10px] font-black text-zinc-300 transition hover:bg-white/[0.09]"
                      title="Chat history"
                    >
                      <span className="text-sm">
                        ≡
                      </span>
                      Chats
                    </button>

                    <button
                      type="button"
                      onClick={
                        beginFeatureImageCreation
                      }
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-[10px] font-black text-zinc-300 transition hover:bg-white/[0.09]"
                      title="Create image"
                    >
                      <span className="text-sm text-[#d8c878]">
                        ✦
                      </span>
                      Image
                    </button>

                    <button
                      type="button"
                      onClick={
                        openFeatureFilePicker
                      }
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-[10px] font-black text-zinc-300 transition hover:bg-white/[0.09]"
                      title="Upload files"
                    >
                      <span className="text-sm">
                        ↥
                      </span>
                      Upload
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        updateStudyToolsOpen(false);
                        setAiToolsOpen(true);
                      }}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#c9ad50]/20 bg-[#c9ad50]/[0.07] px-3 text-[10px] font-black text-[#ddd18f] transition hover:bg-[#c9ad50]/[0.13]"
                      title="All StudySnap tools"
                    >
                      <span className="text-sm">
                        ☰
                      </span>
                      Tools
                    </button>
                  </nav>

                  {renderComposer(false)}
                </div>
              </div>
            </>
          )}

          {deleteNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute bottom-[calc(5.8rem+env(safe-area-inset-bottom))] left-1/2 z-[275] -translate-x-1/2 rounded-full border border-emerald-300/20 bg-[#10241a]/95 px-4 py-2 text-xs font-black text-emerald-100 shadow-2xl backdrop-blur-xl"
            >
              {deleteNotice}
            </div>
          ) : null}

          {error ? (
            <div className="absolute left-4 right-4 top-[4.25rem] z-50 mx-auto max-w-xl rounded-xl border border-red-400/20 bg-[#2b0d11]/95 px-4 py-3 text-sm font-bold text-red-100 shadow-2xl backdrop-blur-xl">
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
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04]">
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
        <div
          className="fixed inset-0 z-[220]"
          data-studysnap-quick-add="true"
        >
          <button
            type="button"
            aria-label="Close add menu"
            onClick={() =>
              updateStudyToolsOpen(false)
            }
            className="absolute inset-0 bg-transparent"
          />

          <aside className="studysnap-tools-popover absolute bottom-[calc(7.1rem+env(safe-area-inset-bottom))] left-4 w-[min(18.5rem,calc(100vw-2rem))] rounded-[1.15rem] border border-white/[0.11] bg-[#2b2b2b] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.68)]">
            <div className="flex h-9 items-center justify-between px-2">
              <p className="text-xs font-bold text-zinc-300">
                Add
              </p>

              <button
                type="button"
                onClick={() =>
                  updateStudyToolsOpen(false)
                }
                className="grid h-7 w-7 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.09] hover:text-white"
                aria-label="Close add menu"
              >
                ×
              </button>
            </div>

            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  updateStudyToolsOpen(false);

                  const picker =
                    fileInputRef.current;

                  if (!picker) {
                    setError(
                      "The file picker could not open."
                    );

                    return;
                  }

                  picker.value = "";
                  picker.click();
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium text-zinc-100 hover:bg-white/[0.08]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06]">
                  ↥
                </span>

                <span>
                  <span className="block font-bold">
                    Upload photos & files
                  </span>

                  <span className="block text-[11px] text-zinc-500">
                    Add one or many files
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateStudyToolsOpen(false);
                  cameraInputRef.current?.click();
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium text-zinc-100 hover:bg-white/[0.08]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06]">
                  ◉
                </span>

                <span>
                  <span className="block font-bold">
                    Take photo
                  </span>

                  <span className="block text-[11px] text-zinc-500">
                    Open your device camera
                  </span>
                </span>
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {bulkDeleteRequest.length > 0 ? (
        <div
          className="fixed inset-0 z-[280] grid place-items-end px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 sm:place-items-center sm:px-4 sm:py-6"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close bulk delete confirmation"
            onClick={() => {
              if (!deletingTrail) {
                setBulkDeleteRequest([]);
              }
            }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-chat-title"
            aria-describedby="bulk-delete-chat-description"
            className="relative z-10 w-full max-w-md rounded-[1.5rem] border border-white/10 bg-[#11171d] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.75)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-300/15 bg-red-400/10 text-lg">
                🗑
              </div>

              <div className="min-w-0">
                <h2
                  id="bulk-delete-chat-title"
                  className="text-lg font-black text-white"
                >
                  Delete {bulkDeleteRequest.length} chats?
                </h2>

                <p
                  id="bulk-delete-chat-description"
                  className="mt-2 text-sm leading-6 text-slate-400"
                >
                  The selected chats and their messages will be permanently removed.
                </p>
              </div>
            </div>

            <div className="mt-4 max-h-36 overflow-y-auto rounded-xl border border-white/[0.07] bg-black/20 p-2">
              {bulkDeleteRequest.map((trail) => (
                <p
                  key={trail.id}
                  className="truncate px-2 py-1 text-xs font-bold text-slate-400"
                >
                  {trail.title}
                </p>
              ))}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={deletingTrail}
                onClick={() =>
                  setBulkDeleteRequest([])
                }
                className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-50"
              >
                Keep chats
              </button>

              <button
                type="button"
                disabled={deletingTrail}
                onClick={() =>
                  void confirmBulkDeleteTrails()
                }
                className="min-h-11 rounded-xl border border-red-300/20 bg-red-400/15 px-4 py-2.5 text-sm font-black text-red-100 transition hover:bg-red-400/25 disabled:cursor-wait disabled:opacity-60"
              >
                {deletingTrail
                  ? "Deleting..."
                  : `Delete ${bulkDeleteRequest.length} chats`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteRequest ? (
        <div
          className="fixed inset-0 z-[280] grid place-items-end px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 sm:place-items-center sm:px-4 sm:py-6"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close delete confirmation"
            onClick={() => {
              if (!deletingTrail) {
                setDeleteRequest(null);
              }
            }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            aria-describedby="delete-chat-description"
            className="relative z-10 w-full max-w-md rounded-[1.5rem] border border-white/10 bg-[#11171d] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.75)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-300/15 bg-red-400/10 text-lg">
                🗑
              </div>

              <div className="min-w-0">
                <h2
                  id="delete-chat-title"
                  className="text-lg font-black text-white"
                >
                  Delete this chat?
                </h2>

                <p
                  id="delete-chat-description"
                  className="mt-2 text-sm leading-6 text-slate-400"
                >
                  “{deleteRequest.title}” and its messages
                  will be permanently removed.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={deletingTrail}
                onClick={() =>
                  setDeleteRequest(null)
                }
                className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-50"
              >
                Keep chat
              </button>

              <button
                type="button"
                disabled={deletingTrail}
                onClick={() =>
                  void confirmDeleteTrail()
                }
                className="min-h-11 rounded-xl border border-red-300/20 bg-red-400/15 px-4 py-2.5 text-sm font-black text-red-100 transition hover:bg-red-400/25 disabled:cursor-wait disabled:opacity-60"
              >
                {deletingTrail
                  ? "Deleting..."
                  : "Delete chat"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </section>
  );
}
