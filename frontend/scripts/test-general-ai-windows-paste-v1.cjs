const fs = require("fs");
const path = require("path");

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
  "function clipboardFileKey(",
  "function collectClipboardFiles(",
  "clipboard.files ?? []",
  "clipboard.items ?? []",
  "new Map<string, File>()",
  "function insertComposerPasteText(",
  "event.preventDefault();",
  "void addComposerFiles(files);",
  "onPaste={handleComposerPaste}",
]) {
  expect(
    chat.includes(marker),
    `Missing Windows paste marker: ${marker}`,
  );
}

const pasteStart = chat.indexOf(
  "function handleComposerPaste(",
);

const pasteEnd = chat.indexOf(
  "function dragHasFiles(",
  pasteStart,
);

expect(
  pasteStart >= 0 && pasteEnd > pasteStart,
  "Paste handler block was not found.",
);

const pasteBlock = chat.slice(
  pasteStart,
  pasteEnd,
);

expect(
  pasteBlock.includes(
    "collectClipboardFiles(",
  ),
  "Paste does not collect files from both clipboard paths.",
);

expect(
  pasteBlock.includes(
    'getData(\n        "text/plain",',
  ),
  "Pasted text is not preserved when files are present.",
);

expect(
  pasteBlock.includes(
    "fileInputRef.current.value =",
  ),
  "The picker is not reset after clipboard input.",
);

const newTrailStart = chat.indexOf(
  "function startNewTrail(",
);

const newTrailEnd = chat.indexOf(
  "async function resetCurrentChat(",
  newTrailStart,
);

expect(
  newTrailStart >= 0 && newTrailEnd > newTrailStart,
  "New conversation reset block was not found.",
);

const newTrail = chat.slice(
  newTrailStart,
  newTrailEnd,
);

for (const marker of [
  "removeSelectedImage();",
  "removeSelectedDocument();",
  "clearPendingAttachments();",
  "hideFileQueueForNewConversation();",
]) {
  expect(
    newTrail.includes(marker),
    `New conversation does not reset: ${marker}`,
  );
}

console.log(
  "PASS: Windows file paste and new-chat attachment reset are connected.",
);
