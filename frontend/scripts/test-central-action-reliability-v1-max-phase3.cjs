const fs = require("node:fs");
const path = require("node:path");

const frontend = path.resolve(
  __dirname,
  "..",
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(frontend, relativePath),
    "utf8",
  );
}

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

const planner = read(
  "src/lib/generalAiPlannerIntent.ts",
);

const intent = read(
  "src/lib/generalAiActionIntent.ts",
);

const chat = read(
  "src/features/ai/GeneralAIChat.tsx",
);

const actionBar = read(
  "src/components/ai/CentralActionBar.tsx",
);

for (const marker of [
  "parseGeneralAIPlannerDraft",
  "mergeGeneralAIPlannerDateTime",
  "day after tomorrow",
  "\\btomorrow\\b",
  "WEEKDAYS",
  "durationMinutes",
  "high priority",
  "low priority",
  "defaults to evening",
]) {
  expect(
    planner.includes(marker),
    `Planner extractor marker missing: ${marker}`,
  );
}

for (const marker of [
  "GeneralAIPlannerDraft",
  "parseGeneralAIPlannerDraft(",
  "plannerDraft:",
  'actionType ===',
  '"add_to_planner"',
]) {
  expect(
    intent.includes(marker),
    `Intent planner marker missing: ${marker}`,
  );
}

expect(
  chat.includes(
    "actionIntent.plannerDraft"
  ),
  "General AI does not forward the planner draft.",
);

for (const marker of [
  "customEvent.detail?.plannerDraft",
  "mergeGeneralAIPlannerDateTime(",
  "setPlannerDate(",
  "setPlannerDuration(",
  "setPlannerPriority(",
  "Review",
]) {
  expect(
    actionBar.includes(marker),
    `Action sheet planner marker missing: ${marker}`,
  );
}

for (const safeguard of [
  "previewCentralAction",
  "executeCentralAction",
  "undoCentralAction",
  "result.duplicate",
  "selectGeneralAIActionRoom",
]) {
  expect(
    actionBar.includes(safeguard),
    `Existing action safeguard was lost: ${safeguard}`,
  );
}

console.log(
  "PASS: Central Action Reliability V1 Max Phase 3 verified.",
);
