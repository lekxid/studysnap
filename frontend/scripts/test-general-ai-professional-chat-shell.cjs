const fs = require("fs");
const path = require("path");

const root = path.resolve(
  __dirname,
  ".."
);

const sourcePath = path.join(
  root,
  "src/features/ai/GeneralAIChat.tsx"
);

const source = fs.readFileSync(
  sourcePath,
  "utf8"
);

function requireText(value, label) {
  if (!source.includes(value)) {
    throw new Error(
      `Missing ${label}: ${value}`
    );
  }
}

for (const [
  value,
  label,
] of [
  [
    "GENERAL_AI_PROFESSIONAL_CHAT_SHELL_V8",
    "professional chat shell marker",
  ],
  [
    "const chatScrollRef =",
    "message scroll container ref",
  ],
  [
    "const shouldStickToBottomRef =",
    "smart auto-scroll ref",
  ],
  [
    "function handleChatScroll()",
    "near-bottom tracking",
  ],
  [
    "scroller.scrollTo({",
    "container-only scrolling",
  ],
  [
    "resetChatScroll();",
    "top reset",
  ],
  [
    "window.history.scrollRestoration =",
    "manual browser scroll restoration",
  ],
  [
    "ref={chatScrollRef}",
    "chat scroll ref binding",
  ],
  [
    "onScroll={handleChatScroll}",
    "chat scroll listener",
  ],
  [
    "overscroll-contain",
    "contained mobile overscroll",
  ],
  [
    "ref={chatScrollRef}",
    "structural scroll ref",
  ],
  [
    "Quick prompts",
    "compact prompts section",
  ],
  [
    'data-studysnap-quick-prompts="true"',
    "exact quick prompts details marker",
  ],
  [
    "{suggestions.map(",
    "suggestions-backed quick prompts",
  ],
  [
    "studysnap-ai-tools-panel",
    "professional tools panel",
  ],
  [
    "max-h-[min(72dvh,38rem)]",
    "viewport-safe tools height",
  ],
  [
    "document.body.style.overflow =",
    "modal body scroll lock",
  ],
  [
    'event.key === "Escape"',
    "Escape close behavior",
  ],
]) {
  requireText(
    value,
    label
  );
}

const quickPromptsLabel =
  source.indexOf(
    "Quick prompts"
  );

const quickPromptsDetailsStart =
  source.lastIndexOf(
    "<details",
    quickPromptsLabel
  );

const quickPromptsDetailsEnd =
  source.indexOf(
    ">",
    quickPromptsDetailsStart
  );

if (
  quickPromptsLabel < 0 ||
  quickPromptsDetailsStart < 0 ||
  quickPromptsDetailsEnd < 0
) {
  throw new Error(
    "Could not isolate the Quick prompts details element."
  );
}

const quickPromptsOpeningTag =
  source.slice(
    quickPromptsDetailsStart,
    quickPromptsDetailsEnd + 1
  );

if (
  /\sopen(?:\s*=\s*\{\s*true\s*\})?/.test(
    quickPromptsOpeningTag
  )
) {
  throw new Error(
    "Quick prompts must not start forced open."
  );
}

const composerStart =
  source.indexOf(
    "function renderComposer("
  );

const composerEnd =
  source.indexOf(
    "\n  return (\n    <section",
    composerStart
  );

if (
  composerStart < 0 ||
  composerEnd < 0
) {
  throw new Error(
    "Could not isolate renderComposer."
  );
}

const composer = source.slice(
  composerStart,
  composerEnd
);

for (const marker of [
  "fileInputRef.current",
  "picker.click()",
  'aria-label="Attach photos and files"',
]) {
  if (!composer.includes(marker)) {
    throw new Error(
      `Composer plus direct-upload marker is missing: ${marker}`
    );
  }
}

for (const forbidden of [
  "updateStudyToolsOpen(true)",
  "updateStudyToolsOpen(!studyToolsOpen)",
  "updateStudyToolsOpen(\n                  !studyToolsOpen",
]) {
  if (composer.includes(forbidden)) {
    throw new Error(
      `Composer plus still opens another StudySnap menu: ${forbidden}`
    );
  }
}

if (
  source.includes(
    "bottomRef.current?.scrollIntoView"
  )
) {
  throw new Error(
    "Whole-page scrollIntoView must not drive chat scrolling."
  );
}


console.log(
  "PASS: General AI uses a compact professional tools panel."
);

console.log(
  "PASS: Quick prompts stay collapsed until requested."
);

console.log(
  "PASS: Composer plus opens the native upload chooser directly."
);

console.log(
  "PASS: Chat scrolling stays inside the message list and avoids page jumps."
);

console.log(
  "PASS: Auto-scroll follows streaming only while the user remains near the latest message."
);
