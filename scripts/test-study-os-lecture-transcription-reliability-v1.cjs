const fs = require("fs");

const service = fs.readFileSync(
  "backend/app/services/lecture_transcription.py",
  "utf8",
);
const route = fs.readFileSync(
  "backend/app/routes/materials.py",
  "utf8",
);
const repair = fs.readFileSync(
  "backend/scripts/repair_latest_failed_lecture.py",
  "utf8",
);

function requireText(source, value, message) {
  if (!source.includes(value)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

function rejectText(source, value, message) {
  if (source.includes(value)) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

requireText(
  service,
  "STUDYSNAP_LECTURE_TRANSCRIPTION_RELIABILITY_V1",
  "Lecture transcription reliability marker is present.",
);
requireText(
  service,
  '"file": (upload_filename, recording, content_type)',
  "The API receives an explicit filename and normalized MIME type.",
);
requireText(
  service,
  '"gpt-4o-mini-transcribe"',
  "The primary transcription model remains supported.",
);
requireText(
  service,
  '"whisper-1"',
  "A model-access fallback is available.",
);
requireText(
  service,
  '"pcm_s16le"',
  "Browser audio can be normalized to a standard WAV file.",
);
requireText(
  service,
  "max_retries=2",
  "Temporary API failures receive bounded automatic retries.",
);
requireText(
  service,
  "The recording is still saved",
  "All user-facing failures preserve the recording truthfully.",
);
requireText(
  route,
  "transcribe_lecture_audio(",
  "The lecture route uses the reliability service.",
);
requireText(
  route,
  'response["normalized_audio"]',
  "The route reports whether browser audio needed normalization.",
);
rejectText(
  route,
  "client.audio.transcriptions.create(",
  "The route no longer performs a fragile direct transcription call.",
);
requireText(
  repair,
  "RETRYING_LECTURE_ID=",
  "The latest failed lecture can be retried automatically.",
);
requireText(
  repair,
  "TRANSCRIPTION_READY_ID=",
  "The automatic repair records successful completion.",
);

console.log("PASS: Study OS Lecture Transcription Reliability V1 contract is complete.");
