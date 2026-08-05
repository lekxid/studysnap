const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }

  console.log(`PASS: ${message}`);
}

for (const marker of [
  "STUDYSNAP_GENERAL_AI_LATEST_IMAGE_NATURAL_EDIT_V1",
  "function asksForLatestImageEdit(",
  "function cleanLatestImageEditPrompt(",
  "async function resolveLatestImageForEdit(",
  "const latestImageEditRequested =",
  "const latestImageToEdit =",
  "latestImageToEdit !== null",
  "StudySnap could not reopen the latest recent image.",
  "latestImageToEdit,",
]) {
  expect(
    chat.includes(marker),
    `Chat contains ${marker}`,
  );
}

const resolverStart = chat.indexOf(
  "async function resolveLatestImageForEdit(",
);

const resolverEnd = chat.indexOf(
  "async function resolveComparisonImageForEdit(",
  resolverStart,
);

expect(
  resolverStart >= 0
  && resolverEnd > resolverStart,
  "The latest-image resolver can be isolated.",
);

const resolver = chat.slice(
  resolverStart,
  resolverEnd,
);

for (const marker of [
  "selectedImage",
  "activeComposerImages",
  "selectedQueueTasks",
  "await fileBrainQueue.getFilesForTasks(",
  "messages.slice(-8)",
  "message.attachments?.filter(",
  "message.imagePreview",
  "await imageSourceToFile(",
  "const roomImages =",
]) {
  expect(
    resolver.includes(marker),
    `Resolver contains ${marker}`,
  );
}

const handleStart = chat.indexOf(
  "async function handleSubmit(",
);

let handleEnd = chat.indexOf(
  "\n  function startNewTrail(",
  handleStart,
);

if (handleEnd < 0) {
  handleEnd = chat.indexOf(
    "\n  async function startNewTrail(",
    handleStart,
  );
}

expect(
  handleStart >= 0
  && handleEnd > handleStart,
  "handleSubmit can be isolated.",
);

const handle = chat.slice(
  handleStart,
  handleEnd,
);

const latestIndex = handle.indexOf(
  "latestImageEditRequested\n    )"
);

const genericIndex = handle.indexOf(
  "hasCurrentImage &&\n      asksToEditImage"
);

const createIndex = handle.indexOf(
  "asksToCreateImage("
);

expect(
  latestIndex >= 0
  && genericIndex > latestIndex
  && createIndex > latestIndex,
  "Latest-image editing runs before generic editing and image creation.",
);

expect(
  handle.includes(
    "await resolveLatestImageForEdit()"
  )
  && handle.includes(
    "cleanLatestImageEditPrompt("
  )
  && handle.includes(
    "latestImageToEdit,\n      );"
  ),
  "The exact resolved image is passed into real image editing.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_COMPARISON_OPTION_EDIT_V2_10_5"
  )
  && chat.includes(
    "STUDYSNAP_GENERAL_AI_LIVE_IMAGE_JUMP_V1"
  )
  && chat.includes(
    "STUDYSNAP_GENERAL_AI_SIMPLE_LATEST_JUMP_V1_3"
  ),
  "Previous image features remain connected.",
);
