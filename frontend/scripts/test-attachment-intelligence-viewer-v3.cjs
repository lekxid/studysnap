const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(
  __dirname,
  "..",
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8",
  );
}

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

const chat = read(
  "src/features/ai/GeneralAIChat.tsx",
);

const viewer = read(
  "src/components/ai/AttachmentPreviewButton.tsx",
);

const api = read(
  "src/lib/api.ts",
);

const backendAI = fs.readFileSync(
  path.resolve(
    root,
    "../backend/app/routes/ai.py",
  ),
  "utf8",
);

expect(
  chat.includes(
    "AttachmentPreviewButton",
  ),
  "General AI viewer import is missing.",
);

expect(
  (
    chat.match(
      /<AttachmentPreviewButton/g,
    ) || []
  ).length >= 4,
  "Not every General AI image surface uses the viewer.",
);

function hasRawImageTagWithSource(
  source,
  expression,
) {
  const imageTags =
    source.match(
      /<img\b[\s\S]*?\/>/g,
    ) || [];

  return imageTags.some(
    (tag) =>
      tag.includes(
        `src={${expression}}`,
      ),
  );
}

expect(
  !hasRawImageTagWithSource(
    chat,
    "attachment.preview",
  ),
  "Raw sent/composer attachment image remains.",
);

expect(
  !hasRawImageTagWithSource(
    chat,
    "selectedImagePreview",
  ),
  "Raw selected-image preview remains.",
);

expect(
  !hasRawImageTagWithSource(
    chat,
    "message.imagePreview",
  ),
  "Raw message image remains.",
);

for (const required of [
  'role="dialog"',
  'aria-modal="true"',
  'event.key === "Escape"',
  'event.key === "ArrowLeft"',
  'event.key === "ArrowRight"',
  '"popstate"',
  "window.history.pushState",
  "window.history.back",
  "Download image",
  "Previous attachment",
  "Next attachment",
  "object-contain",
  "safeFileName",
]) {
  expect(
    viewer.includes(required),
    `Viewer contract missing: ${required}`,
  );
}

expect(
  viewer.includes(
    "data-studysnap-attachment-group",
  ),
  "Attachment grouping is missing.",
);

expect(
  viewer.includes(
    "title={name}",
  ),
  "Full filename accessibility is missing.",
);

const hasMultiFileRequest =
  /files\.forEach\(\s*\(file\)\s*=>/.test(
    api,
  ) &&
  /formData\.append\(\s*["']files["']\s*,\s*file/.test(
    api,
  ) &&
  /\/api\/ai\/ask-files/.test(
    api,
  );

expect(
  hasMultiFileRequest,
  "Frontend multi-file request contract is missing.",
);

for (const required of [
  'content_type.startswith("image/")',
  '"type": "input_image"',
  "prepared_attachments",
  "openai_vision_model",
]) {
  expect(
    backendAI.includes(required),
    `Backend vision contract missing: ${required}`,
  );
}

expect(
  backendAI.includes(
    '"image/heic"',
  ) &&
    backendAI.includes(
      '"image/heif"',
    ),
  "HEIC/HEIF vision handling is missing.",
);

console.log(
  "PASS: Compact attachment viewer is connected.",
);

console.log(
  "PASS: Composer, sent, history, and generated images open.",
);

console.log(
  "PASS: Viewer keyboard, browser Back, navigation, and download contracts exist.",
);

console.log(
  "PASS: Multi-image requests remain routed to backend vision.",
);
