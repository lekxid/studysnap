#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const cssPath = path.join(
  root,
  "frontend/src/app/globals.css"
);

if (!fs.existsSync(cssPath)) {
  console.error(
    "FAIL: globals.css is missing."
  );
  process.exit(1);
}

const css = fs.readFileSync(
  cssPath,
  "utf8"
);

const required = [
  "STUDYSNAP_CLEAN_GENERAL_AI_V1_PHASE_6D_GLASS",
  "--studysnap-glass-bg",
  ".studysnap-ai-fullscreen-header",
  ".studysnap-contextual-message-actions",
  'button[\n  aria-label*="copy" i\n]',
  ".studysnap-message-actions-open",
  ".studysnap-ai-composer-dock",
  ".studysnap-tools-popover",
  "backdrop-filter:",
];

for (const marker of required) {
  if (!css.includes(marker)) {
    console.error(
      `FAIL: Phase 6D is missing ${marker}.`
    );
    process.exit(1);
  }
}

console.log(
  "PASS: Glass header contract passed."
);

console.log(
  "PASS: Permanent Copy contract passed."
);

console.log(
  "PASS: Contextual glass tray contract passed."
);

console.log(
  "PASS: Glass composer contract passed."
);

console.log(
  "PASS: Glass tools contract passed."
);
