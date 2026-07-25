const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
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
  source.includes(
    "GENERAL_AI_ACTIVE_CONVERSATION_KEY"
  ),
  "Active conversation persistence is missing.",
);

expect(
  source.includes(
    "function rememberedConversationId()"
  ),
  "Conversation URL/session restoration is missing.",
);

expect(
  source.includes(
    "function rememberActiveTrail("
  ),
  "Full trail restoration helper is missing.",
);

expect(
  source.includes(
    "conversationId=${trail.id}"
  ),
  "Conversation ID is not preserved in the URL.",
);

expect(
  source.includes(
    "setActiveStudyRoomId("
  ),
  "Room context is not restored.",
);

expect(
  source.includes(
    "setActiveMaterialId("
  ),
  "Material context is not restored.",
);

expect(
  source.includes(
    "rememberActiveTrail(\n            preferredTrail"
  ),
  "Initialization does not restore the remembered chat.",
);

const selectStart =
  source.indexOf(
    "async function selectTrail("
  );

const selectEnd =
  source.indexOf(
    "async function renameTrail(",
    selectStart,
  );

expect(
  selectStart >= 0 &&
  selectEnd > selectStart,
  "selectTrail boundaries are missing.",
);

const selectSource =
  source.slice(
    selectStart,
    selectEnd,
  );

expect(
  selectSource.includes(
    "rememberActiveTrail("
  ),
  "History selection does not restore context.",
);

expect(
  selectSource.includes(
    "await loadMessages("
  ),
  "History selection does not restore messages.",
);

expect(
  !selectSource.includes(
    "router.push("
  ),
  "History still redirects away from General AI.",
);

expect(
  source.includes(
    "await loadMessages(\n          conversationId"
  ),
  "Artifact results are not refreshed after creation.",
);

console.log(
  "PASS: General AI continuity V2.1 verified."
);
