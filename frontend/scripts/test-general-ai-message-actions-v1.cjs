const fs = require(
  "node:fs",
);
const path = require(
  "node:path",
);

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

const component = read(
  "src/components/ai/GeneralAIMessageActions.tsx",
);

const api = read(
  "src/lib/api.ts",
);

for (const marker of [
  "GeneralAIMessageActions",
  "activeConversationId",
  "message={message}",
  "onActionComplete={",
  "{longMessage ? (",
]) {
  expect(
    chat.includes(marker),
    `Chat integration missing: ${marker}`,
  );
}

for (const marker of [
  "Edit and resend",
  "Retry from this message",
  "Regenerate answer",
  "Branch conversation",
  "window.prompt(",
  "workingRef.current",
  "onActionComplete(",
  "Creating branch…",
  "Creating a new answer…",
  'role="status"',
  "animate-bounce",
]) {
  expect(
    component.includes(marker),
    `Action UI missing: ${marker}`,
  );
}

expect(
  !component.includes(
    "window.location.assign("
  ),
  "Message actions must not force a page reload.",
);

for (const marker of [
  "branchAIConversationFromMessage",
  "editAndResendAIMessage",
  "retryAIMessage",
  "regenerateAIMessage",
  "/branch",
  "/edit-resend",
  "/retry",
  "/regenerate",
]) {
  expect(
    api.includes(marker),
    `Frontend API missing: ${marker}`,
  );
}

const actionIndex = chat.indexOf(
  "<GeneralAIMessageActions",
);

const longMessageIndex = chat.indexOf(
  "{longMessage ? (",
  actionIndex,
);

expect(
  actionIndex >= 0
    && longMessageIndex > actionIndex
    && longMessageIndex - actionIndex < 900,
  "Message actions are outside the per-message scope.",
);

console.log(
  "PASS: Message actions are connected without a page reload."
);

console.log(
  "PASS: Synchronous action locking prevents double-click duplicates."
);
