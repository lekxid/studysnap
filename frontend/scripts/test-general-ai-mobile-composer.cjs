const fs = require("node:fs");
const path = require("node:path");

const chat = fs.readFileSync(
  path.resolve(__dirname, "../src/features/ai/GeneralAIChat.tsx"),
  "utf8",
);

const css = fs.readFileSync(
  path.resolve(__dirname, "../src/app/globals.css"),
  "utf8",
);

function expect(value, message) {
  if (!value) throw new Error(message);
}

expect(chat.includes("function handleComposerPaste("), "Paste handler missing.");
expect(chat.includes("function handleComposerDrop("), "Drop handler missing.");
expect(chat.includes("onPaste={handleComposerPaste}"), "Paste not connected.");
expect(chat.includes("onDrop={handleComposerDrop}"), "Drop not connected.");
expect(chat.includes("window.visualViewport"), "Keyboard viewport handling missing.");
expect(chat.includes("textarea.scrollHeight"), "Textarea auto-grow missing.");
expect(chat.includes("studysnap-composer-input-row"), "Unified input row missing.");
expect(chat.includes("studysnap-composer-files"), "Compact file chips missing.");
expect(chat.includes("Tap to include"), "Ready-file selection missing.");
expect(!chat.includes("<GeneralAIFileBrainQueue"), "Large Files panel still renders.");
expect(chat.includes("!event.shiftKey"), "Shift+Enter handling missing.");
expect(chat.includes("(pointer: fine)"), "Desktop Enter-to-send guard missing.");
expect(css.includes("STUDYSNAP_CHATGPT_COMPOSER_V1"), "Composer CSS missing.");
expect(css.includes("--studysnap-visual-viewport-height"), "Viewport CSS missing.");

console.log("PASS: ChatGPT-style mobile composer contract verified.");
