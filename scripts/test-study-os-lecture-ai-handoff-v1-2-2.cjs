const fs = require("fs");

const page = fs.readFileSync(
  "frontend/src/app/lectures/page.tsx",
  "utf8",
);

function requireText(value, message) {
  if (!page.includes(value)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function rejectText(value, message) {
  if (page.includes(value)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

const askStart = page.indexOf("  async function askStudyAI(");
const askEnd = page.indexOf("\n  async function saveTranscriptAsNote(", askStart);
if (askStart < 0 || askEnd < 0) {
  console.error("FAIL: Ask Study AI function could not be isolated.");
  process.exit(1);
}
const askStudyAI = page.slice(askStart, askEnd);

function rejectFromAskStudyAI(value, message) {
  if (askStudyAI.includes(value)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

requireText(
  "STUDYSNAP_LECTURE_AI_TRANSCRIPT_HANDOFF_V1_2_2",
  "Lecture AI transcript handoff marker is present.",
);
requireText(
  'transcribeLectureMaterial(record.material.id)',
  "An untranscribed lecture is transcribed before Study AI opens.",
);
requireText(
  'const transcriptFile = new File(',
  "Study AI receives a text transcript file.",
);
requireText(
  'type: "text/plain"',
  "The handoff uses a supported text MIME type.",
);
requireText(
  'if (handoffId !== null) return;',
  "Repeated clicks cannot create duplicate handoffs.",
);
requireText(
  'disabled={handoffId !== null}',
  "The Ask Study AI button is disabled while preparing the transcript.",
);
rejectFromAskStudyAI(
  "getStudyMaterialBlob(record.material.id)",
  "Raw lecture audio is never attached to General AI.",
);
rejectFromAskStudyAI(
  'blob.type || "audio/webm"',
  "The unsupported audio fallback is removed from the Study AI handoff.",
);
requireText(
  "getStudyMaterialBlob(material.id)",
  "Audio playback keeps its required blob loader.",
);

console.log("PASS: Lecture to Study AI handoff V1.2.2 is complete.");
