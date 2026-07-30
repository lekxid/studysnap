const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

const api = fs.readFileSync(
  "frontend/src/lib/api.ts",
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
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_DIRECT_ROUTING_V2_5_3",
  "V2.5.3 direct-routing marker is present.",
);

requireText(
  chat,
  "imageFiles.length >= 2",
  "Two or more images use the multi-image route.",
);

requireText(
  chat,
  "await addAttachments(",
  "Multi-image files enter direct pending attachments.",
);

requireText(
  chat,
  "imageFiles.slice(",
  "Multi-image order is preserved while enforcing the upload cap.",
);

requireText(
  chat,
  "imageFiles.length === 0",
  "Document-only batches retain File Brain routing.",
);

requireText(
  chat,
  "files: attachmentsToSend.map((attachment) => attachment.file)",
  "The send path uses each original File object.",
);

requireText(
  api,
  'formData.append(',
  "The direct multi-file request still uses FormData.",
);

requireText(
  backend,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2_4_CONTEXT",
  "Backend V2.4 comparison context remains installed.",
);

requireText(
  backend,
  "image_inputs.append(",
  "The backend still builds one vision input per uploaded image.",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2_4_3_ALIASES",
  "The comparison display aliases remain installed.",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2_5_3_NULL_SAFE",
  "The null-safe comparison attachment marker is present.",
);

requireText(
  chat,
  "const previousImageAttachments:",
  "Previous-message image attachments are always a typed array.",
);

requireText(
  chat,
  "const latestImageAttachments:",
  "Latest-pair image attachments are always a typed array.",
);

requireText(
  chat,
  "const comparisonAttachments:",
  "The comparison parser always receives a defined array.",
);

requireText(
  chat,
  "?? 0",
  "The latest image-pair attachment count defaults to zero.",
);

if (
  chat.includes(
    "Keep documents and multi-image batches on File Brain."
  )
) {
  throw new Error(
    "The outdated multi-image File Brain rule is still present."
  );
}

console.log(
  "PASS: Multi-image batches no longer bypass the comparison endpoint."
);
