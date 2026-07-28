const fs = require("node:fs");
const path = require("node:path");

const chat = fs.readFileSync(
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
  "function hideFileBrainTaskIds(",
  "GENERAL_AI_HIDDEN_FILE_QUEUE_KEY",
  "const previouslyAskedTaskIds =",
  '"Ready for another question."',
  "hideFileBrainTaskIds(",
]) {
  expect(
    chat.includes(marker),
    `Missing used-file cleanup marker: ${marker}`,
  );
}

const helperStart = chat.indexOf(
  "function hideFileBrainTaskIds(",
);

const helperEnd = chat.indexOf(
  "function hideFileQueueForNewConversation(",
  helperStart,
);

expect(
  helperStart >= 0
    && helperEnd > helperStart,
  "Used-file hiding helper was not found.",
);

const helper = chat.slice(
  helperStart,
  helperEnd,
);

for (const marker of [
  "new Set(",
  "setHiddenFileQueueTaskIds(",
  "window.localStorage.setItem(",
  "JSON.stringify([...next])",
]) {
  expect(
    helper.includes(marker),
    `Used-file hiding helper is incomplete: ${marker}`,
  );
}

expect(
  !helper.includes(
    "fileBrainQueue.dismissTask(",
  ),
  "Used files are being deleted instead of only hidden.",
);

const sendStart = chat.indexOf(
  "async function sendMessage(",
);

const sendEnd = chat.indexOf(
  "function ",
  sendStart + 30,
);

const sendBlock = chat.slice(
  sendStart,
  sendEnd > sendStart
    ? sendEnd
    : chat.length,
);

const markAskedIndex = sendBlock.indexOf(
  "fileBrainQueue.markAsked(",
);

const hideIndex = sendBlock.indexOf(
  "hideFileBrainTaskIds(",
  markAskedIndex,
);

expect(
  markAskedIndex >= 0,
  "File Brain success marker was not found.",
);

expect(
  hideIndex > markAskedIndex,
  "Used file chips are not hidden after a successful answer.",
);

expect(
  sendBlock
    .slice(
      hideIndex,
      hideIndex + 220,
    )
    .includes(
      "task.localId",
    ),
  "The successful task IDs are not sent to the hiding helper.",
);

const effectStart = chat.indexOf(
  "const previouslyAskedTaskIds =",
);

expect(
  effectStart >= 0,
  "Existing asked-task migration was not found.",
);

const effect = chat.slice(
  Math.max(0, effectStart - 180),
  effectStart + 650,
);

expect(
  effect.includes(
    '"Ready for another question."',
  ),
  "Previously used tasks are not recognized after refresh.",
);

expect(
  effect.includes(
    "hideFileBrainTaskIds(",
  ),
  "Previously used tasks are not hidden after hydration.",
);

expect(
  chat.includes(
    "!hiddenFileQueueTaskIds.has(",
  ),
  "Hidden queue IDs are not connected to composer visibility.",
);

console.log(
  "PASS: Used files leave the composer after send and refresh.",
);

console.log(
  "PASS: Stored File Brain files are preserved.",
);
