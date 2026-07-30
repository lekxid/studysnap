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
  "STUDYSNAP_GENERAL_AI_LIVE_IMAGE_JUMP_V1",
  "STUDYSNAP_GENERAL_AI_SIMPLE_LATEST_JUMP_V1_3",
  "fileToLiveImagePreview(",
  "const liveImagePreview =",
  "let assistantFound = false;",
  "if (!assistantFound)",
  "focusLatestMessageAfterRender();",
  "showJumpToLatest",
  "function jumpToLatestResult()",
  "distanceFromBottom > 280",
  "studysnap-jump-latest-button",
  'aria-label="Jump to latest result"',
  "60_000",
]) {
  expect(
    chat.includes(marker),
    `Chat contains ${marker}`,
  );
}

for (const forbidden of [
  "studysnap-jump-to-result",
  "const jumpTargets =",
  "function jumpToResult(",
  "Jump to test",
  'aria-label="Jump to a previous test result"',
]) {
  expect(
    !chat.includes(forbidden),
    `Old dropdown is removed: ${forbidden}`,
  );
}

const scrollStart = chat.indexOf(
  "function handleChatScroll()",
);

const scrollEnd = chat.indexOf(
  "\n  useEffect(",
  scrollStart,
);

expect(
  scrollStart >= 0
  && scrollEnd > scrollStart,
  "Scroll handler can be isolated.",
);

const scrollBlock = chat.slice(
  scrollStart,
  scrollEnd,
);

expect(
  scrollBlock.includes(
    "distanceFromBottom > 280"
  )
  && scrollBlock.includes(
    "setShowJumpToLatest("
  ),
  "The arrow only appears when the user is far from the latest result.",
);

const composerStart = chat.indexOf(
  "function renderComposer(",
);

const composerEnd = chat.indexOf(
  "\n  return (\n    <section",
  composerStart,
);

expect(
  composerStart >= 0
  && composerEnd > composerStart,
  "Composer can be isolated.",
);

const composer = chat.slice(
  composerStart,
  composerEnd,
);

expect(
  !composer.includes(
    "studysnap-jump-to-result"
  ),
  "The composer no longer contains the large dropdown.",
);

expect(
  composer.includes(
    "await handleMultipleAttachmentChange("
  )
  && composer.includes(
    'picker.value = "";'
  ),
  "The file picker still resets after every upload attempt.",
);

expect(
  chat.includes(
    "roomCreationOffer.status !=="
  )
  && chat.includes(
    "60_000"
  ),
  "Completed file UI auto-hides after one minute.",
);

expect(
  (
    chat.match(
      /studysnap-jump-latest-button/g
    )
    || []
  ).length >= 2,
  "The small latest-result button is wired into phone and desktop layouts.",
);

expect(
  chat.includes(
    "current?.status ===\n                \"ready\""
  ),
  "The timer only dismisses a ready offer, not an active creation.",
);

for (const marker of [
  "STUDYSNAP_GENERAL_AI_SIMPLE_LATEST_JUMP_V1_3",
  "studysnap-jump-latest-button",
  "position: absolute",
  "left: 50%",
]) {
  expect(
    css.includes(marker),
    `CSS contains ${marker}`,
  );
}

for (const marker of [
  "STUDYSNAP_GENERAL_AI_COMPARISON_OPTION_EDIT_V2_10_5",
  "STUDYSNAP_GENERAL_AI_ADAPTIVE_IMAGE_COMPARISON_V2_9_2",
  "STUDYSNAP_GENERAL_AI_ROOM_CREATION_OFFER_V1",
]) {
  expect(
    chat.includes(marker),
    `Previous feature remains installed: ${marker}`,
  );
}
