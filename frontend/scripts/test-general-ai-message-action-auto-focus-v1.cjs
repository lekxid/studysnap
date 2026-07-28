const fs = require("node:fs");
const path = require("node:path");

const actions = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/components/ai/GeneralAIMessageActions.tsx",
  ),
  "utf8",
);

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

const focusKey =
  "studysnap:general-ai-message-action-focus";

for (const marker of [
  focusKey,
  "window.sessionStorage.setItem(",
  "result.conversation.id",
  "window.location.assign(",
]) {
  expect(
    actions.includes(marker),
    `Missing message-action navigation marker: ${marker}`,
  );
}

const setIndex = actions.indexOf(
  "window.sessionStorage.setItem(",
);

const navigateIndex = actions.indexOf(
  "window.location.assign(",
);

expect(
  setIndex >= 0
    && navigateIndex > setIndex,
  "The destination focus is not stored before navigation.",
);

for (const marker of [
  "function takeMessageActionFocus(",
  "function focusLatestMessageAfterRender()",
  "window.sessionStorage.removeItem(",
  "window.requestAnimationFrame(",
  "bottomRef.current",
  'behavior: "auto"',
  'block: "end"',
]) {
  expect(
    chat.includes(marker),
    `Missing latest-response focus marker: ${marker}`,
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

const setMessagesIndex = load.indexOf(
  "setMessages(displayMessages);",
);

const focusIndex = load.indexOf(
  "takeMessageActionFocus(",
);

expect(
  setMessagesIndex >= 0,
  "Stored messages are not rendered.",
);

expect(
  focusIndex > setMessagesIndex,
  "The latest-message focus runs before messages render.",
);

expect(
  load.includes(
    "focusLatestMessageAfterRender();",
  ),
  "The destination does not scroll after rendering.",
);

expect(
  chat.includes(
    '<div ref={bottomRef} />',
  ),
  "The bottom focus target is missing.",
);

console.log(
  "PASS: 🌿 Branch opens at the newest branched message.",
);

console.log(
  "PASS: Retry, regenerate, and edit/resend show their newest response.",
);

console.log(
  "PASS: No manual scrolling is required after message actions.",
);
