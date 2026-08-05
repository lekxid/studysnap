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

const start = chat.indexOf(
  "async function createGeneratedImage(",
);

const end = chat.indexOf(
  "async function sendMessage(",
  start,
);

expect(
  start >= 0
  && end > start,
  "createGeneratedImage can be isolated.",
);

const create = chat.slice(
  start,
  end,
);

for (const marker of [
  "STUDYSNAP_GENERAL_AI_IMAGE_PROGRESS_COMPLETION_V1",
  "const imageStageTimers: number[] = [];",
  "const queueImageStage = (",
  "Preparing your edit",
  "Creating the result",
  "Refining details",
  "Still working",
  "Finalizing your image",
  'label: "Almost done"',
  'label: "Image ready"',
  "setCanStopCurrent(false);",
  "setLoading(false);",
  "void refreshTrails(",
  "[StudySnap image trail refresh]",
]) {
  expect(
    create.includes(marker),
    `Image workflow contains ${marker}`,
  );
}

expect(
  !create.includes(
    "await refreshTrails(\n        conversationId\n      );"
  ),
  "Finished images do not wait for the trail refresh.",
);

const readyIndex = create.indexOf(
  'label: "Image ready"',
);

const backgroundRefreshIndex =
  create.indexOf(
    "void refreshTrails(",
  );

expect(
  readyIndex >= 0
  && backgroundRefreshIndex > readyIndex,
  "The user-facing task completes before background refresh.",
);

expect(
  create.includes(
    "imageStageTimers.forEach("
  )
  && create.includes(
    "window.clearTimeout("
  ),
  "Stage timers are cleared on every exit path.",
);

expect(
  !create.includes("progress: 12,")
  && !create.includes("progress: 30,")
  && !create.includes("progress: 55,")
  && !create.includes("progress: 90,"),
  "Elapsed stages do not invent percentages.",
);

for (const previous of [
  "STUDYSNAP_GENERAL_AI_LIVE_IMAGE_JUMP_V1",
  "STUDYSNAP_GENERAL_AI_HIGH_QUALITY_FAST_IMAGE_V1_1",
  "STUDYSNAP_GENERAL_AI_PROFESSIONAL_IMAGE_EXPERIENCE_V1_1",
]) {
  expect(
    chat.includes(previous),
    `Previous image feature remains installed: ${previous}`,
  );
}
