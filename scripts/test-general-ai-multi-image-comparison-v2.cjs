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
    "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_COMPARISON_V2",
  ),
  "Multi-image comparison V2 is connected.",
);

expect(
  chat.includes(
    "<MessageAttachmentCarousel"
  )
  && chat.includes(
    "studysnap-image-carousel-count"
  ),
  "Carousel and image count are rendered.",
);

expect(
  chat.includes(
    "Option A"
  )
  && chat.includes(
    "Option B"
  ),
  "Images and comparisons use Option A/B labels.",
);

expect(
  chat.includes(
    "latestImagePairMessage"
  )
  && chat.includes(
    "comparisonAttachments"
  ),
  "Comparison scope resolves only the current or latest image pair.",
);

expect(
  chat.includes(
    "sanitizeComparisonContent"
  )
  && chat.includes(
    "comparison\\s+of\\s+files"
  )
  && chat.includes(
    "\\bfiles?\\b"
  ),
  "Filename-heavy comparison headings are sanitized.",
);

expect(
  chat.includes(
    "<ImageComparisonResultCard"
  )
  && chat.includes(
    "Best overall:"
  ),
  "Winner-first comparison UI is connected.",
);

expect(
  css.includes(
    "scroll-snap-type: x mandatory"
  )
  && css.includes(
    "overscroll-behavior-x: contain"
  ),
  "Image swipes stay inside a snap carousel.",
);

expect(
  css.includes(
    "scroll-padding-top: 6.5rem"
  )
  && css.includes(
    "scroll-padding-bottom: 8.75rem"
  ),
  "Sticky header and composer safe spacing are connected.",
);

expect(
  css.includes(
    "STUDYSNAP_GENERAL_AI_LOCAL_COMMERCE_CARDS_CSS_V3",
  ),
  "Local Commerce V3 remains present.",
);

expect(
  chat.includes(
    "requestId: imageRequestId",
  ),
  "Stop and Continue remain connected.",
);
