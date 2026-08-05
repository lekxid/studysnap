const fs = require("node:fs");

const backend = fs.readFileSync(
  "backend/app/routes/ai.py",
  "utf8",
);

const api = fs.readFileSync(
  "frontend/src/lib/api.ts",
  "utf8",
);

const chat = fs.readFileSync(
  "frontend/src/features/ai/GeneralAIChat.tsx",
  "utf8",
);

function expect(
  condition,
  message,
) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }

  console.log(`PASS: ${message}`);
}

expect(
  backend.includes(
    "STUDYSNAP_GENERAL_AI_QUICK_EDIT_ENGINE_V1_2"
  ),
  "Backend Quick Edit marker is present.",
);

expect(
  backend.includes(
    '@router.post("/quick-edit-image")'
  ),
  "The persistent Quick Edit route is installed.",
);

expect(
  backend.includes(
    "def _quick_image_edit_plan("
  )
  && backend.includes(
    "def _apply_quick_image_edit_plan("
  ),
  "Quick Edit has deterministic planning and processing.",
);

expect(
  backend.includes(
    "store_ai_attachment("
  )
  && backend.includes(
    "serialize_ai_message("
  )
  && backend.includes(
    '"studysnap-quick-edit-v1"'
  ),
  "Quick edits use durable conversation attachment storage.",
);

expect(
  api.includes(
    "export async function quickEditAIImage("
  )
  && api.includes(
    '"/api/ai/quick-edit-image"'
  ),
  "The authenticated frontend Quick Edit API is connected.",
);

expect(
  chat.includes(
    "function shouldUseStudySnapQuickEdit("
  ),
  "Natural quick-adjustment detection is installed.",
);

const createStart = chat.indexOf(
  "async function createGeneratedImage(",
);

const createEnd = chat.indexOf(
  "async function sendMessage(",
  createStart,
);

expect(
  createStart >= 0
  && createEnd > createStart,
  "createGeneratedImage can be isolated.",
);

const createBlock = chat.slice(
  createStart,
  createEnd,
);

expect(
  createBlock.includes(
    "const quickImageEditRequested ="
  ),
  "The image workflow selects Quick Edit automatically.",
);

expect(
  createBlock.indexOf(
    "await quickEditAIImage("
  )
  < createBlock.indexOf(
    "await editAIImage("
  ),
  "Quick Edit runs before the generative model.",
);

expect(
  createBlock.includes(
    "Quick Edit finished. StudySnap is "
  )
  && createBlock.includes(
    "saving it into this conversation."
  ),
  "Quick Edit reports truthful persistence activity.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_LATEST_IMAGE_NATURAL_EDIT_V1"
  )
  && chat.includes(
    "STUDYSNAP_GENERAL_AI_HIGH_QUALITY_FAST_IMAGE_V1_1"
  )
  && chat.includes(
    "STUDYSNAP_GENERAL_AI_PROFESSIONAL_IMAGE_EXPERIENCE_V1_1"
  ),
  "Natural editing and professional generative editing remain connected.",
);
