const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(
  __dirname,
  "..",
);

const chat = fs.readFileSync(
  path.join(
    root,
    "src/features/ai/GeneralAIChat.tsx",
  ),
  "utf8",
);

const panel = fs.readFileSync(
  path.join(
    root,
    "src/components/ai/AIActivityPanel.tsx",
  ),
  "utf8",
);

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

expect(
  chat.includes(
    'from "@/components/ai/AIActivityPanel"',
  ),
  "Activity panel import missing.",
);

expect(
  chat.includes("<AIActivityPanel"),
  "Activity panel is not rendered.",
);

expect(
  chat.includes(
    "function startActivitySession()",
  ),
  "Activity session start missing.",
);

expect(
  chat.includes(
    "function recordActivity(",
  ),
  "Activity recorder missing.",
);

expect(
  chat.includes(
    "function completeActivitySession()",
  ),
  "Activity completion missing.",
);

expect(
  !chat.includes("setActivity({"),
  "Direct activity object updates remain.",
);

expect(
  panel.includes('role="dialog"'),
  "Accessible dialog missing.",
);

expect(
  panel.includes(
    "Stop current response",
  ),
  "Stop action missing.",
);

expect(
  panel.includes("overflow-y-auto"),
  "Scrollable timeline missing.",
);

console.log(
  "PASS: General AI Activity contract verified.",
);
