const fs = require(
  "node:fs"
);
const path = require(
  "node:path"
);

const frontend = path.resolve(
  __dirname,
  ".."
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(
      frontend,
      relativePath
    ),
    "utf8"
  );
}

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

const chat = read(
  "src/features/ai/GeneralAIChat.tsx"
);

const queue = read(
  "src/features/ai/GeneralAIFileBrainQueue.tsx"
);

const viewer = read(
  "src/components/ai/AttachmentPreviewButton.tsx"
);

const backend = fs.readFileSync(
  path.resolve(
    frontend,
    "..",
    "backend/app/routes/file_brain_ai.py"
  ),
  "utf8"
);

expect(
  !chat.includes(
    "files.length === 1 && isImageAttachment"
  ),
  "A single image still bypasses File Brain."
);

expect(
  chat.includes(
    "await fileBrainQueue.addFiles"
  ) &&
  chat.includes(
    "await addComposerFiles"
  ),
  "Normal picker, paste, and drop are not connected."
);

expect(
  !/const compactQueueTasks\s*=[\s\S]{0,900}?\.slice\(\s*0\s*,\s*8\s*\)/.test(
    chat
  ),
  "The compact attachment row still hides items after eight."
);

const composerViewerIndex =
  chat.indexOf(
    'groupId="composer-file-brain-attachments"'
  );

const composerSelectionIndex =
  chat.indexOf(
    "fileBrainQueue.toggleSelected",
    composerViewerIndex
  );

expect(
  composerViewerIndex >= 0 &&
  composerSelectionIndex >
    composerViewerIndex &&
  chat.includes(
    "task.previewUrl"
  ) &&
  chat.includes(
    'className="h-9 w-9 shrink-0 rounded-lg"'
  ),
  "The image viewer is not beside the Included control."
);

expect(
  chat.includes(
    "studysnap-message-attachment-gallery"
  ) &&
  chat.includes(
    "overflow-x-auto"
  ),
  "Sent attachments are not displayed as a compact gallery."
);

expect(
  queue.includes(
    "previewUrl?: string"
  ) &&
  queue.includes(
    "createTaskPreview"
  ) &&
  queue.includes(
    "URL.createObjectURL"
  ),
  "File Brain image previews are not generated."
);

expect(
  queue.includes(
    "serializeQueueTask"
  ) &&
  queue.includes(
    "releaseTaskPreview"
  ) &&
  queue.includes(
    "URL.revokeObjectURL"
  ),
  "Preview URLs are not safely persisted and released."
);

expect(
  /let\s+nextTask\s*:\s*GeneralAIFileBrainTask\s*=/.test(
    queue
  ),
  "Hydrated queue tasks do not preserve the full task type."
);

expect(
  queue.includes(
    "preview?: string"
  ) &&
  /preview:\s*task\.previewUrl/.test(
    queue
  ),
  "The File Brain display attachment type does not carry image previews."
);

const displayHelperMatches =
  queue.match(
    /export\s+function\s+buildFileBrainDisplayAttachments\s*\(/g
  ) ?? [];

expect(
  displayHelperMatches.length === 1 &&
  !/\bexport\s+export\s+function\b/.test(
    queue
  ) &&
  /preview:\s*task\.previewUrl/.test(
    queue
  ) &&
  /}\s*\n\s*\nexport\s+type\s+FileBrainQueueNode/.test(
    queue
  ),
  "The exact display helper replacement is incomplete."
);

expect(
  viewer.includes(
    "handleViewerTouchStart"
  ) &&
  viewer.includes(
    "handleViewerTouchEnd"
  ) &&
  viewer.includes(
    "Math.abs(deltaX) < 48"
  ),
  "The attachment viewer does not support deliberate swipe navigation."
);

expect(
  backend.includes(
    "Read and compare all selected material together."
  ),
  "The backend multi-file comparison contract is missing."
);

expect(
  chat.includes(
    "fileBrainQueue.selectedReadyItems"
  ) &&
  chat.includes(
    "fileBrainQueue.askItems"
  ),
  "Included File Brain items are not connected to the AI request."
);

console.log(
  "PASS: General AI attachment context V14 backend-venv-safe verified."
);
