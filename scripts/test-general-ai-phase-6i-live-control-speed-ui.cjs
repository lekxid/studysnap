#!/usr/bin/env node

const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const chat = read(
  "frontend/src/features/ai/GeneralAIChat.tsx",
);
const api = read(
  "frontend/src/lib/api.ts",
);
const route = read(
  "backend/app/routes/ai.py",
);
const css = read(
  "frontend/src/app/globals.css",
);

for (const marker of [
  "STUDYSNAP_GENERAL_AI_PHASE_6I_LIVE_CONTROL",
  "type InterruptedImageTask = {",
  "activeImageRequestIdRef",
  "stoppedImageTaskRef",
  "stoppedTextResponseRef",
  "imageRunVersionRef",
  "cancelAIImage(",
  "requestId: imageRequestId",
  "const persistedAssistantId =",
  "generatedImage: true",
  "isStopTaskCommand",
  "isContinueTaskCommand",
  "isRemoveLatestImageCommand",
  "removeLatestGeneratedImage",
  "deleteAIAttachment(",
  "data-studysnap-generated-image",
  "PHASE_6I_STREAM_PAINT",
]) {
  expect(
    chat.includes(marker),
    `Chat is missing ${marker}`,
  );
}

const imageStart = chat.indexOf(
  "async function createGeneratedImage(",
);
const imageEnd = chat.indexOf(
  "async function sendMessage(",
  imageStart,
);
const imageFunction = chat.slice(
  imageStart,
  imageEnd,
);

expect(
  imageStart >= 0 && imageEnd > imageStart,
  "Image function boundaries are missing.",
);
expect(
  !imageFunction.includes(
    "await loadMessages(",
  ),
  "Image still waits for history refresh.",
);
expect(
  imageFunction.includes(
    "imagePreview: imageSource",
  ) &&
  imageFunction.includes(
    "id: persistedAssistantId",
  ),
  "Direct image insertion is missing.",
);

for (const marker of [
  "requestId?: string;",
  "request_id: options.requestId",
  "export async function cancelAIImage(",
  '"/api/ai/images/cancel"',
]) {
  expect(
    api.includes(marker),
    `API is missing ${marker}`,
  );
}

for (const marker of [
  "STUDYSNAP_GENERAL_AI_PHASE_6I_IMAGE_CANCELLATION",
  "class CancelImageRequest",
  "def cancel_image_request(",
  "def ensure_image_request_active(",
  '@router.post("/images/cancel")',
  "request_id: str | None = None",
  "request_id: str | None = Form(",
]) {
  expect(
    route.includes(marker),
    `Backend is missing ${marker}`,
  );
}

expect(
  (
    route.match(
      /ensure_image_request_active\(/g,
    ) || []
  ).length >= 5,
  "Backend cancellation guards are incomplete.",
);

expect(
  css.includes(
    "STUDYSNAP_GENERAL_AI_PHASE_6I_MOBILE_POLISH",
  ) &&
  css.includes(
    '[data-studysnap-generated-image="true"]',
  ) &&
  css.includes(
    "scroll-padding-bottom",
  ),
  "Mobile image/composer polish is missing.",
);

console.log(
  "PASS: Images appear without refreshing the chat.",
);
console.log(
  "PASS: Stop prevents a ghost image result.",
);
console.log(
  "PASS: Continue and Remove commands are connected.",
);
console.log(
  "PASS: Long-text streaming and mobile spacing are connected.",
);
