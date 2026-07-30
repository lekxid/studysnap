const fs = require("node:fs");

const css = fs.readFileSync(
  "frontend/src/app/globals.css",
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

for (const marker of [
  "STUDYSNAP_GENERAL_AI_MOBILE_COMPARISON_LAYOUT_V1_1",
  "@media (max-width: 640px)",
  ".studysnap-comparison-option-grid",
  "grid-template-columns:\n      minmax(0, 1fr) !important",
  ".studysnap-comparison-facts > div",
  "text-align: left !important",
  "overflow-wrap: break-word !important",
]) {
  expect(
    css.includes(marker),
    `CSS contains ${marker}`,
  );
}

const markerIndex = css.lastIndexOf(
  "STUDYSNAP_GENERAL_AI_MOBILE_COMPARISON_LAYOUT_V1_1"
);

const oldTwoColumnIndex = css.lastIndexOf(
  "repeat(\n        2,\n        minmax(0, 1fr)"
);

expect(
  markerIndex > oldTwoColumnIndex,
  "The mobile single-column override comes after the old two-column rule.",
);

expect(
  css.includes(
    "STUDYSNAP_GENERAL_AI_COMPARISON_LABEL_LAYOUT_V2_10_3"
  ),
  "Desktop comparison label layout remains installed.",
);

expect(
  css.includes(
    "STUDYSNAP_GENERAL_AI_SIMPLE_LATEST_JUMP_V1_3"
  ),
  "The simple latest-result arrow remains installed.",
);
