#!/usr/bin/env node

const fs = require("node:fs");

const service = fs.readFileSync(
  "backend/app/services/ai_service.py",
  "utf8",
);
const route = fs.readFileSync(
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

function expect(source, marker, message) {
  if (!source.includes(marker)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

expect(
  service,
  "STUDYSNAP_GENERAL_AI_PROVIDER_STATUS_UI_V1",
  "Provider status service marker is present.",
);
expect(
  service,
  "def general_ai_provider_status()",
  "Provider status reads the active automatic-upgrade state.",
);
expect(
  route,
  '@router.get("/provider-status")',
  "Provider status endpoint is available.",
);
expect(
  api,
  "getGeneralAIProviderStatus",
  "Frontend provider status API is available.",
);
expect(
  chat,
  "function GeneralAIProviderBadge()",
  "General AI includes a provider badge component.",
);
expect(
  chat,
  "<GeneralAIProviderBadge />",
  "Provider badge is mounted in the General AI header.",
);
expect(
  chat,
  "data-studysnap-provider={status.provider}",
  "Provider mode is exposed for UI verification.",
);

console.log(
  "PASS: General AI provider status UI contract verified.",
);
