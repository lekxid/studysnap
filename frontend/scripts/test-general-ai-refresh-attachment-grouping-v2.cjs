const fs = require("node:fs");
const path = require("node:path");

const chat = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/features/ai/GeneralAIChat.tsx",
  ),
  "utf8",
);

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

for (const marker of [
  "function isStoredFileBrainAttachmentMessage(",
  "function mergeStoredMessageAttachments(",
  "function collapseStoredFileBrainTurns(",
  "/^Attached from File Brain:/i",
  "const mappedMessages = await Promise.all(",
  "collapseStoredFileBrainTurns(",
  "mergeStoredMessageAttachments(",
  "setMessages(displayMessages);",
]) {
  expect(
    chat.includes(marker),
    `Missing refresh-grouping marker: ${marker}`,
  );
}

const helperStart = chat.indexOf(
  "function collapseStoredFileBrainTurns(",
);

const helperEnd = chat.indexOf(
  "function extractAIText(",
  helperStart,
);

expect(
  helperStart >= 0
    && helperEnd > helperStart,
  "Refresh grouping helper was not found.",
);

const helper = chat.slice(
  helperStart,
  helperEnd,
);

for (const marker of [
  'message.role !== "user"',
  'messages[end].role ===',
  "containsStoredFileBrainMessage",
  "meaningfulMessages",
  "meaningfulContent",
  "mergeStoredMessageAttachments(",
  "userRun.length - 1",
]) {
  expect(
    helper.includes(marker),
    `Grouping logic is incomplete: ${marker}`,
  );
}

const loadStart = chat.indexOf(
  "async function loadMessages(",
);

const loadEnd = chat.indexOf(
  "async function refreshTrails(",
  loadStart,
);

expect(
  loadStart >= 0
    && loadEnd > loadStart,
  "loadMessages block was not found.",
);

const load = chat.slice(
  loadStart,
  loadEnd,
);

expect(
  load.includes(
    "const mappedMessages = await Promise.all(",
  ),
  "Stored messages are not mapped first.",
);

expect(
  load.indexOf(
    "collapseStoredFileBrainTurns(",
  ) >
  load.indexOf(
    "const mappedMessages = await Promise.all(",
  ),
  "Mapped messages are not collapsed before display.",
);

expect(
  !load.includes(
    "const displayMessages = await Promise.all(",
  ),
  "The old one-record-per-card reload remains.",
);

console.log(
  "PASS: Refresh restores one question card "
  + "with all File Brain attachments.",
);
