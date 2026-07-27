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
  'aria-label="File upload queue"',
  'aria-live="polite"',
  "fileBrainQueue.pauseTask(",
  "fileBrainQueue.resumeTask(",
  "fileBrainQueue.retryTask(",
  "fileBrainQueue.cancelTask(",
  "fileBrainQueue.dismissTask(",
  "fileBrainQueue.toggleSelected(",
  "task.status === \"uploading\"",
  "task.status === \"paused\"",
  "task.status === \"failed\"",
  "Paused ·",
  "Retry available",
  "title=\"Pause\"",
  "title=\"Resume\"",
  "title=\"Retry\"",
  "title=\"Cancel\"",
  "title=\"Dismiss\"",
]) {
  expect(
    source.includes(marker),
    `Missing File Brain queue control: ${marker}`,
  );
}

expect(
  source.indexOf(
    "fileBrainQueue.pauseTask("
  ) <
    source.indexOf(
      "fileBrainQueue.resumeTask("
    ),
  "Queue control order is unexpected.",
);

console.log(
  "PASS: General AI File Brain queue "
  + "controls are connected.",
);
