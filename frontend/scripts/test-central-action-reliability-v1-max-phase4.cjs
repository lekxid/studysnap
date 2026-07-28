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

const persistence = read(
  "src/lib/centralActionPersistence.ts",
);

for (const marker of [
  "STORAGE_PREFIX",
  "readPersistedCentralAction",
  "persistCentralAction",
  "clearPersistedCentralAction",
  "buildCentralActionIdempotencyKey",
  "stableValue",
  "shortHash",
  "getCentralActionResultTitle",
  "getCentralActionSubtitle",
  "getCentralActionResultDetail",
  "source_message_id",
]) {
  expect(
    persistence.includes(marker),
    `Persistence marker missing: ${marker}`,
  );
}

for (const marker of [
  "getCentralAction(",
  "readPersistedCentralAction(",
  "persistCentralAction(",
  "buildCentralActionIdempotencyKey(",
  '"online"',
  "Retry safely",
  'data-studysnap-persistent-action-result="true"',
  "getCentralActionResultTitle(",
  "getCentralActionSubtitle(",
  "getCentralActionResultDetail(",
]) {
  expect(
    actionBar.includes(marker),
    `Action Bar Phase 4 marker missing: ${marker}`,
  );
}

for (const safeguard of [
  "previewCentralAction",
  "executeCentralAction",
  "undoCentralAction",
  "result.duplicate",
  "selectGeneralAIActionRoom",
  "customEvent.detail?.plannerDraft",
  "openHref",
  ".can_undo",
]) {
  expect(
    actionBar.includes(safeguard),
    `Existing action safeguard was lost: ${safeguard}`,
  );
}

expect(
  persistence.includes(
    "record.source_message_id !=="
  ),
  "Cached actions must be scoped to the exact message.",
);

expect(
  persistence.includes(
    '"general-ai-v1"'
  ),
  "Stable idempotency key namespace is missing.",
);

console.log(
  "PASS: Central Action Reliability V1 Max Phase 4 verified.",
);
