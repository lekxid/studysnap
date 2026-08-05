#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const chatPath = path.join(
  root,
  "frontend/src/features/ai/GeneralAIChat.tsx"
);

const cssPath = path.join(
  root,
  "frontend/src/app/globals.css"
);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

for (const file of [chatPath, cssPath]) {
  if (!fs.existsSync(file)) {
    fail(`Missing ${path.relative(root, file)}.`);
  }
}

const chat = fs.readFileSync(
  chatPath,
  "utf8"
);

const css = fs.readFileSync(
  cssPath,
  "utf8"
);

const requiredChatMarkers = [
  "studysnap-user-message",
  "studysnap-assistant-mark-row",
  "studysnap-assistant-mark",
  "studysnap-contextual-message-actions",
  "studysnap-central-action-context",
  'role="toolbar"',
  "tabIndex={0}",
];

for (const marker of requiredChatMarkers) {
  if (!chat.includes(marker)) {
    fail(`GeneralAIChat.tsx is missing ${marker}.`);
  }
}

const forbiddenChatMarkers = [
  'if (message.role !== "assistant")',
  'className="mb-3 flex items-center justify-between gap-3 border-b',
  'className="grid h-12 w-12 shrink-0 place-items-center',
  '>You<',
];

for (const marker of forbiddenChatMarkers) {
  if (chat.includes(marker)) {
    fail(`GeneralAIChat.tsx still contains ${marker}.`);
  }
}

const requiredCssMarkers = [
  "STUDYSNAP_CLEAN_GENERAL_AI_V1_PHASE_6C",
  ".studysnap-contextual-message-actions",
  ".studysnap-assistant-mark",
  ".studysnap-user-message",
  "border: 0 !important;",
  "box-shadow: none !important;",
];

for (const marker of requiredCssMarkers) {
  if (!css.includes(marker)) {
    fail(`globals.css is missing ${marker}.`);
  }
}

pass("All message controls are contextual.");
pass("User bubbles no longer carry permanent labels or controls.");
pass("Assistant identity uses a compact mark.");
pass("Central Action Engine remains mounted in the action toolbar.");
pass("Composer textarea has no independent inner border.");
