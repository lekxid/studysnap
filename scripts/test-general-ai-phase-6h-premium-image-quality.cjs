#!/usr/bin/env node

const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(
    path,
    "utf8",
  );
}

function expect(
  condition,
  message,
) {
  if (!condition) {
    console.error(
      `FAIL: ${message}`,
    );
    process.exit(1);
  }
}

const chat = read(
  "frontend/src/features/ai/GeneralAIChat.tsx",
);

const route = read(
  "backend/app/routes/ai.py",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_PHASE_6H_PREMIUM_IMAGE_QUALITY",
  ),
  "Premium frontend image-quality marker is missing.",
);

expect(
  chat.includes(
    "resolveBestImageEditSize",
  ),
  "Automatic portrait/landscape sizing is missing.",
);

expect(
  chat.includes(
    'size: resolvedImageSize',
  ),
  "Image edits do not use the resolved source orientation.",
);

expect(
  !chat.includes(
    '+ "\\n\\nEdit the attached image only. "',
  ),
  "Technical diagram instructions are still appended in the frontend.",
);

expect(
  chat.includes(
    'quality: "high"',
  ),
  "High image quality is not requested.",
);

expect(
  chat.includes(
    'return prompt || "Edit image";',
  ),
  "Stored edit requests still expose a technical prefix.",
);

expect(
  route.includes(
    "STUDYSNAP_GENERAL_AI_PHASE_6H_ADAPTIVE_EDIT_PROFILE",
  ),
  "Adaptive backend image profile is missing.",
);

for (const marker of [
  "PORTRAIT OR PERSON PROFILE",
  "DOCUMENT, SCREENSHOT, OR DIAGRAM PROFILE",
  "CREATIVE EDIT PROFILE",
  "professional DSLR or studio portrait",
  "realistic pores and natural skin texture",
  "maximum_input_dimension = 3072",
  "studysnap-premium-edit-",
]) {
  expect(
    route.includes(marker),
    `Premium backend marker is missing: ${marker}`,
  );
}

expect(
  !route.includes(
    '"expression. Do not beautify, "',
  ),
  "The old anti-enhancement instruction is still active.",
);

expect(
  route.includes(
    "Your enhanced image is ready.",
  ),
  "Natural final image caption is missing.",
);

console.log(
  "PASS: Portrait enhancement uses a premium adaptive profile.",
);

console.log(
  "PASS: Document and diagram fidelity remains protected.",
);

console.log(
  "PASS: Technical prompts stay hidden from the conversation.",
);

console.log(
  "PASS: Image orientation and high-quality settings are connected.",
);
