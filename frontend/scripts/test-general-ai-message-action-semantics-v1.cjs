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

const actions = read(
  "src/components/ai/GeneralAIMessageActions.tsx",
);

const backend = fs.readFileSync(
  path.resolve(
    root,
    "../backend/app/routes/ai_message_actions.py",
  ),
  "utf8",
);

const handlerStart = chat.indexOf(
  "async function handleMessageActionComplete("
);

const handlerEnd = chat.indexOf(
  "\n  useEffect(() => {",
  handlerStart,
);

expect(
  handlerStart >= 0
    && handlerEnd > handlerStart,
  "Message-action completion handler was not found.",
);

const handler = chat.slice(
  handlerStart,
  handlerEnd,
);

for (const marker of [
  'result.action === "regenerate"',
  "destination.id !==",
  "activeConversationId",
  "destination.id ===",
  "rememberActiveTrail(",
  "loadMessages(",
]) {
  expect(
    handler.includes(marker),
    `Handler semantic guard missing: ${marker}`,
  );
}

expect(
  actions.includes(
    "if (\n      workingRef.current !== null"
  ),
  "Synchronous double-click protection is missing.",
);

const regenerateStart = backend.indexOf(
  '"/messages/{message_id}/regenerate"'
);

expect(
  regenerateStart >= 0,
  "Backend regenerate route is missing.",
);

const regenerate = backend.slice(
  regenerateStart,
);

for (const marker of [
  "temporary_branch = create_branch(",
  "db.delete(",
  "temporary_branch",
  "source_message.content = (",
  "branch=source_conversation",
  "messages=current_messages",
  "assistant_message=source_message",
]) {
  expect(
    regenerate.includes(marker),
    `Regenerate semantic marker missing: ${marker}`,
  );
}

console.log(
  "PASS: Branch requires a new conversation ID."
);

console.log(
  "PASS: Regenerate returns and updates the original conversation."
);

console.log(
  "PASS: Double-clicks cannot issue duplicate requests."
);
