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
  "STUDYSNAP_GENERAL_AI_COMPARISON_OPTION_EDIT_V2_10_3",
  "type ComparisonImageEditSource = {",
  "requestedComparisonImageIndex(",
  "asksForComparisonImageEdit(",
  "resolveComparisonImageForEdit(",
  "referenceOverride: ComparisonImageEditSource | null = null",
  "referenceOverride?.file ||",
  "referenceOverride.preview",
  "referenceOverride.name",
  "comparisonImageEditRequested",
  "comparisonImageToEdit",
  "stoppedImageTask.referenceOverride",
]) {
  expect(
    chat.includes(marker),
    `Chat contains ${marker}`,
  );
}

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
    [
      "const referenceImage =",
      "      referenceOverride?.file ||",
      "      explicitReference ||",
      "      queuedReference ||",
      "      previousReference;",
    ].join("\n")
  ),
  "The selected comparison option has source priority.",
);

expect(
  createBlock.includes(
    "referenceOverride,"
  ),
  "Interrupted tasks preserve the comparison source.",
);

expect(
  createBlock.includes(
    "referenceOverride.preview"
  ),
  "The selected comparison preview is preserved.",
);

expect(
  createBlock.includes(
    "referenceOverride.name"
  ),
  "The selected comparison filename is preserved.",
);

const submitStart = chat.indexOf(
  "async function handleSubmit(",
);

const submitEnd = chat.indexOf(
  "function startNewTrail(",
  submitStart,
);

expect(
  submitStart >= 0
  && submitEnd > submitStart,
  "handleSubmit can be isolated.",
);

const submitBlock = chat.slice(
  submitStart,
  submitEnd,
);

expect(
  submitBlock.includes(
    "await resolveComparisonImageForEdit("
  ),
  "Submit resolves Option A/B before normal routing.",
);

expect(
  submitBlock.includes(
    "comparisonImageToEdit,"
  ),
  "Submit passes the exact source into image editing.",
);

expect(
  submitBlock.includes(
    "StudySnap could not reopen Option A."
  )
  && submitBlock.includes(
    "StudySnap could not reopen Option B."
  ),
  "Missing sources cannot fall through to fake text advice.",
);

for (const marker of [
  "STUDYSNAP_GENERAL_AI_COMPARISON_LABEL_LAYOUT_V2_10_3",
  "white-space: nowrap",
  "minmax(5rem, 5.75rem)",
  "word-break: normal",
]) {
  expect(
    css.includes(marker),
    `Comparison CSS contains ${marker}`,
  );
}
