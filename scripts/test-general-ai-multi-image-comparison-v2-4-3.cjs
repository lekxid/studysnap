const fs = require("fs");

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
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2_4_3_ALIASES",
  "V2.4.3 alias marker is present.",
);

requireText(
  '"Image 1"',
  "Image 1 is accepted as Option A.",
);

requireText(
  '"Image 2"',
  "Image 2 is accepted as Option B.",
);

requireText(
  "better option",
  "Better Option verdicts are detected.",
);

requireText(
  "first\\s+image",
  "First image winner wording is supported.",
);

requireText(
  "second\\s+image",
  "Second image winner wording is supported.",
);

requireText(
  "reasonLine",
  "The detailed reason is used in the card.",
);
