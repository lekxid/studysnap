const fs = require("node:fs");
const path = require("node:path");

const frontend = path.resolve(
  __dirname,
  "..",
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(frontend, relativePath),
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

const actionBar = read(
  "src/components/ai/CentralActionBar.tsx",
);

const intent = read(
  "src/lib/generalAiActionIntent.ts",
);

const context = read(
  "src/lib/generalAiActionContext.ts",
);

const room = read(
  "src/lib/generalAiActionRoom.ts",
);

for (const marker of [
  "resolveGeneralAIActionTarget",
  "pressedMessageId",
  "isGeneralAIActionTarget",
  "isTransient",
  "message.role === \"assistant\"",
  "typeof message.id === \"number\"",
  "!message.generatedImage",
  "BLOCKED_ACTION_CONTENT",
]) {
  expect(
    context.includes(marker),
    `Context resolver marker missing: ${marker}`,
  );
}

expect(
  context.indexOf("pressedMessageId")
    < context.lastIndexOf(
      "for ("
    ),
  "Pressed-message priority must run before latest-message fallback.",
);

for (const marker of [
  "resolveGeneralAIActionTarget(",
  "pendingAssistantActivityLabel(",
  "actionIntent.roomHint",
]) {
  expect(
    chat.includes(marker),
    `General AI context connection missing: ${marker}`,
  );
}

expect(
  !chat.includes(
    "message.content.trim().length >= 40"
  ),
  "Old length-only target resolver still exists.",
);

for (const marker of [
  "roomHint: string | null",
  "function extractRoomHint(",
  "extractRoomHint(text)",
  "[a-z0-9 ]+\\\\s+room",
]) {
  expect(
    intent.includes(marker),
    `Intent room marker missing: ${marker}`,
  );
}

for (const marker of [
  "selectGeneralAIActionRoom",
  "preferredStudyRoomId",
  '"hint"',
  '"preferred"',
  '"only"',
  '"ambiguous"',
  '"unmatched"',
]) {
  expect(
    room.includes(marker),
    `Room resolver marker missing: ${marker}`,
  );
}

for (const marker of [
  "customEvent.detail?.roomHint",
  "requestedRoomHint",
  "selectGeneralAIActionRoom(",
  "More than one Study Room matches",
  "could not find a Study Room matching",
]) {
  expect(
    actionBar.includes(marker),
    `Action Bar room marker missing: ${marker}`,
  );
}

for (const safeguard of [
  "previewCentralAction",
  "executeCentralAction",
  "undoCentralAction",
  "result.duplicate",
  "preferredStudyRoomId",
]) {
  expect(
    actionBar.includes(safeguard),
    `Existing action safeguard was lost: ${safeguard}`,
  );
}

console.log(
  "PASS: Central Action Reliability V1 Max Phase 2 verified.",
);
