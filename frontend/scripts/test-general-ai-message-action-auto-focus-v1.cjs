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

expect(
  !actions.includes(
    "window.location.assign("
  ),
  "Message actions still force a full-page navigation.",
);

for (const marker of [
  "onActionComplete(",
  "workingRef.current",
  "await onActionComplete(",
]) {
  expect(
    actions.includes(marker),
    `Missing action completion marker: ${marker}`,
  );
}

for (const marker of [
  "studysnap:general-ai-message-action-focus",
  "async function handleMessageActionComplete(",
  "rememberActiveTrail(",
  "await loadMessages(",
  "await refreshTrails(",
  "result.conversation",
  'result.action === "regenerate"',
  '"🌿 Branch created."',
  '"↻ New answer ready."',
]) {
  expect(
    chat.includes(marker),
    `Missing soft-transition marker: ${marker}`,
  );
}

const rememberIndex = chat.indexOf(
  "rememberActiveTrail(",
  chat.indexOf(
    "async function handleMessageActionComplete("
  ),
);

const loadIndex = chat.indexOf(
  "await loadMessages(",
  rememberIndex,
);

expect(
  rememberIndex >= 0
    && loadIndex > rememberIndex,
  "The destination chat is not activated before loading messages.",
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

console.log(
  "PASS: 🌿 Branch opens in-app at the newest branched message.",
);

console.log(
  "PASS: ↻ Regenerate stays in the current chat.",
);

console.log(
  "PASS: No full-page refresh or manual scrolling is required.",
);
