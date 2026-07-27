const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/components/ai/CentralActionBar.tsx",
  ),
  "utf8",
);

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

expect(
  source.includes("onClick={openSheet}"),
  "One-tap StudySnap action button is missing.",
);

expect(
  source.includes(
    'aria-label="Open actions for this StudySnap reply"',
  ),
  "Accessible action-button label is missing.",
);

expect(
  source.includes(
    '"studysnap:open-study-actions"',
  ),
  "Natural command action event is missing.",
);

expect(
  source.includes(
    "void beginAction(",
  ),
  "Action selection flow is missing.",
);

for (const forbidden of [
  "anchorRef",
  '"pointerdown"',
  '"pointermove"',
  '"pointerup"',
  '"pointercancel"',
  '"pointerleave"',
  '"contextmenu"',
  "navigator.vibrate",
]) {
  expect(
    !source.includes(forbidden),
    `Hold-down behavior remains: ${forbidden}`,
  );
}

console.log(
  "PASS: Central actions are tap-only.",
);
