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

const css = fs.readFileSync(
  "frontend/src/app/globals.css",
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
    "STUDYSNAP_GENERAL_AI_PROFESSIONAL_IMAGE_EXPERIENCE_V1_1"
  ),
  "Backend professional-image marker is present.",
);

expect(
  backend.includes(
    'or "gpt-image-2"'
  ),
  "GPT Image 2 is the default generation model.",
);

const requestStart = backend.indexOf(
  "class GenerateImageRequest(BaseModel):",
);

const requestEnd = backend.indexOf(
  "class GenerateFlashcardsRequest",
  requestStart,
);

const requestBlock = backend.slice(
  requestStart,
  requestEnd,
);

expect(
  requestBlock.includes(
    '] = "high"'
  ),
  "Backend generation defaults to high quality.",
);

for (const size of [
  '"1792x1792"',
  '"2048x1536"',
  '"1536x2048"',
]) {
  expect(
    backend.includes(size),
    `Backend supports ${size}`,
  );

  expect(
    api.includes(size),
    `Frontend API supports ${size}`,
  );

  expect(
    chat.includes(size),
    `Edit-size resolver uses ${size}`,
  );
}

expect(
  backend.includes(
    "candidate_size = clean_size"
  )
  && backend.includes(
    '"1792x1792": "1024x1024"'
  )
  && backend.includes(
    '"2048x1536": "1536x1024"'
  )
  && backend.includes(
    '"1536x2048": "1024x1536"'
  ),
  "Legacy model fallback maps professional dimensions safely.",
);

expect(
  backend.includes(
    "When the request is vague"
  )
  && backend.includes(
    "automatically apply a polished "
  )
  && backend.includes(
    "professional photo treatment"
  ),
  "Vague edit commands receive a professional default treatment.",
);

expect(
  api.includes(
    'quality: options.quality || "high"'
  ),
  "Frontend generation defaults to high quality.",
);

const imageActivityStart = chat.indexOf(
  "const assistantImageActivity =",
);

const imageActivityEnd = chat.indexOf(
  "const assistantActivityPreview =",
  imageActivityStart,
);

const imageActivityBlock = chat.slice(
  imageActivityStart,
  imageActivityEnd,
);

expect(
  imageActivityBlock.includes(
    "loading"
  )
  && imageActivityBlock.includes(
    "canStopCurrent"
  )
  && imageActivityBlock.includes(
    "activeImageAssistantIdRef.current === message.id"
  ),
  "The living image canvas requires a submitted active image task.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_IMAGE_ORBIT_DOTS_V1"
  )
  && chat.includes(
    'className="studysnap-hq-image-orbit"'
  ),
  "Rolling border dots are mounted in the active image canvas.",
);

expect(
  css.includes(
    "@keyframes studysnap-hq-image-orbit-roll"
  )
  && css.includes(
    "stroke-dashoffset: -100"
  ),
  "The dotted border continuously travels around the canvas.",
);

expect(
  chat.includes(
    "STUDYSNAP_GENERAL_AI_HIGH_QUALITY_FAST_IMAGE_V1_1"
  )
  && chat.includes(
    "STUDYSNAP_GENERAL_AI_LATEST_IMAGE_NATURAL_EDIT_V1"
  ),
  "Fast preparation and natural edit routing remain connected.",
);
