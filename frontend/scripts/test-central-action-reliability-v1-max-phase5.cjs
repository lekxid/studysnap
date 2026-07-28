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

const actionBar = read(
  "src/components/ai/CentralActionBar.tsx",
);

const draft = read(
  "src/lib/centralActionDraftPersistence.ts",
);

for (const marker of [
  "DRAFT_PREFIX",
  "CentralActionDraft",
  "readCentralActionDraft",
  "persistCentralActionDraft",
  "clearCentralActionDraft",
  "setupAction",
  "selectedRoomId",
  "plannerSubject",
  "plannerDate",
  "plannerDuration",
  "plannerPriority",
]) {
  expect(
    draft.includes(marker),
    `Draft marker missing: ${marker}`,
  );
}

for (const marker of [
  "useRef",
  "readCentralActionDraft(",
  "persistCentralActionDraft(",
  "clearCentralActionDraft(",
  "saveCurrentDraft();",
  "Draft saves automatically",
  "discardCurrentDraft",
  "pageScrollYRef.current",
  "window.visualViewport",
  "--studysnap-action-sheet-height",
  'data-studysnap-mobile-action-sheet="stable"',
  "touch-pan-y",
]) {
  expect(
    actionBar.includes(marker),
    `Mobile flow marker missing: ${marker}`,
  );
}

expect(
  actionBar.includes(
    'event.key === "Escape"\n'
      + "        && !busy\n"
      + "        && !setupAction"
  ),
  "Escape must not dismiss an active form.",
);

expect(
  actionBar.includes(
    'setOpen(false);\n'
      + "        setRequestedRoomHint(null);"
  ),
  "Escape must close without an unstable hook dependency.",
);

expect(
  actionBar.includes(
    "event.currentTarget\n"
      + "                  && !busy\n"
      + "                  && !setupAction"
  ),
  "Backdrop must not dismiss an active form.",
);

for (const safeguard of [
  "readPersistedCentralAction",
  "persistCentralAction",
  "buildCentralActionIdempotencyKey",
  "previewCentralAction",
  "executeCentralAction",
  "undoCentralAction",
  "selectGeneralAIActionRoom",
  "customEvent.detail?.plannerDraft",
  "openHref",
  ".can_undo",
]) {
  expect(
    actionBar.includes(safeguard),
    `Existing safeguard was lost: ${safeguard}`,
  );
}

console.log(
  "PASS: Central Action Reliability V1 Max Phase 5 verified.",
);
