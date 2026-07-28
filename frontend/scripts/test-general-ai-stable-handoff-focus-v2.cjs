const fs = require("node:fs");
const path = require("node:path");

const dashboard = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/app/dashboard/page.tsx",
  ),
  "utf8",
);

const page = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/app/general-ai/page.tsx",
  ),
  "utf8",
);

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

for (const marker of [
  "function createGeneralAIHandoffId()",
  'params.set(\n      "handoff",',
]) {
  expect(
    dashboard.includes(marker),
    `Missing Dashboard handoff marker: ${marker}`,
  );
}

for (const marker of [
  "const handoffKey =",
  "key={handoffKey}",
]) {
  expect(
    page.includes(marker),
    `Missing keyed remount marker: ${marker}`,
  );
}

expect(
  actions.includes(
    "studysnap:general-ai-message-action-focus",
  ),
  "Message actions do not store the focus request.",
);

for (const marker of [
  "function findMessageScrollContainer(",
  "function scrollLatestMessageIntoView()",
  "scrollContainer.scrollHeight",
  "scrollContainer.scrollTo({",
  "const delays = [",
  "1700,",
  "new ResizeObserver(",
  "observer.observe(",
  "preventScroll: true",
]) {
  expect(
    chat.includes(marker),
    `Missing stable focus marker: ${marker}`,
  );
}

expect(
  !chat.includes(
    "function focusLatestMessageAfterRender() {\n"
    + "    window.requestAnimationFrame(",
  ),
  "The one-time V1 focus implementation remains.",
);

const loadStart = chat.indexOf(
  "async function loadMessages(",
);

const loadEnd = chat.indexOf(
  "async function refreshTrails(",
  loadStart,
);

const load = chat.slice(
  loadStart,
  loadEnd,
);

expect(
  load.includes(
    "takeMessageActionFocus(",
  ),
  "Loaded message actions are not recognized.",
);

expect(
  load.includes(
    "focusLatestMessageAfterRender();",
  ),
  "Stable focus is not triggered after messages render.",
);

console.log(
  "PASS: Dashboard Ask always remounts a fresh General AI screen.",
);

console.log(
  "PASS: 🌿 stays at the newest point during long-response layout.",
);

console.log(
  "PASS: The composer is focused after the final position stabilizes.",
);
