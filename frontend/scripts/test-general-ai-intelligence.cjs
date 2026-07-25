const fs = require("node:fs");
const path = require("node:path");

const frontend = path.resolve(
  __dirname,
  "..",
);

const chat = fs.readFileSync(
  path.join(
    frontend,
    "src/features/ai/GeneralAIChat.tsx",
  ),
  "utf8",
);

const api = fs.readFileSync(
  path.join(
    frontend,
    "src/lib/api.ts",
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
    "function hasExplicitImageGenerationRequest("
  ),
  "Strict image intent gate missing.",
);

expect(
  chat.includes(
    "allowPreviousReference = false"
  ),
  "Previous-image permission missing.",
);

expect(
  chat.includes(
    "!allowPreviousReference"
  ),
  "Old image remains enabled automatically.",
);

expect(
  chat.includes(
    "buildRecentImageContext("
  ),
  "Recent image context missing.",
);

expect(
  chat.includes(
    "setIdentityReferenceImage(null)"
  ),
  "Stale identity cleanup missing.",
);

expect(
  chat.includes(
    "setActivityStartedAt(null)"
  ),
  "Activity start time is not cleared.",
);

expect(
  chat.includes(
    "activitySessionRef.current = null"
  ),
  "Activity session is not released.",
);

expect(
  api.includes(
    "context_messages:"
  ),
  "Image context API payload missing.",
);

expect(
  api.includes(
    "URL.createObjectURL(blob)"
  ),
  "Blob-based mobile download missing.",
);

console.log(
  "PASS: General AI intelligence contract verified."
);
