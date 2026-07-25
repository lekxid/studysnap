const fs = require("node:fs");
const path = require("node:path");

const history = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/components/ai/StudyTrailPanel.tsx",
  ),
  "utf8",
);

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

expect(
  history.includes("MOBILE_DELETE_CONTROLS_V1"),
  "Mobile delete marker is missing.",
);

expect(
  history.includes("overflow-visible rounded-xl"),
  "Chat action row can still be clipped.",
);

expect(
  history.includes("grid grid-cols-3 gap-2"),
  "Touch action row is missing.",
);

expect(
  history.includes("event.stopPropagation();"),
  "Delete tap isolation is missing.",
);

expect(
  history.includes("h-11 w-full touch-manipulation"),
  "Mobile-size delete target is missing.",
);

expect(
  chat.includes("MOBILE_DELETE_FEEDBACK_V1"),
  "Delete feedback marker is missing.",
);

expect(
  chat.includes('"Chat deleted."'),
  "Single delete feedback is missing.",
);

expect(
  chat.includes("Deleted ${deletedIds.size} chat"),
  "Bulk delete feedback is missing.",
);

expect(
  chat.includes('role="status"'),
  "Accessible success toast is missing.",
);

expect(
  (chat.match(/z-\[280\]/g) || []).length >= 2,
  "Delete dialogs are not above mobile overlays.",
);

console.log(
  "PASS: Mobile delete controls verified."
);
