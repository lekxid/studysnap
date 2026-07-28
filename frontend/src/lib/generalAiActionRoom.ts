export type GeneralAIActionRoom = {
  id: number;
  name: string;
  subject: string;
};

export type GeneralAIActionRoomDecision<
  T extends GeneralAIActionRoom,
> = {
  room: T | null;
  reason:
    | "hint"
    | "preferred"
    | "only"
    | "ambiguous"
    | "unmatched"
    | "none";
};

function normalizeRoomText(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function importantWords(
  value: string,
): string[] {
  return normalizeRoomText(value)
    .split(" ")
    .filter(
      (word) =>
        word.length >= 2
        && ![
          "my",
          "the",
          "a",
          "an",
          "room",
          "study",
        ].includes(word),
    );
}

function scoreRoomHint(
  room: GeneralAIActionRoom,
  roomHint: string,
): number {
  const hint =
    normalizeRoomText(roomHint);

  const name =
    normalizeRoomText(room.name);

  const subject =
    normalizeRoomText(room.subject);

  if (!hint) {
    return 0;
  }

  let score = 0;

  if (name === hint) {
    score += 130;
  }

  if (subject === hint) {
    score += 125;
  }

  if (
    name.includes(hint)
    || hint.includes(name)
  ) {
    score += 90;
  }

  if (
    subject.includes(hint)
    || hint.includes(subject)
  ) {
    score += 85;
  }

  const hintWords =
    importantWords(hint);

  const nameWords =
    new Set(importantWords(name));

  const subjectWords =
    new Set(importantWords(subject));

  for (const word of hintWords) {
    if (nameWords.has(word)) {
      score += 28;
    } else if (
      subjectWords.has(word)
    ) {
      score += 24;
    }
  }

  return score;
}

export function selectGeneralAIActionRoom<
  T extends GeneralAIActionRoom,
>(
  rooms: readonly T[],
  options: {
    roomHint?: string | null;
    preferredStudyRoomId?: number | null;
  } = {},
): GeneralAIActionRoomDecision<T> {
  const roomHint =
    options.roomHint?.trim() || "";

  if (roomHint) {
    const matches =
      rooms
        .map((room) => ({
          room,
          score: scoreRoomHint(
            room,
            roomHint,
          ),
        }))
        .filter(
          (match) =>
            match.score >= 24,
        )
        .sort(
          (first, second) =>
            second.score - first.score,
        );

    const best = matches[0];
    const second = matches[1];

    if (!best) {
      return {
        room: null,
        reason: "unmatched",
      };
    }

    if (
      second
      && best.score < 120
      && best.score - second.score < 10
    ) {
      return {
        room: null,
        reason: "ambiguous",
      };
    }

    return {
      room: best.room,
      reason: "hint",
    };
  }

  const preferredRoom =
    rooms.find(
      (room) =>
        room.id ===
        options.preferredStudyRoomId,
    ) ?? null;

  if (preferredRoom) {
    return {
      room: preferredRoom,
      reason: "preferred",
    };
  }

  if (rooms.length === 1) {
    return {
      room: rooms[0],
      reason: "only",
    };
  }

  return {
    room: null,
    reason: "none",
  };
}
