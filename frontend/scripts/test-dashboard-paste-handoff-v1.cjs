const fs = require("node:fs");
const path = require("node:path");

const dashboard = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/app/dashboard/page.tsx",
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
  "ClipboardEvent as ReactClipboardEvent",
  "function dashboardClipboardFileKey(",
  "function collectDashboardClipboardFiles(",
  "clipboard.files ?? []",
  "clipboard.items ?? []",
  "new Map<string, File>()",
  "function handleDashboardPromptPaste(",
  "onPaste={",
  "handleDashboardPromptPaste",
]) {
  expect(
    dashboard.includes(marker),
    `Missing Dashboard paste marker: ${marker}`,
  );
}

const cardStart = dashboard.indexOf(
  "function GeneralAIStartCard(",
);

const cardEnd = dashboard.indexOf(
  "\nfunction ",
  cardStart + 30,
);

const card = dashboard.slice(
  cardStart,
  cardEnd > cardStart
    ? cardEnd
    : dashboard.length,
);

expect(
  card.includes(
    "collectDashboardClipboardFiles(",
  ),
  "Dashboard paste does not collect files.",
);

expect(
  card.includes(
    'getData(\n        "text/plain",',
  ),
  "Dashboard paste does not preserve clipboard text.",
);

expect(
  card.includes(
    "files.slice(0, 100),\n      nextPrompt,",
  ),
  "Pasted files and the exact pasted prompt do not travel together.",
);

expect(
  card.includes(
    "files.slice(0, 100),\n                  prompt,",
  ),
  "The + picker does not carry an already typed question.",
);

const handlerStart = dashboard.indexOf(
  "function handleDashboardAddFiles(",
);

const handlerEnd = dashboard.indexOf(
  "function handleGeneralAiSubmit(",
  handlerStart,
);

expect(
  handlerStart >= 0 && handlerEnd > handlerStart,
  "Dashboard file handoff handler was not found.",
);

const handler = dashboard.slice(
  handlerStart,
  handlerEnd,
);

for (const marker of [
  'promptOverride = ""',
  "setPendingAIAttachments(",
  '"new"',
  '"prompt"',
  '"roomId"',
  '"studysnap:pending-general-ai-prompt"',
  "`/general-ai?${params.toString()}`",
]) {
  expect(
    handler.includes(marker),
    `Dashboard file/question handoff is missing: ${marker}`,
  );
}

for (const marker of [
  "takePendingAIAttachments()",
  '"studysnap:pending-general-ai-prompt"',
  "void sendMessage(prompt);",
]) {
  expect(
    chat.includes(marker),
    `General AI receive/auto-start marker is missing: ${marker}`,
  );
}

console.log(
  "PASS: Dashboard paste carries files and text "
  + "into a fresh General AI answer.",
);

console.log(
  "PASS: Dashboard + picker carries an already typed question.",
);
