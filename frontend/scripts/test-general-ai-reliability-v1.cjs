const fs = require("fs");
const path = require("path");

const root = path.resolve(
  __dirname,
  ".."
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
  );
}

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

const chat = read(
  "src/features/ai/GeneralAIChat.tsx"
);
const cards = read(
  "src/components/ai/ArtifactFileCards.tsx"
);
const api = read("src/lib/api.ts");
const markdown = read(
  "src/components/ui/SimpleMarkdown.tsx"
);
const backendAI = read(
  "../backend/app/routes/ai.py"
);
const artifactService = read(
  "../backend/app/services/artifact_service.py"
);

expect(
  chat.includes(
    "attachmentInput.click()"
  ),
  "The General AI attachment control is not one tap."
);

expect(
  chat.includes(
    "removePendingAttachment"
  ) &&
  chat.includes(
    "Remove ${attachment.name}"
  ),
  "Queued attachments do not have a visible remove control."
);

expect(
  chat.includes(
    "<ArtifactFileCards"
  ),
  "Verified artifact cards are not rendered in General AI."
);

expect(
  cards.includes(
    "getArtifactAccessUrl"
  ) &&
  cards.includes(
    "downloadArtifactFile"
  ) &&
  cards.includes(
    "Open"
  ) &&
  cards.includes(
    "Download"
  ),
  "Artifact cards do not provide real Open and Download actions."
);

expect(
  api.includes(
    "/api/artifacts/"
  ) &&
  api.includes(
    "anchor.download = artifact.filename"
  ),
  "Frontend artifact delivery is not wired to the real API."
);

expect(
  markdown.includes(
    'url.protocol !== "http:"'
  ) &&
  markdown.includes(
    'url.protocol !== "https:"'
  ),
  "External links are not restricted to safe web protocols."
);

expect(
  artifactService.includes(
    "resolve_artifact_export_request"
  ) &&
  artifactService.includes(
    "is_artifact_followup_request"
  ) &&
  artifactService.includes(
    "Never output sandbox:/"
  ),
  "The backend file reliability rules are missing."
);

expect(
  backendAI.includes(
    "recent_user_artifact_requests"
  ) &&
  backendAI.includes(
    ".limit(12)"
  ),
  "General AI does not resolve short file follow-ups from recent context."
);

console.log(
  "PASS: General AI real-file reliability contract verified."
);
