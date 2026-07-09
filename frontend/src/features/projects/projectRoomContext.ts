export const LAST_PROJECT_ROOM_ID_KEY = "studysnap_last_project_room_id";

export function normalizeProjectRoomId(value: unknown): number | null {
  const roomId = Number(value);
  return Number.isFinite(roomId) && roomId > 0 ? roomId : null;
}

export function saveProjectRoomId(value: unknown): number | null {
  const roomId = normalizeProjectRoomId(value);

  if (roomId === null || typeof window === "undefined") {
    return roomId;
  }

  window.localStorage.setItem(LAST_PROJECT_ROOM_ID_KEY, String(roomId));
  return roomId;
}

export function getSavedProjectRoomId(): number | null {
  if (typeof window === "undefined") return null;

  return normalizeProjectRoomId(
    window.localStorage.getItem(LAST_PROJECT_ROOM_ID_KEY)
  );
}

export function getProjectRoomIdFromUrl(): number | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  return normalizeProjectRoomId(params.get("roomId"));
}

export function getActiveProjectRoomId(): number | null {
  const urlRoomId = getProjectRoomIdFromUrl();

  if (urlRoomId !== null) {
    saveProjectRoomId(urlRoomId);
    return urlRoomId;
  }

  return getSavedProjectRoomId();
}

export function ensureProjectRoomIdInUrl(value: unknown) {
  const roomId = normalizeProjectRoomId(value);

  if (roomId === null || typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const currentRoomId = normalizeProjectRoomId(url.searchParams.get("roomId"));

  if (currentRoomId === roomId) {
    return;
  }

  url.searchParams.set("roomId", String(roomId));
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}
