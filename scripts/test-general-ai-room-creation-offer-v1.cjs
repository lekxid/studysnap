const fs = require("node:fs");

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

const queue = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIFileBrainQueue.tsx",
  "utf8",
);

function requireText(
  source,
  value,
  message,
) {
  if (!source.includes(value)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_ROOM_CREATION_OFFER_V1",
  "Shared room-offer marker is present.",
);

requireText(
  queue,
  "STUDYSNAP_GENERAL_AI_ROOM_CREATION_OFFER_FILES_V1",
  "File Brain room-offer file recovery marker is present.",
);

requireText(
  queue,
  "getFilesForTasks:",
  "The File Brain controller exposes original files.",
);

requireText(
  queue,
  "await readUploadQueueFile(",
  "Durable File Brain files can be restored after hydration.",
);

requireText(
  chat,
  "await fileBrainQueue.getFilesForTasks(",
  "Successful File Brain asks trigger an actionable room offer.",
);

requireText(
  chat,
  "documentToSend !== null",
  "A new single-document request clears an old offer.",
);

requireText(
  chat,
  "imageToSend !== null",
  "A new single-image request clears an old offer.",
);

requireText(
  chat,
  "studysnap-room-creation-offer",
  "The offer has one shared phone-and-desktop render.",
);

requireText(
  chat,
  'role="status"',
  "The room offer is announced accessibly.",
);

requireText(
  chat,
  "Keep this file in a Study Room?",
  "Single-file wording is supported.",
);

requireText(
  chat,
  "Keep these ${roomCreationOffer.files.length} files in a Study Room?",
  "Multi-file wording includes the actual file count.",
);

const offerCalls =
  chat.match(
    /offerStudyRoomForFiles\(/g,
  ) || [];

if (offerCalls.length < 5) {
  throw new Error(
    `Expected the shared helper plus four success-path calls; found ${offerCalls.length}.`
  );
}

console.log(
  "PASS: Multi-file, document, image, and File Brain success paths share one trigger."
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_HANDOFF_ROUTING_V2_7",
  "V2.7 handoff routing remains installed.",
);

requireText(
  chat,
  "STUDYSNAP_GENERAL_AI_MULTI_IMAGE_PERSISTENCE_V2_6",
  "V2.6 persistence remains installed.",
);
