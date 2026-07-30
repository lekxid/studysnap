const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

const backend = fs.readFileSync(
  "backend/app/routes/ai.py",
  "utf8",
);

function requireText(
  source,
  value,
  message,
) {
  if (!source.includes(value)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_ADAPTIVE_IMAGE_COMPARISON_V2_9_1",
  "Frontend adaptive-comparison marker is present.",
);

requireText(
  backend,
  "STUDYSNAP_GENERAL_AI_ADAPTIVE_IMAGE_COMPARISON_V2_9_1",
  "Backend adaptive-comparison marker is present.",
);

requireText(
  chat,
  'type ComparisonMode =',
  "The comparison card supports product and photo modes.",
);

requireText(
  chat,
  '"Clarity"',
  "Photo clarity is displayed.",
);

requireText(
  chat,
  '"Lighting"',
  "Photo lighting is displayed.",
);

requireText(
  chat,
  '"Framing"',
  "Photo framing is displayed.",
);

requireText(
  chat,
  "const exactVerdict =",
  "The exact verdict line drives the recommendation.",
);

requireText(
  chat,
  "const exactReason =",
  "The exact reason line is extracted separately.",
);

requireText(
  chat,
  "!segmentA.trim()",
  "The Option A safety guard remains present.",
);

requireText(
  chat,
  "!segmentB.trim()",
  "The Option B safety guard remains present.",
);

requireText(
  chat,
  "completedOfferFileCount",
  "Completed upload totals remain visible.",
);

requireText(
  backend,
  "MODE: PRODUCT",
  "The backend supports product mode.",
);

requireText(
  backend,
  "MODE: PHOTO",
  "The backend supports photo mode.",
);

requireText(
  backend,
  "Never rank attractiveness",
  "People-image comparisons are limited to photo quality.",
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
    "The uploaded-image carousel could not be isolated."
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
    "Uploaded images still display Option badges."
  );
}

console.log(
  "PASS: Uploaded images remain visually normal."
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_COMPARISON_CARD_FILE_COUNT_V2_8_3",
  "V2.8.3 compatibility marker remains installed.",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_ROOM_CREATION_OFFER_V1",
  "Room creation offers remain installed.",
);
