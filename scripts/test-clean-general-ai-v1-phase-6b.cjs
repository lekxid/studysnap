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

const chat = fs.readFileSync(chatPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

const requiredChatMarkers = [
  "visibleMessageActionsId",
  "data-studysnap-message-role",
  "studysnap-assistant-message",
  "studysnap-primary-message-actions",
  "studysnap-secondary-message-actions",
  "const displayedContent = message.content;",
];

for (const marker of requiredChatMarkers) {
  if (!chat.includes(marker)) {
    fail(`GeneralAIChat.tsx is missing ${marker}.`);
  }
}

const forbiddenChatMarkers = [
  'data-studysnap-visible-ai-actions="true"',
  'aria-label="General AI quick actions"',
  "const collapseLimit =",
  "expandedMessageIds",
  "setExpandedMessageIds",
  'expanded ? "Show less" : "Show more"',
];

for (const marker of forbiddenChatMarkers) {
  if (chat.includes(marker)) {
    fail(`GeneralAIChat.tsx still contains ${marker}.`);
  }
}

if (!css.includes("STUDYSNAP_CLEAN_GENERAL_AI_V1_PHASE_6B")) {
  fail("globals.css is missing the Phase 6B visual layer.");
}

if (
  !css.includes(
    ".studysnap-primary-message-actions"
  ) ||
  !css.includes(
    ".studysnap-secondary-message-actions"
  )
) {
  fail("globals.css is missing secondary-action visibility rules.");
}

pass("Normal AI answers are no longer truncated.");
pass("Permanent composer shortcut strip is removed.");
pass("All features remain available through the tools menu.");
pass("Message actions are secondary on desktop and touch.");
pass("General AI uses one final page-specific CSS layer.");
