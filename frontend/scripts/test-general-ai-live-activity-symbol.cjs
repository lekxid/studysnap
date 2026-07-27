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
  "GENERAL_AI_TASK_AWARE_ACTIVITY_V1",
  "function getAIActivityVisual(",
  'symbol: "S"',
  'symbol: "▤"',
  'symbol: "⌕"',
  'symbol: "◇"',
  'symbol: "▣"',
  'symbol: "▦"',
  'symbol: "?"',
  'symbol: "◩"',
  'symbol: "✓"',
  'symbol: "✦"',
  'symbol: "!"',
  'fallbackLabel: "Creating quiz"',
  'fallbackLabel: "Creating cards"',
  'fallbackLabel: "Creating notes"',
  'fallbackLabel: "Organizing"',
  'fallbackLabel: "Finishing"',
  'role="status"',
  'aria-live="polite"',
  "animate-spin",
  "animate-pulse",
  "pendingAssistantActivityLabel(",
  "clearActivityAfter(",
  "stopCurrentResponse()",
  "<AIActivityIndicator",
]) {
  expect(
    chat.includes(marker),
    `Live activity marker missing: ${marker}`,
  );
}

expect(
  (
    chat.match(
      /function AIActivityIndicator\(\{/g
    ) || []
  ).length === 1,
  "AIActivityIndicator must exist once.",
);

console.log(
  "PASS: General AI uses a task-aware live symbol "
  + "inside pending assistant messages."
);
