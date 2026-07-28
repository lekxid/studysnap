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

const backend = fs.readFileSync(
  path.resolve(
    root,
    "../backend/app/routes/ai_message_actions.py",
  ),
  "utf8",
);

for (const marker of [
  "GeneralAIMessageActions",
  "activeConversationId",
  "message={message}",
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
  "window.location.assign(",
  "animate-bounce",
  "animationDelay:",
  "[0, 1, 2].map",
]) {
  expect(
    component.includes(marker),
    `Action UI missing: ${marker}`,
  );
}

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
    && longMessageIndex - actionIndex < 700,
  "Message actions are outside the per-message scope.",
);

for (const marker of [
  "branch_from_message",
  "edit_and_resend",
  "retry_from_message",
  "regenerate_answer",
  "create_fresh_exchange",
]) {
  expect(
    backend.includes(marker),
    `Backend action missing: ${marker}`,
  );
}

console.log(
  "PASS: Edit, retry, regenerate, "
  + "and branch are connected."
);
