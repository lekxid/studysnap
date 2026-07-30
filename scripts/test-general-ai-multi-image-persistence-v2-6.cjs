const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

const backend = fs.readFileSync(
  "backend/app/routes/ai.py",
  "utf8",
);

function requireText(
  source,
  value,
  message,
) {
  if (!source.includes(value)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_PERSISTENCE_V2_6",
  "V2.6 persistence marker is present.",
);

requireText(
  chat,
  "isStoredAttachmentContinuationMessage",
  "Direct attachment continuation records are recognized.",
);

requireText(
  chat,
  "Attached(?:\\s+from\\s+File\\s+Brain)?:",
  "Both direct and File Brain continuation labels are supported.",
);

requireText(
  chat,
  "attachmentMessageCount >= 2",
  "Only multi-attachment user runs use direct grouping.",
);

requireText(
  chat,
  "shouldCollapseStoredAttachmentRun",
  "Direct multi-file runs are collapsed after reload.",
);

requireText(
  chat,
  "mergeStoredMessageAttachments(",
  "Grouped turns merge their stored attachments.",
);

requireText(
  chat,
  "&& !isStoredAttachmentContinuationMessage(",
  "Attached filename records cannot replace the real user question.",
);

requireText(
  backend,
  "MULTI-IMAGE COMPARISON CONTRACT:",
  "The strict backend comparison contract remains installed.",
);

requireText(
  backend,
  'A short follow-up such as "tell me more"',
  "The backend latest-task follow-up rule remains installed.",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_DIRECT_ROUTING_V2_5_3",
  "Direct multi-image routing remains installed.",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2_5_3_NULL_SAFE",
  "Null-safe comparison attachment selection remains installed.",
);
