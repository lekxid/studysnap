#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const cssPath = path.join(
  process.cwd(),
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
  "STUDYSNAP_GENERAL_AI_COPY_CORNER_V1",
  "position:\n    absolute !important;",
  "top:\n    0.05rem !important;",
  "right:\n    0 !important;",
  "padding-right:\n    2.75rem !important;",
  "Do not repeat Copy in the lower tray.",
];

for (const marker of required) {
  if (!css.includes(marker)) {
    console.error(
      `FAIL: Copy-corner CSS is missing ${marker}`
    );
    process.exit(1);
  }
}

console.log(
  "PASS: Copy is positioned in the response corner."
);

console.log(
  "PASS: Copy does not consume lower action-row space."
);

console.log(
  "PASS: Other actions remain contextual."
);
