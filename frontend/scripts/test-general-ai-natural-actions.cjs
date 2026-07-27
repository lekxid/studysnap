const fs = require("node:fs");
const path = require("node:path");

const frontend = path.resolve(
  __dirname,
  "..",
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      frontend,
      relativePath,
    ),
    "utf8",
  );
}

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

const intent = read(
  "src/lib/generalAiActionIntent.ts",
);

const chat = read(
  "src/features/ai/GeneralAIChat.tsx",
);

const actions = read(
  "src/components/ai/CentralActionBar.tsx",
);

for (const actionType of [
  "save_note",
  "create_flashcards",
  "create_quiz",
  "add_to_planner",
]) {
  expect(
    intent.includes(
      `"${actionType}"`
    ),
    `Missing intent: ${actionType}`,
  );
}

expect(
  intent.includes(
    "text.length > 180"
  ),
  "Natural-action length guard is missing.",
);

expect(
  !intent.includes(
    "quiz me"
  ),
  "Interactive quiz requests must not be converted into saved quizzes.",
);

expect(
  chat.includes(
    "detectGeneralAIActionIntent"
  ),
  "General AI does not use the action detector.",
);

expect(
  chat.includes(
    "findLatestActionTargetMessage"
  ),
  "General AI does not resolve the latest real answer.",
);

expect(
  chat.includes(
    '"studysnap:open-study-actions"'
  ) &&
  chat.includes(
    "actionType:"
  ),
  "General AI does not open the requested action flow.",
);

expect(
  chat.includes(
    "attachmentsToSend.length === 0"
  ) &&
  chat.includes(
    "fileBrainItemsToSend.length === 0"
  ),
  "Attached-file requests are not protected from action interception.",
);

expect(
  actions.includes(
    "requestedAction"
  ) &&
  actions.includes(
    "customEvent.detail?.actionType"
  ),
  "Central Action Bar cannot receive a requested action.",
);

expect(
  actions.includes(
    "previewCentralAction"
  ) &&
  actions.includes(
    "executeCentralAction"
  ) &&
  actions.includes(
    "undoCentralAction"
  ),
  "Preview, confirmation, and undo safeguards were removed.",
);

expect(
  actions.includes(
    "selectedRoomId ??"
  ) &&
  actions.includes(
    "preferredStudyRoomId"
  ),
  "Preferred Study Room is not reused for natural actions.",
);

console.log(
  "PASS: General AI natural actions contract verified."
);
