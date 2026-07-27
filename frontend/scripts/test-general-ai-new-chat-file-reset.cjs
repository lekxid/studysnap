const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/features/ai/GeneralAIChat.tsx",
  ),
  "utf8",
);

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

for (const marker of [
  "GENERAL_AI_HIDDEN_FILE_QUEUE_KEY",
  "studysnap:general-ai-hidden-file-queue-v1",
  "hiddenFileQueueTaskIds",
  "startFreshQueueHandledRef",
  "hideFileQueueForNewConversation",
  "!hiddenFileQueueTaskIds.has(",
  "fileBrainQueue.clearSelection();",
  "window.localStorage.setItem(",
  "window.localStorage.removeItem(",
]) {
  expect(
    source.includes(marker),
    `Missing new-chat file reset marker: ${marker}`,
  );
}

const helperStart = source.indexOf(
  "function hideFileQueueForNewConversation",
);

const helperEnd = source.indexOf(
  "function startNewTrail",
  helperStart,
);

expect(
  helperStart >= 0 && helperEnd > helperStart,
  "New-chat file reset helper was not found.",
);

const helper = source.slice(
  helperStart,
  helperEnd,
);

for (const forbidden of [
  "pauseTask(",
  "cancelTask(",
  "resumeTask(",
  "retryTask(",
]) {
  expect(
    !helper.includes(forbidden),
    `New chat interrupts a background upload: ${forbidden}`,
  );
}

expect(
  helper.includes('"ready"')
    && helper.includes('"duplicate"')
    && helper.includes('"failed"')
    && helper.includes('"cancelled"'),
  "Finished queue items are not cleaned up.",
);

const newTrailStart = source.indexOf(
  "function startNewTrail",
);

const newTrailEnd = source.indexOf(
  "async function resetCurrentChat",
  newTrailStart,
);

const newTrail = source.slice(
  newTrailStart,
  newTrailEnd,
);

expect(
  newTrail.includes(
    "hideFileQueueForNewConversation();",
  ),
  "New conversation does not clear the composer queue.",
);

expect(
  source.includes(
    "if (!startFresh)",
  )
    && source.includes(
      "!fileBrainQueue.hydrated",
    ),
  "Mobile ?new=1 flow does not wait for queue hydration.",
);

console.log(
  "PASS: New conversation clears visible "
  + "files while background uploads continue.",
);
