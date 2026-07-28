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

const actions = read(
  "src/components/ai/CentralActionBar.tsx",
);

const intent = read(
  "src/lib/generalAiActionIntent.ts",
);

expect(
  !actions.includes(
    "Press and hold any useful StudySnap reply to open this menu."
  ),
  "Obsolete Study Actions footer still exists.",
);

for (const marker of [
  "onClick={openSheet}",
  'aria-label="Open actions for this StudySnap reply"',
  '"studysnap:open-study-actions"',
  "previewCentralAction",
  "executeCentralAction",
  "undoCentralAction",
]) {
  expect(
    actions.includes(marker),
    `Central Action safeguard missing: ${marker}`,
  );
}

for (const forbidden of [
  "anchorRef",
  '"pointerdown"',
  '"pointermove"',
  '"pointerup"',
  '"contextmenu"',
  "navigator.vibrate",
]) {
  expect(
    !actions.includes(forbidden),
    `Hold-down behavior returned: ${forbidden}`,
  );
}

for (const marker of [
  'confidence: "high"',
  '"save_note"',
  '"create_flashcards"',
  '"create_quiz"',
  '"add_to_planner"',
  "the last explanation",
  "(?:schedule|plan)",
  "(?:quiz|test)",
  "(?:\\\\d+\\\\s+)?",
  "[a-z0-9 ]+\\\\s+room",
  "text.length > 180",
]) {
  expect(
    intent.includes(marker),
    `Natural action engine marker missing: ${marker}`,
  );
}

expect(
  !intent.includes("semantic intent always succeeds"),
  "The detector must not claim uncertain semantic actions are guaranteed.",
);

console.log(
  "PASS: Central Action Reliability V1 Max Phase 1 verified.",
);
