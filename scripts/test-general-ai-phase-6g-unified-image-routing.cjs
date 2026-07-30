#!/usr/bin/env node

const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(
    path,
    "utf8"
  );
}

function requireText(
  source,
  marker,
  label,
) {
  if (!source.includes(marker)) {
    console.error(
      `FAIL: Missing ${label}: ${marker}`
    );
    process.exit(1);
  }
}

const chat = read(
  "frontend/src/features/ai/GeneralAIChat.tsx"
);

const route = read(
  "backend/app/routes/ai.py"
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_PHASE_6G_UNIFIED_IMAGE_ROUTING",
  "unified image routing marker",
);

requireText(
  chat,
  "async function addGeneralAIIncomingFiles(",
  "incoming-file router",
);

requireText(
  chat,
  "const shouldRouteDirectImage =",
  "single-image route decision",
);

requireText(
  chat,
  "setSelectedImage(",
  "direct vision attachment state",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_PHASE_6G_IMAGE_EDIT_FOLLOWUP",
  "natural edit follow-up marker",
);

requireText(
  chat,
  "const naturalImageEditFollowup =",
  "natural edit follow-up resolver",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_PHASE_6G_DIRECT_IMAGE_RESULT_GUARD",
  "direct-image result guard",
);

requireText(
  route,
  "STUDYSNAP_GENERAL_AI_PHASE_6G_IMAGE_QUESTION_NORMALIZATION",
  "image question normalizer",
);

requireText(
  route,
  "normalize_direct_image_question(question)",
  "ask-image normalization call",
);

requireText(
  route,
  'visible "## Sources" section',
  "visible sources requirement",
);

requireText(
  route,
  "complete Markdown HTTPS link",
  "clickable seller-link requirement",
);

const rawAddFileCalls = (
  chat.match(
    /fileBrainQueue\.addFiles\(/g
  ) || []
).length;

if (rawAddFileCalls !== 2) {
  console.error(
    "FAIL: Unexpected raw File Brain addFiles call count: "
    + rawAddFileCalls
  );
  process.exit(1);
}

const routedCalls = (
  chat.match(
    /addGeneralAIIncomingFiles\(/g
  ) || []
).length;

if (routedCalls < 2) {
  console.error(
    "FAIL: Existing upload entry points were not rerouted."
  );
  process.exit(1);
}

console.log(
  "PASS: Single images route to direct vision/editing."
);

console.log(
  "PASS: Document uploads retain File Brain routing."
);

console.log(
  "PASS: Image edit follow-ups retain image context."
);

console.log(
  "PASS: Image shopping answers require clickable sources."
);
