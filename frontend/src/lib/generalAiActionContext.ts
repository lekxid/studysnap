export type GeneralAIActionContextMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  generatedImage?: boolean;
};

export type GeneralAIActionTargetOptions<
  T extends GeneralAIActionContextMessage,
> = {
  pressedMessageId?: number | null;
  isTransient?: (message: T) => boolean;
};

const BLOCKED_ACTION_CONTENT = [
  /^studysnap ai is (?:thinking|reading|searching|organizing|creating|finishing)\b/i,
  /^something went wrong\b/i,
  /^the request was cancelled\b/i,
  /^request cancelled\b/i,
  /^generation stopped\b/i,
  /^no response was generated\b/i,
];

function hasBlockedActionContent(
  value: string,
): boolean {
  const content = value.trim();

  if (!content) {
    return true;
  }

  return BLOCKED_ACTION_CONTENT.some(
    (pattern) => pattern.test(content),
  );
}

export function isGeneralAIActionTarget<
  T extends GeneralAIActionContextMessage,
>(
  message: T,
  isTransient?: (message: T) => boolean,
): boolean {
  return (
    message.role === "assistant"
    && typeof message.id === "number"
    && Number.isFinite(message.id)
    && message.id > 0
    && !message.generatedImage
    && message.content.trim().length >= 2
    && !hasBlockedActionContent(
      message.content,
    )
    && !(isTransient?.(message) ?? false)
  );
}

export function resolveGeneralAIActionTarget<
  T extends GeneralAIActionContextMessage,
>(
  items: readonly T[],
  options: GeneralAIActionTargetOptions<T> = {},
): T | null {
  const {
    pressedMessageId = null,
    isTransient,
  } = options;

  if (
    typeof pressedMessageId === "number"
    && Number.isFinite(pressedMessageId)
    && pressedMessageId > 0
  ) {
    const pressedMessage =
      items.find(
        (message) =>
          message.id === pressedMessageId,
      ) ?? null;

    if (
      pressedMessage
      && isGeneralAIActionTarget(
        pressedMessage,
        isTransient,
      )
    ) {
      return pressedMessage;
    }
  }

  for (
    let index = items.length - 1;
    index >= 0;
    index -= 1
  ) {
    const message = items[index];

    if (
      isGeneralAIActionTarget(
        message,
        isTransient,
      )
    ) {
      return message;
    }
  }

  return null;
}
