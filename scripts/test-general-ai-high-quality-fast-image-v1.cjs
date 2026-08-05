const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

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
  "STUDYSNAP_GENERAL_AI_HIGH_QUALITY_FAST_IMAGE_V1_1",
  "prepareImageForFastHighQualityEdit(",
  "preparedImageEditCache",
  "const preparedReferencePromise =",
  "const requestReferenceImage =",
  "function HighQualityImageActivityCanvas({",
  "const assistantImageActivity =",
  "const assistantActivityPreview =",
  "<HighQualityImageActivityCanvas",
]) {
  expect(
    chat.includes(marker),
    `Chat contains ${marker}`,
  );
}

expect(
  chat.includes(
    "const imageRequestQuality:"
  )
  && chat.includes(
    '? "high"'
  )
  && chat.includes(
    ': "medium"'
  ),
  "Adaptive quality keeps high available while normal work uses medium.",
);

expect(
  chat.includes(
    "quality:\n              0.96"
  ),
  "HEIC and JPEG preparation uses quality 0.96.",
);

expect(
  chat.includes(
    "maximumEdge =\n          2560"
  ),
  "Large images retain up to a 2560-pixel edge.",
);

expect(
  chat.includes(
    "imageSmoothingQuality =\n          \"high\""
  ),
  "Browser resizing uses high-quality smoothing.",
);

expect(
  chat.includes(
    "preparedImageEditCache.set("
  )
  && chat.includes(
    "preparedImageEditCache.get("
  ),
  "Prepared sources are reused for follow-up edits.",
);

const createStart = chat.indexOf(
  "async function createGeneratedImage(",
);

const createEnd = chat.indexOf(
  "async function sendMessage(",
  createStart,
);

expect(
  createStart >= 0
  && createEnd > createStart,
  "createGeneratedImage can be isolated.",
);

const createBlock = chat.slice(
  createStart,
  createEnd,
);

expect(
  createBlock.includes(
    "const preparedReferencePromise ="
  )
  && createBlock.includes(
    "const requestReferenceImage ="
  )
  && createBlock.includes(
    "prepareImageForFastHighQualityEdit("
  )
  && createBlock.includes(
    "quickImageEditRequested"
  )
  && createBlock.includes(
    "await editAIImage("
  ),
  "Fast preparation remains scoped to the real image workflow.",
);

expect(
  (
    chat.match(
      /const preparedReferencePromise =/g
    )
    || []
  ).length === 1,
  "The preparation promise is not inserted into another workflow.",
);

const activityIndex = chat.indexOf(
  "const assistantActivity =",
);

const imageActivityIndex = chat.indexOf(
  "const assistantImageActivity =",
);

const returnIndex = chat.indexOf(
  "                  return (",
  activityIndex,
);

expect(
  activityIndex >= 0
  && imageActivityIndex > activityIndex
  && returnIndex > imageActivityIndex,
  "Image activity state is declared inside the correct message scope.",
);

for (const marker of [
  "STUDYSNAP_GENERAL_AI_HIGH_QUALITY_FAST_IMAGE_V1_1",
  ".studysnap-hq-image-canvas",
  ".studysnap-hq-image-source",
  ".studysnap-hq-image-dots",
  ".studysnap-hq-image-scan",
  "@media (prefers-reduced-motion: reduce)",
]) {
  expect(
    css.includes(marker),
    `CSS contains ${marker}`,
  );
}

const componentStart = chat.indexOf(
  "function HighQualityImageActivityCanvas({",
);

const componentEnd = chat.indexOf(
  "function AIActivityIndicator({",
  componentStart,
);

const component = chat.slice(
  componentStart,
  componentEnd,
);

expect(
  !component.includes("progress:"),
  "The activity canvas does not invent a percentage.",
);

expect(
  !component.includes("Searching the web"),
  "The activity canvas does not claim fake web research.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_LATEST_IMAGE_NATURAL_EDIT_V1"
  )
  && chat.includes(
    "STUDYSNAP_GENERAL_AI_LIVE_IMAGE_JUMP_V1"
  ),
  "Natural image editing and existing navigation remain connected.",
);
