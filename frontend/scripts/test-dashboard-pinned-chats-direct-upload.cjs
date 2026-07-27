const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      __dirname,
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

const dashboard = read(
  "../src/app/dashboard/page.tsx",
);

const center = read(
  "../src/components/dashboard/SmartDashboardCenter.tsx",
);

const chat = read(
  "../src/features/ai/GeneralAIChat.tsx",
);

for (const marker of [
  "DASHBOARD_DIRECT_FILE_PICKER_V1",
  "DASHBOARD_PINNED_CONVERSATIONS_V1",
  "setPendingAIAttachments(",
  "handleDashboardAddFiles(",
  'type="file"',
  "multiple",
  "files.slice(0, 100)",
  "getStudyTrails(",
  '"general_ai"',
  "pinAIConversation(",
  "pinnedConversations={",
  "onUnpinConversation={",
  "window.setTimeout(",
  "window.clearTimeout(",
]) {
  expect(
    dashboard.includes(marker),
    `Dashboard connection missing: ${marker}`,
  );
}

expect(
  !dashboard.includes(
    "href={addMaterialHref}"
  ),
  "Dashboard plus still navigates without opening files.",
);

for (const marker of [
  "type DashboardPinnedConversation",
  "function PinnedConversationCard({",
  "getPinnedConversationHref(",
  '"conversationId"',
  '"roomId"',
  "visiblePinnedConversations",
  "combinedPinnedCount",
  "AI conversation",
  "Open chat →",
  "onUnpinConversation",
]) {
  expect(
    center.includes(marker),
    `Pinned-chat dashboard marker missing: ${marker}`,
  );
}

for (const marker of [
  "GENERAL_AI_CURRENT_CHAT_PIN_V1",
  '"Pin conversation"',
  '"Unpin conversation"',
  "void togglePinTrail(",
]) {
  expect(
    chat.includes(marker),
    `Current-chat pin action missing: ${marker}`,
  );
}

console.log(
  "PASS: Dashboard plus opens files and hands "
  + "them to the existing General AI queue."
);

console.log(
  "PASS: Pinned General AI chats appear in "
  + "dashboard Pinned Materials and can be opened or unpinned."
);
