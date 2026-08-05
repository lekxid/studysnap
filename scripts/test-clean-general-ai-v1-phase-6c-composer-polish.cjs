#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(
  process.cwd(),
  "frontend/src/features/ai/GeneralAIChat.tsx"
);

if (!fs.existsSync(file)) {
  console.error("FAIL: GeneralAIChat.tsx is missing.");
  process.exit(1);
}

const source = fs.readFileSync(file, "utf8");

const required = [
  "<form\n        suppressHydrationWarning",
  "<textarea\n            suppressHydrationWarning",
  'd="M12 5v14M5 12h14"',
  'aria-label="Attach photos and files"',
];

for (const marker of required) {
  if (!source.includes(marker)) {
    console.error(`FAIL: Missing ${marker}`);
    process.exit(1);
  }
}

const attachmentStart = source.indexOf(
  'aria-label="Attach photos and files"'
);

const attachmentEnd = source.indexOf(
  "</button>",
  attachmentStart
);

const attachmentBlock = source.slice(
  attachmentStart,
  attachmentEnd
);

if (attachmentBlock.includes("＋")) {
  console.error(
    "FAIL: Unstable Unicode plus remains in the attachment button."
  );
  process.exit(1);
}

console.log(
  "PASS: Attachment button uses the SVG plus icon."
);

console.log(
  "PASS: Composer hydration guards are present."
);
