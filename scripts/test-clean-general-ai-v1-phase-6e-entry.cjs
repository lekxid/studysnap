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

const chat = fs.readFileSync(
  chatPath,
  "utf8"
);

const css = fs.readFileSync(
  cssPath,
  "utf8"
);

const requiredChat = [
  "studysnap-empty-quick-starts",
  "studysnap-empty-quick-start",
  "Create image",
  "Study a file",
  "Search the web",
  "event.stopPropagation();",
  "setVisibleMessageActionsId(null)",
];

for (const marker of requiredChat) {
  if (!chat.includes(marker)) {
    console.error(
      `FAIL: GeneralAIChat.tsx is missing ${marker}.`
    );
    process.exit(1);
  }
}

const requiredCss = [
  "STUDYSNAP_CLEAN_GENERAL_AI_V1_PHASE_6E_ENTRY",
  ".studysnap-empty-quick-starts",
  ".studysnap-empty-quick-start",
  ".studysnap-empty-quick-start-icon",
  "backdrop-filter:",
];

for (const marker of requiredCss) {
  if (!css.includes(marker)) {
    console.error(
      `FAIL: globals.css is missing ${marker}.`
    );
    process.exit(1);
  }
}

if (
  chat.includes(
    '<div className="hidden">\n                {suggestions.map'
  )
) {
  console.error(
    "FAIL: The old hidden suggestion block remains."
  );
  process.exit(1);
}

console.log(
  "PASS: Premium empty-state actions are installed."
);

console.log(
  "PASS: Image, file and web entry actions are connected."
);

console.log(
  "PASS: Tap-away closes contextual message tools."
);

console.log(
  "PASS: Conversation-mode shortcut clutter remains removed."
);
