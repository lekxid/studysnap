const fs = require("node:fs");

const service = fs.readFileSync(
  "backend/app/services/lecture_transcription.py",
  "utf8",
);
const repair = fs.readFileSync(
  "backend/scripts/repair_latest_failed_lecture.py",
  "utf8",
);
const route = fs.readFileSync(
  "backend/app/routes/materials.py",
  "utf8",
);
const page = fs.readFileSync(
  "frontend/src/app/lectures/page.tsx",
  "utf8",
);

function requireText(source, text, message) {
  if (!source.includes(text)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function rejectText(source, text, message) {
  if (source.includes(text)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

requireText(
  service,
  "STUDYSNAP_LOCAL_FIRST_LECTURE_V1_1",
  "StudySnap local-first provider marker is present.",
);
requireText(
  service,
  "def _transcribe_lecture_audio_api_primary(",
  "The verified API engine remains available as fallback.",
);
requireText(
  service,
  "def _studysnap_run_local_transcription(",
  "StudySnap owns a local transcription provider.",
);
requireText(
  service,
  'model=f"studysnap-local/whisper.cpp/{model_name}"',
  "Local transcripts identify StudySnap as their provider.",
);
requireText(
  service,
  "should_try_local = local_enabled",
  "The local StudySnap provider is evaluated first.",
);
requireText(
  route,
  "transcribe_lecture_audio(",
  "The shared lecture route uses the connected provider.",
);
rejectText(
  repair,
  "TRANSCRIPTION_NOT_CONFIGURED",
  "Saved lecture repair no longer requires API billing.",
);
requireText(
  page,
  "STUDYSNAP_LECTURE_AI_TRANSCRIPT_HANDOFF_V1_2_2",
  "The verified Lecture to General AI handoff remains.",
);
requireText(
  page,
  "setPendingAIAttachment(transcriptFile)",
  "The shared transcript continues into General AI.",
);
requireText(
  page,
  "saveTranscriptAsNote",
  "The shared transcript remains connected to Notes.",
);

console.log(
  "PASS: Study OS Local-First Connected Lecture V1.1 contract is complete.",
);
