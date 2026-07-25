const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../src/features/ai/GeneralAIChat.tsx",
  ),
  "utf8",
);

function check(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

check(
  source.includes(
    "function detectArtifactExportTarget("
  ),
  "Artifact export detector missing.",
);

check(
  source.includes(
    "async function createPdfFromImage("
  ),
  "Image PDF workflow missing.",
);

check(
  source.includes(
    "pendingAttachments.find("
  ),
  "Queued image must use find(), not some().",
);

check(
  source.includes(
    "queuedImage?.file"
  ),
  "Queued attachment file access missing.",
);

check(
  !source.includes(
    "const queuedImage =\n      pendingAttachments.some("
  ),
  "Queued image is still a boolean.",
);

const artifactIndex =
  source.indexOf(
    'artifactTarget === "pdf"'
  );

const editIndex =
  source.indexOf(
    "asksToEditImage(cleanInput)",
    artifactIndex,
  );

check(
  artifactIndex >= 0 &&
    editIndex > artifactIndex,
  "Image editing still precedes PDF routing.",
);

console.log(
  "PASS: Artifact routing precedence verified."
);
