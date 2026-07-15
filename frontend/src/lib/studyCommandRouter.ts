import {
  getRoomMaterials,
  getStudyRooms,
  retrieveBrain,
  type BrainSource,
  type UniversalMaterialListItem,
} from "@/lib/api";

import {
  getSavedProjectRoomId,
  saveProjectRoomId,
} from "@/features/projects/projectRoomContext";

export type RoutableStudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string | null;
};

export type StudyCommandResult =
  | {
      handled: false;
    }
  | {
      handled: true;
      href: string;
    };

const RESUME_COMMANDS = [
  "continue where i stopped",
  "continue where i left off",
  "resume where i stopped",
  "resume my work",
  "continue my work",
  "pick up where i stopped",
  "pick up where i left off",
];

const ROOM_COMMAND_WORDS = [
  "continue",
  "resume",
  "open",
  "study",
  "work on",
  "go to",
  "take me to",
  "show",
  "find",
];

const IGNORED_COMMAND_WORDS = new Set([
  "open",
  "continue",
  "resume",
  "study",
  "work",
  "room",
  "project",
  "file",
  "files",
  "material",
  "materials",
  "latest",
  "please",
  "with",
  "from",
  "where",
  "stopped",
  "left",
  "off",
  "take",
  "show",
  "find",
  "start",
  "again",
  "today",
  "my",
  "the",
  "and",
]);

export function normalizeStudyCommand(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isResumeCommand(value: string) {
  const normalized = normalizeStudyCommand(value);

  return RESUME_COMMANDS.some(
    (command) =>
      normalized === command ||
      normalized.includes(command),
  );
}

export function looksLikeStudyCommand(value: string) {
  const normalized = normalizeStudyCommand(value);

  return ROOM_COMMAND_WORDS.some(
    (word) =>
      normalized === word ||
      normalized.startsWith(`${word} `) ||
      normalized.includes(` ${word} `),
  );
}

function getRoomSearchText(room: RoutableStudyRoom) {
  return normalizeStudyCommand(
    [
      room.name,
      room.subject,
      room.description || "",
    ].join(" "),
  );
}

function getImportantCommandWords(value: string) {
  return normalizeStudyCommand(value)
    .split(" ")
    .filter(
      (word) =>
        word.length >= 3 &&
        !IGNORED_COMMAND_WORDS.has(word),
    );
}

function scoreRoomMatch(
  prompt: string,
  room: RoutableStudyRoom,
) {
  const normalizedPrompt =
    normalizeStudyCommand(prompt);

  const roomName =
    normalizeStudyCommand(room.name);

  const roomSubject =
    normalizeStudyCommand(room.subject);

  const roomSearchText =
    getRoomSearchText(room);

  let score = 0;

  if (
    roomName &&
    normalizedPrompt.includes(roomName)
  ) {
    score += 100;
  }

  if (
    roomSubject &&
    normalizedPrompt.includes(roomSubject)
  ) {
    score += 90;
  }

  const promptWords =
    getImportantCommandWords(prompt);

  for (const word of promptWords) {
    if (roomName.split(" ").includes(word)) {
      score += 30;
    } else if (
      roomSubject.split(" ").includes(word)
    ) {
      score += 25;
    } else if (
      roomSearchText.includes(word)
    ) {
      score += 8;
    }
  }

  return score;
}

function findBestRoomMatch(
  prompt: string,
  rooms: RoutableStudyRoom[],
) {
  const matches = rooms
    .map((room) => ({
      room,
      score: scoreRoomMatch(prompt, room),
    }))
    .filter((match) => match.score > 0)
    .sort(
      (first, second) =>
        second.score - first.score,
    );

  const best = matches[0];
  const second = matches[1];

  if (!best || best.score < 20) {
    return null;
  }

  if (
    second &&
    best.score < 80 &&
    best.score - second.score < 10
  ) {
    return null;
  }

  return best.room;
}

function getSavedRoomTab(roomId: number) {
  if (typeof window === "undefined") {
    return "ai";
  }

  const allowedTabs = new Set([
    "overview",
    "materials",
    "notes",
    "ai",
    "practice",
    "together",
    "progress",
  ]);

  const savedTab =
    window.localStorage.getItem(
      `studysnap:room:${roomId}:last-tab`,
    );

  return savedTab &&
    allowedTabs.has(savedTab)
    ? savedTab
    : "ai";
}

type MaterialRoomMatch = {
  material: UniversalMaterialListItem;
  room: RoutableStudyRoom;
  score: number;
};

function scoreMaterialMatch(
  prompt: string,
  material: UniversalMaterialListItem,
) {
  const filename = normalizeStudyCommand(
    material.original_filename,
  );

  const words =
    getImportantCommandWords(prompt);

  let score = 0;

  for (const word of words) {
    if (filename.split(" ").includes(word)) {
      score += 35;
    } else if (filename.includes(word)) {
      score += 18;
    }
  }

  if (
    filename.length >= 3 &&
    normalizeStudyCommand(prompt).includes(
      filename,
    )
  ) {
    score += 100;
  }

  return score;
}

async function findBestMaterialRoomMatch(
  prompt: string,
  rooms: RoutableStudyRoom[],
): Promise<MaterialRoomMatch | null> {
  const roomMaterials = await Promise.all(
    rooms.map(async (room) => {
      try {
        const response =
          await getRoomMaterials(room.id);

        return response.materials.map(
          (material) => ({
            room,
            material,
            score: scoreMaterialMatch(
              prompt,
              material,
            ),
          }),
        );
      } catch {
        return [];
      }
    }),
  );

  const matches = roomMaterials
    .flat()
    .filter((match) => match.score > 0)
    .sort(
      (first, second) =>
        second.score - first.score,
    );

  const best = matches[0];
  const second = matches[1];

  if (!best || best.score < 18) {
    return null;
  }

  if (
    second &&
    best.score < 70 &&
    best.score - second.score < 8
  ) {
    return null;
  }

  return best;
}

function getMetadataNumber(
  source: BrainSource,
  key: string,
) {
  const parsed = Number(
    source.metadata?.[key],
  );

  return Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

async function findBestBrainSource(
  prompt: string,
) {
  try {
    const result = await retrieveBrain(
      prompt,
      null,
      8,
    );

    const sources = Array.isArray(result.results)
      ? result.results
      : [];

    return (
      sources.find(
        (source) =>
          getMetadataNumber(
            source,
            "study_room_id",
          ) !== null,
      ) ?? null
    );
  } catch {
    return null;
  }
}

export async function resolveStudyCommand(
  prompt: string,
  suppliedRooms?: RoutableStudyRoom[],
): Promise<StudyCommandResult> {
  const cleanPrompt = prompt.trim();

  if (!cleanPrompt) {
    return { handled: false };
  }

  if (
    !isResumeCommand(cleanPrompt) &&
    !looksLikeStudyCommand(cleanPrompt)
  ) {
    return { handled: false };
  }

  let rooms = suppliedRooms;

  if (!rooms) {
    try {
      rooms = await getStudyRooms();
    } catch {
      rooms = [];
    }
  }

  if (isResumeCommand(cleanPrompt)) {
    const storedRoomId = Number(
      window.localStorage.getItem(
        "studysnap:last-study-room-id",
      ) || getSavedProjectRoomId(),
    );

    const roomExists = rooms.some(
      (room) => room.id === storedRoomId,
    );

    if (
      Number.isFinite(storedRoomId) &&
      storedRoomId > 0 &&
      roomExists
    ) {
      saveProjectRoomId(storedRoomId);

      return {
        handled: true,
        href: `/study-rooms/${storedRoomId}?tab=${getSavedRoomTab(
          storedRoomId,
        )}`,
      };
    }

    const fallbackRoom =
      rooms.find(
        (room) =>
          room.id === getSavedProjectRoomId(),
      ) ?? rooms[0];

    if (fallbackRoom) {
      saveProjectRoomId(fallbackRoom.id);

      return {
        handled: true,
        href: `/study-rooms/${fallbackRoom.id}?tab=ai&prompt=${encodeURIComponent(
          cleanPrompt,
        )}`,
      };
    }
  }

  const matchedRoom =
    findBestRoomMatch(cleanPrompt, rooms);

  if (matchedRoom) {
    saveProjectRoomId(matchedRoom.id);

    return {
      handled: true,
      href: `/study-rooms/${matchedRoom.id}?tab=ai&prompt=${encodeURIComponent(
        cleanPrompt,
      )}`,
    };
  }

  const materialMatch =
    await findBestMaterialRoomMatch(
      cleanPrompt,
      rooms,
    );

  if (materialMatch) {
    saveProjectRoomId(
      materialMatch.room.id,
    );

    const params = new URLSearchParams({
      tab: "ai",
      materialId: String(
        materialMatch.material.id,
      ),
      materialName:
        materialMatch.material.original_filename,
      prompt: cleanPrompt,
    });

    return {
      handled: true,
      href: `/study-rooms/${materialMatch.room.id}?${params.toString()}`,
    };
  }

  const brainSource =
    await findBestBrainSource(cleanPrompt);

  if (brainSource) {
    const roomId =
      getMetadataNumber(
        brainSource,
        "study_room_id",
      );

    if (roomId) {
      saveProjectRoomId(roomId);

      if (
        brainSource.source_type ===
        "note_chunk"
      ) {
        const noteId =
          getMetadataNumber(
            brainSource,
            "note_id",
          );

        if (noteId) {
          return {
            handled: true,
            href: `/notes?roomId=${roomId}&noteId=${noteId}`,
          };
        }
      }

      return {
        handled: true,
        href: `/study-rooms/${roomId}?tab=ai&prompt=${encodeURIComponent(
          cleanPrompt,
        )}`,
      };
    }
  }

  return {
    handled: true,
    href: `/study-rooms?query=${encodeURIComponent(
      cleanPrompt,
    )}`,
  };
}
