import type {
  CentralActionType,
} from "@/lib/api";

export type GeneralAIActionIntent = {
  actionType: CentralActionType;
  label: string;
  confidence: "high";
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
  + "this explanation|that explanation|"
  + "the explanation|"
  + "the last explanation|"
  + "this topic|that topic|"
  + "the topic|"
  + "the last one)";

const OPTIONAL_REFERENCE =
  `(?:\\s+(?:from|using|about|on)\\s+${REFERENT})?`;

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
    .replace(
      /^(?:i\s+(?:want|need)\s+you\s+to|help\s+me\s+to)\s+/,
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

function action(
  actionType: CentralActionType,
  label: string,
): GeneralAIActionIntent {
  return {
    actionType,
    label,
    confidence: "high",
  };
}

export function detectGeneralAIActionIntent(
  value: string,
): GeneralAIActionIntent | null {
  const text =
    normalizeActionCommand(value);

  if (
    !text ||
    text.length > 180 ||
    value.includes("\n")
  ) {
    return null;
  }

  const plannerPatterns = [
    `^(?:add|put|save)\\s+${REFERENT}\\s+(?:to|in|into)\\s+(?:my\\s+|the\\s+)?planner(?:\\s+.+)?$`,
    `^(?:schedule|plan)\\s+${REFERENT}(?:\\s+.+)?$`,
  ];

  if (
    plannerPatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return action(
      "add_to_planner",
      "Add to planner",
    );
  }

  const flashcardPatterns = [
    `^(?:make|create|build|generate)\\s+(?:some\\s+)?(?:\\d+\\s+)?(?:flashcards?|study\\s+cards?|cards?)${OPTIONAL_REFERENCE}$`,
    `^(?:turn|convert)\\s+${REFERENT}\\s+into\\s+(?:some\\s+)?(?:\\d+\\s+)?(?:flashcards?|study\\s+cards?|cards?)$`,
    `^save\\s+${REFERENT}\\s+as\\s+(?:some\\s+)?(?:\\d+\\s+)?(?:flashcards?|study\\s+cards?|cards?)$`,
  ];

  if (
    flashcardPatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return action(
      "create_flashcards",
      "Make cards",
    );
  }

  const quizPatterns = [
    `^(?:make|create|build|generate)\\s+(?:a\\s+)?(?:practice\\s+)?quiz${OPTIONAL_REFERENCE}$`,
    `^(?:turn|convert)\\s+${REFERENT}\\s+into\\s+(?:a\\s+)?(?:practice\\s+)?quiz$`,
    `^(?:quiz|test)\\s+(?:me|us)(?:\\s+(?:from|using|about|on)\\s+${REFERENT})?$`,
  ];

  if (
    quizPatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return action(
      "create_quiz",
      "Make quiz",
    );
  }

  const notePatterns = [
    `^(?:save|keep|store)\\s+${REFERENT}$`,
    `^(?:save|keep|store)\\s+${REFERENT}\\s+(?:as|to|in|into)\\s+(?:my\\s+)?(?:a\\s+)?notes?$`,
    `^(?:put|add)\\s+${REFERENT}\\s+(?:to|in|into)\\s+(?:my\\s+)?(?:notes?|[a-z0-9 ]+\\s+room)$`,
    `^(?:turn|convert)\\s+${REFERENT}\\s+into\\s+(?:a\\s+)?note$`,
  ];

  if (
    notePatterns.some(
      (pattern) =>
        matches(text, pattern),
    )
  ) {
    return action(
      "save_note",
      "Save note",
    );
  }

  return null;
}
