const fs = require("node:fs");

const backend = fs.readFileSync(
  "backend/app/routes/ai.py",
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
    "STUDYSNAP_GENERAL_AI_ADAPTIVE_IMAGE_SPEED_V1_3"
  ),
  "Backend adaptive-speed V1.3 marker is present.",
);

expect(
  backend.includes(
    "requested_quality = ("
  )
  && backend.includes(
    "clean_quality = ("
  )
  && backend.includes(
    '"quality": clean_quality'
  ),
  "The backend respects low, medium, or high edit quality.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_ADAPTIVE_IMAGE_SPEED_V1_3"
  ),
  "Frontend adaptive-speed V1.3 marker is present.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_QUICK_EDIT_PROGRESS_COMPAT_V1"
  )
  && chat.includes(
    "Quick Edit finished. StudySnap is "
  )
  && chat.includes(
    "saving it into this conversation."
  ),
  "Quick Edit truthful persistence activity is restored.",
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

const create = chat.slice(
  createStart,
  createEnd,
);

expect(
  create.includes(
    "const maximumImageQuality ="
  )
  && create.includes(
    "const imageRequestQuality:"
  ),
  "Image quality is selected from the user's wording.",
);

expect(
  create.includes(
    "const requestImageSize ="
  )
  && create.includes(
    "standardImageEditSize("
  ),
  "Normal edits use standard professional dimensions.",
);

expect(
  (
    create.match(
      /quality:\s*imageRequestQuality/g
    )
    || []
  ).length === 2,
  "Adaptive quality reaches edit and generation requests.",
);

expect(
  create.includes(
    "size: requestImageSize"
  ),
  "The reduced edit size reaches the image API.",
);

if (
  create.includes(
    "await quickEditAIImage("
  )
) {
  expect(
    create.indexOf(
      "await quickEditAIImage("
    )
    < create.indexOf(
      "await editAIImage("
    ),
    "Quick Edit remains ahead of the generative editor.",
  );
}

for (const marker of [
  "STUDYSNAP_GENERAL_AI_IMAGE_PROGRESS_COMPLETION_V1",
  "STUDYSNAP_GENERAL_AI_HIGH_QUALITY_FAST_IMAGE_V1_1",
  "STUDYSNAP_GENERAL_AI_PROFESSIONAL_IMAGE_EXPERIENCE_V1_1",
  "STUDYSNAP_GENERAL_AI_LATEST_IMAGE_NATURAL_EDIT_V1",
]) {
  expect(
    chat.includes(marker),
    `Previous image feature remains installed: ${marker}`,
  );
}
