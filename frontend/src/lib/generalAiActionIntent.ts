import type {
  CentralActionType,
} from "@/lib/api";

export type GeneralAIActionIntent = {
  actionType: CentralActionType;
  label: string;
};

const REFERENT =
  "(?:this|that|it|"
  + "this answer|that answer|"
  + "the answer|your answer|"
  + "the last answer|"
  + "this response|that response|"
  + "the response|your response|"
  + "this reply|that reply|"
  + "the reply|your reply|"
  + "the last reply|"
  + "this topic|that topic|"
  + "the topic)";

function normalizeActionCommand(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?/,
      "",
    )
    .trim();
}

function matches(
  text: string,
  pattern: string,
): boolean {
  return new RegExp(
    pattern,
    "i",
  ).test(text);
}

export function detectGeneralAIActionIntent(
  value: string,
): GeneralAIActionIntent | null {
  const text =
    normalizeActionCommand(value);

  if (
    !text ||
    text.length > 180
  ) {
    return null;
  }

  const notePatterns = [
    `^(?:save|keep|add)\\s+${REFERENT}\\s+(?:as|to|in|into)\\s+(?:my\\s+)?(?:a\\s+)?notes?$`,
    `^(?:turn|convert)\\s+${REFERENT}\\s+into\\s+(?:a\\s+)?note$`,
  ];

  if (
    notePatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return {
      actionType: "save_note",
      label: "Save note",
    };
  }

  const flashcardPatterns = [
    `^(?:make|create)\\s+(?:some\\s+)?(?:flashcards?|study cards?)\\s+(?:from|using)\\s+${REFERENT}$`,
    `^(?:turn|convert)\\s+${REFERENT}\\s+into\\s+(?:some\\s+)?(?:flashcards?|study cards?)$`,
    `^(?:save)\\s+${REFERENT}\\s+as\\s+(?:some\\s+)?(?:flashcards?|study cards?)$`,
  ];

  if (
    flashcardPatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return {
      actionType:
        "create_flashcards",
      label: "Make cards",
    };
  }

  const quizPatterns = [
    `^(?:make|create)\\s+(?:a\\s+)?quiz\\s+(?:from|using)\\s+${REFERENT}$`,
    `^(?:turn|convert)\\s+${REFERENT}\\s+into\\s+(?:a\\s+)?quiz$`,
    `^(?:save)\\s+${REFERENT}\\s+as\\s+(?:a\\s+)?quiz$`,
  ];

  if (
    quizPatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return {
      actionType: "create_quiz",
      label: "Make quiz",
    };
  }

  const plannerPatterns = [
    `^(?:add|save)\\s+${REFERENT}\\s+(?:to|in|into)\\s+(?:my\\s+|the\\s+)?planner$`,
    `^(?:schedule)\\s+${REFERENT}(?:\\s+(?:for|in)\\s+(?:my\\s+|the\\s+)?planner)?$`,
  ];

  if (
    plannerPatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return {
      actionType:
        "add_to_planner",
      label: "Add to planner",
    };
  }

  return null;
}
