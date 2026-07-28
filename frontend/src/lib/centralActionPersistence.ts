import type {
  CentralActionRecord,
  CentralActionType,
} from "@/lib/api";

const STORAGE_PREFIX =
  "studysnap:central-action:last:v1:";

type StoredCentralAction = {
  version: 1;
  messageId: number;
  savedAt: string;
  record: CentralActionRecord;
};

type IdempotencyInput = {
  messageId: number;
  actionType: CentralActionType;
  studyRoomId: number | null;
  payload: Record<string, unknown>;
};

function storageKey(
  messageId: number,
): string {
  return (
    STORAGE_PREFIX
    + String(messageId)
  );
}

function isCentralActionRecord(
  value: unknown,
): value is CentralActionRecord {
  if (
    !value
    || typeof value !== "object"
  ) {
    return false;
  }

  const candidate =
    value as Partial<
      CentralActionRecord
    >;

  return (
    typeof candidate.id ===
      "number"
    && typeof candidate.action_type ===
      "string"
    && typeof candidate.status ===
      "string"
    && typeof candidate.label ===
      "string"
    && typeof candidate.preview ===
      "object"
  );
}

export function readPersistedCentralAction(
  messageId: number,
): CentralActionRecord | null {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        storageKey(messageId)
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(
        raw
      ) as Partial<
        StoredCentralAction
      >;

    if (
      parsed.version !== 1
      || parsed.messageId !==
        messageId
      || !isCentralActionRecord(
        parsed.record
      )
      || parsed.record
        .source_message_id !==
        messageId
    ) {
      window.localStorage.removeItem(
        storageKey(messageId)
      );

      return null;
    }

    return parsed.record;
  } catch {
    window.localStorage.removeItem(
      storageKey(messageId)
    );

    return null;
  }
}

export function persistCentralAction(
  messageId: number,
  record: CentralActionRecord,
): void {
  if (
    typeof window === "undefined"
    || record.source_message_id !==
      messageId
  ) {
    return;
  }

  const stored:
    StoredCentralAction = {
      version: 1,
      messageId,
      savedAt:
        new Date().toISOString(),
      record,
    };

  try {
    window.localStorage.setItem(
      storageKey(messageId),
      JSON.stringify(stored)
    );
  } catch {
    // Backend remains the source of truth
    // if browser storage is unavailable.
  }
}

export function clearPersistedCentralAction(
  messageId: number,
): void {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.removeItem(
    storageKey(messageId)
  );
}

function stableValue(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value
    && typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >
      )
        .sort(
          ([first], [second]) =>
            first.localeCompare(second)
        )
        .map(
          ([key, item]) => [
            key,
            stableValue(item),
          ]
        )
    );
  }

  return value;
}

function shortHash(
  value: string,
): string {
  let hash = 2166136261;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(
      index
    );

    hash = Math.imul(
      hash,
      16777619
    );
  }

  return (
    hash >>> 0
  )
    .toString(36)
    .padStart(7, "0");
}

export function buildCentralActionIdempotencyKey({
  messageId,
  actionType,
  studyRoomId,
  payload,
}: IdempotencyInput): string {
  const fingerprint =
    JSON.stringify(
      stableValue({
        messageId,
        actionType,
        studyRoomId:
          studyRoomId ?? null,
        payload,
      })
    );

  return [
    "general-ai-v1",
    messageId,
    actionType,
    studyRoomId ?? 0,
    shortHash(fingerprint),
  ].join(":");
}

function resultCount(
  record: CentralActionRecord,
): number | null {
  const candidates = [
    record.result?.count,
    record.result?.question_count,
    record.result?.entity_ids
      ?.length,
  ];

  const count =
    candidates.find(
      (value) =>
        typeof value === "number"
        && Number.isFinite(value)
        && value > 0
    );

  return typeof count === "number"
    ? count
    : null;
}

export function getCentralActionResultTitle(
  record: CentralActionRecord,
): string {
  if (
    record.status === "undone"
  ) {
    return "Action undone";
  }

  if (
    record.status === "failed"
  ) {
    return "Action needs attention";
  }

  if (
    record.duplicate
    || record.already_executed
  ) {
    if (
      record.action_type ===
      "add_to_planner"
    ) {
      return "Already scheduled";
    }

    if (
      record.action_type ===
      "create_flashcards"
    ) {
      return "Cards already exist";
    }

    if (
      record.action_type ===
      "create_quiz"
    ) {
      return "Quiz already exists";
    }

    return "Already saved";
  }

  if (
    record.status !== "executed"
  ) {
    return record.label;
  }

  const count =
    resultCount(record);

  if (
    record.action_type ===
    "create_flashcards"
  ) {
    return count
      ? `${count} flashcards created`
      : "Flashcards created";
  }

  if (
    record.action_type ===
    "create_quiz"
  ) {
    return count
      ? `${count} quiz questions created`
      : "Quiz created";
  }

  if (
    record.action_type ===
    "add_to_planner"
  ) {
    return "Added to planner";
  }

  return "Note saved";
}

export function getCentralActionSubtitle(
  record: CentralActionRecord,
): string {
  if (
    record.status === "preview"
  ) {
    return (
      "Review before StudySnap "
      + "creates anything"
    );
  }

  if (
    record.status === "undone"
  ) {
    return "Removed safely";
  }

  if (
    record.status === "failed"
  ) {
    return (
      "Retry uses the same "
      + "protected action"
    );
  }

  if (
    record.duplicate
    || record.already_executed
  ) {
    return (
      "StudySnap reused the "
      + "existing item"
    );
  }

  return "Created successfully";
}

export function getCentralActionResultDetail(
  record: CentralActionRecord,
): string {
  const title =
    record.result?.title;

  if (
    typeof title === "string"
    && title.trim()
  ) {
    return title.trim();
  }

  if (
    record.preview.room_name
  ) {
    return record.preview.room_name;
  }

  if (
    record.status === "undone"
  ) {
    return (
      "The created item was "
      + "removed safely."
    );
  }

  if (
    record.duplicate
    || record.already_executed
  ) {
    return (
      "No duplicate copy "
      + "was created."
    );
  }

  return record.preview.summary;
}
