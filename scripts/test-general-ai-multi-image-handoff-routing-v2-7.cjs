const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

function requireText(
  value,
  message,
) {
  if (!chat.includes(value)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

requireText(
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_HANDOFF_ROUTING_V2_7",
  "V2.7 handoff-routing marker is present.",
);

requireText(
  "const pendingFiles = takePendingAIAttachments();",
  "Startup attachment handoff remains connected.",
);

requireText(
  "void addGeneralAIIncomingFiles(",
  "Startup handoffs use unified image routing.",
);

requireText(
  "pendingFiles.slice(0, 100)",
  "The existing startup handoff capacity remains preserved.",
);

requireText(
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_DIRECT_ROUTING_V2_5_3",
  "Direct multi-image routing remains installed.",
);

requireText(
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_PERSISTENCE_V2_6",
  "Reload persistence remains installed.",
);

const handoffStart = chat.indexOf(
  "const pendingFiles = takePendingAIAttachments();"
);

const handoffEnd = chat.indexOf(
  "consumeGeneralAIStartupUrl();",
  handoffStart,
);

if (
  handoffStart < 0
  || handoffEnd < 0
) {
  throw new Error(
    "The startup handoff block could not be isolated."
  );
}

const handoffBlock = chat.slice(
  handoffStart,
  handoffEnd,
);

if (
  handoffBlock.includes(
    "fileBrainQueue\n      .addFiles("
  )
) {
  throw new Error(
    "Startup image handoffs still call File Brain directly."
  );
}

console.log(
  "PASS: Startup image handoffs no longer bypass /ask-files."
);
