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
  "STUDYSNAP_GENERAL_AI_COMPARISON_CARD_FILE_COUNT_V2_8_3",
  "V2.8.3 marker is present.",
);

requireText(
  "const hasStructuredComparison =",
  "Structured comparison sections can trigger the card.",
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
  String.raw`\boption\s*a\b[\s\S]*\boption\s*b\b`,
  "Option A and Option B structure is verified before rendering.",
);

requireText(
  "const composerFileCount =",
  "The composer calculates a permanent file count.",
);

requireText(
  "files uploaded",
  "Plural uploaded-file wording is present.",
);

requireText(
  "file uploaded",
  "Singular uploaded-file wording is present.",
);

requireText(
  "composerIncludedCount",
  "The included-file count is displayed.",
);

if (
  chat.includes(
    'task.status === "reading"'
  )
) {
  throw new Error(
    "The file-count logic still checks an unsupported File Brain reading status."
  );
}

console.log(
  "PASS: File-count statuses match the File Brain task type."
);

requireText(
  "attachment.name",
  "Image previews use their normal attachment names.",
);

const carouselStart = chat.indexOf(
  "function MessageAttachmentCarousel("
);

const carouselEnd = chat.indexOf(
  "function ComparisonOptionCard(",
  carouselStart,
);

if (
  carouselStart < 0
  || carouselEnd < 0
) {
  throw new Error(
    "Could not isolate the image carousel."
  );
}

const carousel = chat.slice(
  carouselStart,
  carouselEnd,
);

if (
  carousel.includes(
    "studysnap-image-option-label"
  )
) {
  throw new Error(
    "The uploaded image carousel still renders Option badges."
  );
}

console.log(
  "PASS: Uploaded images remain visually normal."
);

requireText(
  "<ImageComparisonResultCard",
  "The premium comparison card render remains connected.",
);

requireText(
  "STUDYSNAP_GENERAL_AI_ROOM_CREATION_OFFER_V1",
  "The unified room creation offer remains installed.",
);

requireText(
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_HANDOFF_ROUTING_V2_7",
  "Unified handoff routing remains installed.",
);
