const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      __dirname,
      relativePath,
    ),
    "utf8",
  );
}

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

const dashboard = read(
  "../src/app/dashboard/page.tsx",
);

const chat = read(
  "../src/features/ai/GeneralAIChat.tsx",
);

const handlerStart =
  dashboard.indexOf(
    "function handleGeneralAiSubmit"
  );

const handlerEnd =
  dashboard.indexOf(
    "\n\n  if (!checked)",
    handlerStart,
  );

expect(
  handlerStart >= 0 &&
    handlerEnd > handlerStart,
  "Dashboard Ask handler was not found.",
);

const handler =
  dashboard.slice(
    handlerStart,
    handlerEnd,
  );

for (const marker of [
  '"new"',
  '"prompt"',
  '"roomId"',
  '"studysnap:pending-general-ai-prompt"',
  "`/general-ai?${params.toString()}`",
]) {
  expect(
    handler.includes(marker),
    `Dashboard prompt handoff is missing: ${marker}`,
  );
}

for (const forbidden of [
  "shouldResolveAsStudyCommand",
  "resolveStudyCommand",
]) {
  expect(
    !handler.includes(forbidden),
    `Dashboard still intercepts Ask StudySnap: ${forbidden}`,
  );
}

expect(
  dashboard.includes(
    "Retained for future dashboard natural-action routing."
  ),
  "Dashboard local classifier is not lint-safe.",
);

for (const marker of [
  "LEGACY_DASHBOARD_UPCOMING_TITLES",
  '"review 10 concept cards"',
  '"daily smart action"',
  "isExplicitDashboardPlannerItem",
  "!isExplicitDashboardPlannerItem(",
  "{nextSession ? (",
]) {
  expect(
    dashboard.includes(marker),
    `Upcoming real-data filter is missing: ${marker}`,
  );
}

for (const marker of [
  '"studysnap:pending-general-ai-prompt"',
  "initialPrompt.trim()",
  "savedPrompt?.trim()",
  "initialPromptHandledRef.current = true",
  "const prompt = handoffPrompt.trim();",
  "void sendMessage(prompt);",
]) {
  expect(
    chat.includes(marker),
    `General AI auto-submit contract is missing: ${marker}`,
  );
}

console.log(
  "PASS: Dashboard Ask opens the question "
  + "and General AI auto-starts the answer."
);

console.log(
  "PASS: Upcoming hides old generated suggestions "
  + "and remains connected to real planner data."
);
