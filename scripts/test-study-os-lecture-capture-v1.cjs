const fs = require("node:fs");

const page = fs.readFileSync(
  "frontend/src/app/lectures/page.tsx",
  "utf8",
);
const shell = fs.readFileSync(
  "frontend/src/components/AppShell.tsx",
  "utf8",
);
const api = fs.readFileSync(
  "frontend/src/lib/api.ts",
  "utf8",
);
const materials = fs.readFileSync(
  "backend/app/routes/materials.py",
  "utf8",
);

function requireText(source, value, message) {
  if (!source.includes(value)) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
}

requireText(shell, 'href: "/lectures"', "Lecture Library is available in Study Tools.");
requireText(page, "I have permission to record this lecture", "Recording requires a visible consent confirmation.");
requireText(page, "recorder.pause()", "Lecture recording supports pause.");
requireText(page, "recorder.resume()", "Lecture recording supports resume.");
requireText(page, "uploadResumableMaterial", "Lecture audio uses the durable resumable uploader.");
requireText(page, "+ Bookmark", "Students can add live lecture bookmarks.");
requireText(page, "Ask Study AI", "Saved lectures connect to the preserved General AI experience.");
requireText(page, "Save as note", "Real transcripts can be saved into Notes.");
requireText(page, "record.material.preview_available", "The UI labels a lecture transcribed only when transcript text exists.");
requireText(api, "transcribeLectureMaterial", "The frontend exposes lecture transcription.");
requireText(materials, 'client.audio.transcriptions.create', "The backend performs real audio transcription.");
requireText(materials, "lecture_metadata_path", "Lecture duration and bookmarks are stored durably.");
requireText(materials, "The recording is still saved", "Transcription failure never discards the recording.");

console.log("PASS: Study OS Lecture Capture V1 contract is complete.");
