const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

function requireText(
  value,
  message,
) {
  if (!chat.includes(value)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

requireText(
  "STUDYSNAP_GENERAL_AI_ADAPTIVE_IMAGE_COMPARISON_V2_9_2",
  "V2.9.2 marker is present.",
);

requireText(
  'label.replace(" ", "\\\\s*")',
  "The comparison label inserts a real whitespace regex.",
);

if (
  chat.includes(
    'label.replace(" ", "\\\\\\\\s*")'
  )
) {
  throw new Error(
    "The comparison label is still over-escaped."
  );
}

console.log(
  "PASS: The old literal-backslash matcher is gone."
);

const buildSectionRegex = (
  label,
) =>
  new RegExp(
    `\\b${label.replace(" ", "\\s*")}\\s*:`,
    "i",
  );

const sample = [
  "VERDICT: Option B",
  "MODE: PHOTO",
  "OPTION A:",
  "Clarity: Clear first photo.",
  "Lighting: Natural light.",
  "Framing: Close-up.",
  "Highlights: Relaxed setting.",
  "Concerns: Busy background.",
  "OPTION B:",
  "Clarity: Sharper second photo.",
  "Lighting: Balanced indoor light.",
  "Framing: Wider context.",
  "Highlights: Strong visual detail.",
  "Concerns: Slight motion blur.",
  "REASON: Option B has better clarity and framing.",
].join("\n");

if (
  !buildSectionRegex(
    "Option A"
  ).test(sample)
) {
  throw new Error(
    "The corrected matcher does not detect OPTION A."
  );
}

console.log(
  "PASS: The corrected matcher detects OPTION A."
);

if (
  !buildSectionRegex(
    "Option B"
  ).test(sample)
) {
  throw new Error(
    "The corrected matcher does not detect OPTION B."
  );
}

console.log(
  "PASS: The corrected matcher detects OPTION B."
);

requireText(
  "const strictSegmentA =",
  "The parser still creates a distinct Option A segment.",
);

requireText(
  "const strictSegmentB =",
  "The parser still creates a distinct Option B segment.",
);

requireText(
  "!segmentA.trim()",
  "The original Option A safety guard remains present.",
);

requireText(
  "!segmentB.trim()",
  "The original Option B safety guard remains present.",
);

requireText(
  "MODE\\s*:\\s*(PRODUCT|LISTING|PHOTO|IMAGE|GENERAL)",
  "Adaptive product/photo mode detection remains installed.",
);

requireText(
  "<ImageComparisonResultCard",
  "The adaptive card render remains connected.",
);

requireText(
  "const completedOfferFileCount =",
  "Completed file totals remain connected to the room offer.",
);

requireText(
  "STUDYSNAP_GENERAL_AI_ROOM_CREATION_OFFER_V1",
  "Study Room offers remain installed.",
);

requireText(
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_PERSISTENCE_V2_6",
  "Multi-image persistence remains installed.",
);
