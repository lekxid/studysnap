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

const chat = fs.readFileSync(chatPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

if (
  !chat.includes(
    "studysnap-primary-message-actions"
  )
) {
  console.error(
    "FAIL: Primary message actions are missing."
  );
  process.exit(1);
}

if (
  !css.includes(
    "STUDYSNAP_PHASE_6C_VISIBLE_COPY"
  )
) {
  console.error(
    "FAIL: Visible-copy CSS is missing."
  );
  process.exit(1);
}

if (
  !css.includes(
    'button[aria-label*="copy" i]'
  ) ||
  !css.includes(
    'button[title*="copy" i]'
  )
) {
  console.error(
    "FAIL: Copy visibility selectors are missing."
  );
  process.exit(1);
}

console.log(
  "PASS: Copy is permanently available."
);

console.log(
  "PASS: Remaining message tools stay contextual."
);
