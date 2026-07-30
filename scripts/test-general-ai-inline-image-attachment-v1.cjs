const fs = require("fs");
const path = require("path");

const root = process.cwd();

const chat = fs.readFileSync(
  path.join(
    root,
    "frontend/src/features/ai/GeneralAIChat.tsx",
  ),
  "utf8",
);

const css = fs.readFileSync(
  path.join(
    root,
    "frontend/src/app/globals.css",
  ),
  "utf8",
);

function expect(value, message) {
  if (!value) {
    throw new Error(`FAIL: ${message}`);
  }

  console.log(`PASS: ${message}`);
}

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_INLINE_IMAGE_ATTACHMENT_V1",
  ),
  "Inline sent-image rendering is connected.",
);

expect(
  chat.includes(
    'className="studysnap-inline-message-image',
  ),
  "Sent images use the clean image-only wrapper.",
);

expect(
  chat.includes(
    'className="studysnap-inline-message-file',
  ),
  "Documents retain a separate named file card.",
);

const renderStart = chat.indexOf(
  "STUDYSNAP_GENERAL_AI_INLINE_IMAGE_ATTACHMENT_V1",
);

const renderEnd = chat.indexOf(
  "{message.documentName ? (",
  renderStart,
);

const renderBlock = chat.slice(
  renderStart,
  renderEnd,
);

const imageBranchStart = renderBlock.indexOf(
  'attachment.kind === "image"',
);

const fileBranchStart = renderBlock.indexOf(
  "studysnap-inline-message-file",
);

const imageBranch = renderBlock.slice(
  imageBranchStart,
  fileBranchStart,
);

expect(
  !imageBranch.includes(
    '<p className="truncate',
  ),
  "Image attachments do not print filenames.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_FILE_SELECTION_CLEANUP_V1",
  ) &&
  chat.includes(
    "fileBrainQueue.clearSelection();",
  ),
  "Successful File Brain sends clear the Included selection.",
);

expect(
  css.includes(
    "STUDYSNAP_GENERAL_AI_INLINE_IMAGE_ATTACHMENT_CSS_V1",
  ),
  "Compact responsive image attachment CSS is connected.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_PHASE_6G_UNIFIED_IMAGE_ROUTING",
  ),
  "Existing direct image routing remains present.",
);

expect(
  chat.includes(
    "requestId: imageRequestId",
  ),
  "Existing Stop and Continue request IDs remain present.",
);
