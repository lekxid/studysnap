import type {
  CentralActionType,
} from "@/lib/api";

const DRAFT_PREFIX =
  "studysnap:central-action:draft:v1:";

export type CentralActionDraft = {
  version: 1;
  messageId: number;
  setupAction: CentralActionType;
  selectedRoomId: number | null;
  plannerSubject: string;
  plannerDate: string;
  plannerDuration: string;
  plannerPriority:
    | "Low"
    | "Medium"
    | "High";
  updatedAt: string;
};

function draftKey(
  messageId: number,
): string {
  return (
    DRAFT_PREFIX
    + String(messageId)
  );
}

function isActionType(
  value: unknown,
): value is CentralActionType {
  return (
    value === "save_note"
    || value === "create_flashcards"
    || value === "create_quiz"
    || value === "add_to_planner"
  );
}

function isPriority(
  value: unknown,
): value is
  | "Low"
  | "Medium"
  | "High" {
  return (
    value === "Low"
    || value === "Medium"
    || value === "High"
  );
}

export function readCentralActionDraft(
  messageId: number,
): CentralActionDraft | null {
  if (
    typeof window === "undefined"
  ) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        draftKey(messageId)
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(
        raw
      ) as Partial<
        CentralActionDraft
      >;

    if (
      parsed.version !== 1
      || parsed.messageId !==
        messageId
      || !isActionType(
        parsed.setupAction
      )
      || !isPriority(
        parsed.plannerPriority
      )
      || typeof parsed
        .plannerSubject !==
        "string"
      || typeof parsed
        .plannerDate !==
        "string"
      || typeof parsed
        .plannerDuration !==
        "string"
      || !(
        parsed.selectedRoomId ===
          null
        || typeof parsed
          .selectedRoomId ===
          "number"
      )
    ) {
      window.localStorage.removeItem(
        draftKey(messageId)
      );

      return null;
    }

    return parsed as CentralActionDraft;
  } catch {
    window.localStorage.removeItem(
      draftKey(messageId)
    );

    return null;
  }
}

export function persistCentralActionDraft(
  draft: Omit<
    CentralActionDraft,
    "version" | "updatedAt"
  >,
): void {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  const stored:
    CentralActionDraft = {
      ...draft,
      version: 1,
      updatedAt:
        new Date().toISOString(),
    };

  try {
    window.localStorage.setItem(
      draftKey(draft.messageId),
      JSON.stringify(stored)
    );
  } catch {
    // The active React state remains
    // usable if browser storage is full.
  }
}

export function clearCentralActionDraft(
  messageId: number,
): void {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.removeItem(
    draftKey(messageId)
  );
}
