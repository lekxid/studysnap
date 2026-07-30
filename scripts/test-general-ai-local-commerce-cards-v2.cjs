#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const chat = fs.readFileSync(
  path.join(
    root,
    "frontend/src/features/ai/GeneralAIChat.tsx",
  ),
  "utf8",
);

const css = fs.readFileSync(
  path.join(
    root,
    "frontend/src/app/globals.css",
  ),
  "utf8",
);

function expect(
  condition,
  message,
) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }

  console.log(`PASS: ${message}`);
}

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_LOCAL_COMMERCE_CARDS_V2",
  ),
  "Local commerce parser and cards are connected.",
);

expect(
  chat.includes(
    "parseLocalCommerceResult(",
  )
  && chat.includes(
    "<LocalCommerceCards",
  ),
  "Commerce answers bypass ordinary Markdown.",
);

expect(
  chat.includes(
    "https://www.google.com/maps/search/",
  ),
  "Directions use a Google Maps search destination.",
);

expect(
  chat.includes(
    "data-studysnap-inline-image-message",
  ),
  "Image turns expose transparent-layout state.",
);

expect(
  chat.includes(
    "data-studysnap-commerce-result",
  ),
  "Commerce turns expose compact-result state.",
);

expect(
  css.includes(
    "STUDYSNAP_GENERAL_AI_LOCAL_COMMERCE_CARDS_CSS_V2",
  ),
  "Commerce and transparent image CSS is connected.",
);

expect(
  css.includes(
    'article[data-studysnap-inline-image-message="true"]',
  )
  && css.includes(
    "background: transparent !important;",
  ),
  "Image-and-question turns match the page background.",
);

expect(
  css.includes(
    ".studysnap-commerce-action"
  )
  && css.includes(
    ".studysnap-commerce-card"
  ),
  "Seller and Directions cards are styled.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_PHASE_6G_UNIFIED_IMAGE_ROUTING",
  ),
  "Existing image routing remains present.",
);

expect(
  chat.includes(
    "requestId: imageRequestId",
  ),
  "Existing Stop and Continue controls remain connected.",
);
