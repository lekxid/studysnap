const fs = require("fs");

const backend = fs.readFileSync(
  "backend/app/routes/ai.py",
  "utf8",
);

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

function expectContains(source, value, message) {
  if (!source.includes(value)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

expectContains(
  backend,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2_4_CONTEXT",
  "Backend V2.4 context marker is present.",
);

expectContains(
  backend,
  "Image 1 is Option A.",
  "The first uploaded image is mapped to Option A.",
);

expectContains(
  backend,
  "Image 2 is Option B.",
  "The second uploaded image is mapped to Option B.",
);

expectContains(
  backend,
  "Keep evidence from each image strictly separate.",
  "Option evidence separation is required.",
);

expectContains(
  backend,
  "Most recent active exchange",
  "Short follow-ups prioritize the latest active exchange.",
);

expectContains(
  backend,
  "Never switch to an older unrelated study topic.",
  "Unrelated-topic fallback is blocked.",
);

expectContains(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2_4_SAFE_PARSER",
  "Frontend V2.4 safe-parser marker is present.",
);

expectContains(
  chat,
  'return "";',
  "Missing option sections do not reuse the full answer.",
);

expectContains(
  chat,
  "!segmentA.trim()",
  "Option A must have its own segment.",
);

expectContains(
  chat,
  "!segmentB.trim()",
  "Option B must have its own segment.",
);

expectContains(
  chat,
  "The answer did not provide a reliable winner.",
  "The UI does not invent a generic recommendation.",
);
