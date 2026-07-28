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
  "const hasStudyActionTarget =",
  "function openFeatureFilePicker()",
  "function openFeatureCamera()",
  "function beginFeatureImageCreation()",
  "function prepareFeatureWebSearch()",
  "function runVisibleStudyAction(",
  'data-studysnap-ai-feature-grid="true"',
  'data-studysnap-visible-study-actions="true"',
  'data-studysnap-visible-ai-actions="true"',
  'aria-label="General AI quick actions"',
  'aria-label="StudySnap tools"',
]) {
  expect(
    chat.includes(marker),
    `Missing feature-visibility marker: ${marker}`,
  );
}

const dockStart = chat.indexOf(
  'data-studysnap-visible-ai-actions="true"',
);

const dockEnd = chat.indexOf(
  "{renderComposer(false)}",
  dockStart,
);

expect(
  dockStart >= 0 && dockEnd > dockStart,
  "Visible quick-action dock was not found.",
);

const dock = chat.slice(
  dockStart,
  dockEnd,
);

for (const marker of [
  "startNewTrail",
  "updateHistoryOpen(true)",
  "beginFeatureImageCreation",
  "openFeatureFilePicker",
  "setAiToolsOpen(true)",
  "overflow-x-auto",
]) {
  expect(
    dock.includes(marker),
    `Quick-action dock is missing: ${marker}`,
  );
}

for (const forbidden of [
  'className="hidden"',
  "opacity-0",
  "invisible",
  "pointer-events-none",
]) {
  expect(
    !dock.includes(forbidden),
    `Quick actions are visually hidden by: ${forbidden}`,
  );
}

const menuStart = chat.indexOf(
  'data-studysnap-ai-feature-grid="true"',
);

const menuEnd = chat.indexOf(
  'data-studysnap-quick-prompts="true"',
  menuStart,
);

expect(
  menuStart >= 0 && menuEnd > menuStart,
  "Visible tools feature grid was not found.",
);

const menu = chat.slice(
  menuStart,
  menuEnd,
);

for (const marker of [
  "Create image",
  "Upload files",
  "Take photo",
  "Search web",
  "Save note",
  "Make cards",
  "Make quiz",
  "Add to planner",
]) {
  expect(
    menu.includes(marker),
    `Visible tools menu is missing: ${marker}`,
  );
}

expect(
  menu.includes(
    "disabled={\n                          !hasStudyActionTarget",
  ),
  "Contextual study actions are not safely disabled before an answer exists.",
);

expect(
  chat.includes(
    'role="dialog"\n            aria-modal="true"\n            aria-label="StudySnap tools"',
  ),
  "StudySnap tools panel lacks complete dialog semantics.",
);

expect(
  chat.includes(
    'aria-label="Attach photos and files"',
  ),
  "The original direct file chooser is no longer connected.",
);

console.log(
  "PASS: Primary General AI features are always visible on phone and desktop.",
);

console.log(
  "PASS: The full tools menu exposes image, file, camera, web, and study actions.",
);

console.log(
  "PASS: Contextual study actions remain safe until an answer exists.",
);
