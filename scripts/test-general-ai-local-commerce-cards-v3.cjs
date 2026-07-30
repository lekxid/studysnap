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
    "STUDYSNAP_GENERAL_AI_LOCAL_COMMERCE_CARDS_V3",
  ),
  "Local Commerce V3 renderer is connected.",
);

expect(
  chat.includes(
    "studysnap-user-image-message"
  ),
  "Image messages have a direct transparent class branch.",
);

expect(
  chat.includes(
    'backgroundColor: "#000000"'
  ),
  "Commerce cards guarantee the deep-black background inline.",
);

expect(
  chat.includes(
    "commerceLocationHint"
  )
  && chat.includes(
    '|| "near me"'
  ),
  "Directions remember earlier location or fall back to nearby.",
);

expect(
  chat.includes(
    "https://www.google.com/maps/search/"
  )
  && chat.includes(
    "directionsUrl"
  ),
  "Directions are always generated through Google Maps.",
);

expect(
  chat.includes(
    'message.role === "assistant" &&\n                      !commerceResult'
  ),
  "Commerce results suppress the S marker in JSX.",
);

expect(
  chat.includes(
    'commerceResult\n                            ? {\n                                display: "none"'
  ),
  "Commerce results suppress message actions in JSX.",
);

expect(
  css.includes(
    "STUDYSNAP_GENERAL_AI_LOCAL_COMMERCE_CARDS_CSS_V3",
  ),
  "Local Commerce V3 CSS is connected.",
);

expect(
  css.includes(
    ".studysnap-user-image-message"
  )
  && css.includes(
    "background: transparent !important;"
  ),
  "Image messages blend into the page background.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_PHASE_6G_UNIFIED_IMAGE_ROUTING",
  ),
  "Unified image routing remains present.",
);

expect(
  chat.includes(
    "requestId: imageRequestId",
  ),
  "Stop and Continue controls remain connected.",
);
