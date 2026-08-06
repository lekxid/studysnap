const fs = require("node:fs");

const config = fs.readFileSync("backend/app/config.py", "utf8");
const provider = fs.readFileSync(
  "backend/app/services/base_ai_provider.py",
  "utf8",
);
const aiService = fs.readFileSync(
  "backend/app/services/ai_service.py",
  "utf8",
);
const brain = fs.readFileSync(
  "backend/app/services/brain/answer.py",
  "utf8",
);

function need(source, text, message) {
  if (!source.includes(text)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

need(provider, "STUDYSNAP_BASE_AI_PROVIDER_V1", "Base AI marker exists.");
need(
  config,
  'studysnap_base_ai_policy: str = "local_first"',
  "Local-first policy is configured.",
);
need(provider, "def complete_text(", "Completion interface exists.");
need(provider, "def stream_text(", "Streaming interface exists.");
need(
  aiService,
  'purpose="general_answer"',
  "General answers use Base AI.",
);
need(
  aiService,
  'purpose="general_stream"',
  "General streaming uses Base AI.",
);
need(brain, 'purpose="brain"', "Brain uses Base AI.");
need(
  aiService,
  "_generate_current_web_answer",
  "Web-current routing remains available.",
);

console.log("PASS: StudySnap Base AI Provider V1 contract is complete.");
