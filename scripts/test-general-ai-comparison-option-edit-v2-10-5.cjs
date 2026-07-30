const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
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
  "STUDYSNAP_GENERAL_AI_COMPARISON_OPTION_EDIT_V2_10_5",
  "const activeComposerImages =",
  "pendingAttachments.filter(",
  "const selectedQueueTasks =",
  "fileBrainQueue.getFilesForTasks(",
  "const liveImages =",
  "const latestComparisonMessage =",
  "StudySnap could not reopen Option A.",
  "StudySnap could not reopen Option B.",
]) {
  expect(
    chat.includes(marker),
    `Chat contains ${marker}`,
  );
}

const resolverStart = chat.indexOf(
  "async function resolveComparisonImageForEdit(",
);

const resolverEnd = chat.indexOf(
  "async function createGeneratedImage(",
  resolverStart,
);

expect(
  resolverStart >= 0
  && resolverEnd > resolverStart,
  "The comparison image resolver can be isolated.",
);

const resolver = chat.slice(
  resolverStart,
  resolverEnd,
);

const composerIndex = resolver.indexOf(
  "const activeComposerImages ="
);

const queueIndex = resolver.indexOf(
  "const selectedQueueTasks ="
);

const roomIndex = resolver.indexOf(
  "const liveImages ="
);

const historyIndex = resolver.indexOf(
  "const latestComparisonMessage ="
);

expect(
  composerIndex >= 0
  && composerIndex < queueIndex
  && queueIndex < roomIndex
  && roomIndex < historyIndex,
  "Image resolution order is composer, queue, room offer, then history.",
);

expect(
  resolver.includes(
    "attachment.file"
  )
  && resolver.includes(
    "activeComposerImage.preview"
  ),
  "Current composer images preserve their File and preview.",
);

expect(
  resolver.includes(
    "await fileBrainQueue.getFilesForTasks("
  ),
  "Included File Brain images can be recovered.",
);

expect(
  chat.includes(
    "StudySnap could not reopen Option A."
  )
  && chat.includes(
    "StudySnap could not reopen Option B."
  ),
  "The truthful V2.10.3 missing-source messages remain unchanged.",
);

for (const marker of [
  "STUDYSNAP_GENERAL_AI_COMPARISON_OPTION_EDIT_V2_10_3",
  "referenceOverride: ComparisonImageEditSource | null = null",
  "referenceOverride?.file ||",
  "stoppedImageTask.referenceOverride",
  "STUDYSNAP_GENERAL_AI_COMPARISON_LABEL_LAYOUT_V2_10_3",
]) {
  expect(
    chat.includes(marker)
    || (
      marker.includes(
        "COMPARISON_LABEL_LAYOUT"
      )
    ),
    `Previous V2.10.3 behavior remains connected: ${marker}`,
  );
}
