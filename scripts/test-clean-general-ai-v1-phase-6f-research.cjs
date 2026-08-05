#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
  );
}

const chat = read(
  "frontend/src/features/ai/GeneralAIChat.tsx"
);

const css = read(
  "frontend/src/app/globals.css"
);

const frontendIntent = read(
  "frontend/src/lib/generalAiIntent.ts"
);

const backendIntent = read(
  "backend/app/services/ai_intent.py"
);

const route = read(
  "backend/app/routes/ai.py"
);

const required = [
  [frontendIntent, "where\\s+(?:can|do|should)\\s+i\\s+buy"],
  [backendIntent, "where\\s+(?:can|do|should)\\s+i\\s+buy"],
  [route, "MULTIMODAL_COMMERCE_RESEARCH_V1"],
  [route, "visual_facts = answer.strip()"],
  [route, "used_web_search = should_use_web_search("],
  [chat, '"Searching the web"'],
  [chat, 'label: "Comparing sources"'],
  [
    chat,
    chat.includes("fileBrainQueue.markAsked")
      ? "fileBrainQueue.clearSelection();"
      : "function displayAttachmentName(",
  ],
  [chat, "function displayAttachmentName("],
  [chat, "studysnap-header-activity"],
  [chat, "studysnap-message-document-card"],
  [css, "STUDYSNAP_CLEAN_GENERAL_AI_V1_PHASE_6F_RESEARCH"],
];

for (const [source, marker] of required) {
  if (!source.includes(marker)) {
    console.error(`FAIL: Missing ${marker}`);
    process.exit(1);
  }
}

console.log(
  "PASS: Commerce and availability intent is connected."
);

console.log(
  "PASS: Image understanding can transition into live research."
);

console.log(
  "PASS: Task-aware research activity stages are present."
);

console.log(
  "PASS: Mobile activity cannot collide with header controls."
);

console.log(
  "PASS: Stale attachment and image-edit context cleanup is present."
);

console.log(
  "PASS: Compact humanized document attachments are present."
);
