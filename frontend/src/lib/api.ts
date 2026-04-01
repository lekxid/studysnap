const API_BASE = "/backend";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
}

export function removeToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json();
      message = data.detail || JSON.stringify(data);
    } catch {
      message = await res.text();
    }
    throw new Error(message || "Request failed");
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  return res.text();
}

export async function signup(name: string, email: string, password: string) {
  return apiFetch("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      full_name: name,
      email,
      password,
      learning_mode: "medium",
    }),
  });
}

export async function login(email: string, password: string) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function forgotPassword(email: string) {
  return apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function getDashboard() {
  return apiFetch("/api/dashboard");
}

export async function askAi(question: string, context?: string) {
  return apiFetch("/api/ai/ask", {
    method: "POST",
    body: JSON.stringify({
      question,
      context: context || "",
    }),
  });
}

export async function generateFlashcardsFromNotes(studyRoomId: number) {
  return apiFetch("/api/ai/generate-flashcards", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
    }),
  });
}

export async function generateQuizzesFromNotes(studyRoomId: number) {
  return apiFetch("/api/ai/generate-quizzes", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
    }),
  });
}

export async function getStudyRooms() {
  return apiFetch("/api/study-rooms");
}

export async function createStudyRoom(
  name: string,
  subject: string,
  description = ""
) {
  return apiFetch("/api/study-rooms", {
    method: "POST",
    body: JSON.stringify({ name, subject, description }),
  });
}

export async function updateStudyRoom(
  id: number,
  name: string,
  subject: string,
  description = ""
) {
  return apiFetch(`/api/study-rooms/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, subject, description }),
  });
}

export async function deleteStudyRoom(id: number) {
  return apiFetch(`/api/study-rooms/${id}`, {
    method: "DELETE",
  });
}

export async function getNotes(studyRoomId: number) {
  return apiFetch(`/api/notes/${studyRoomId}`);
}

export async function createNote(studyRoomId: number, content: string) {
  return apiFetch("/api/notes", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      content,
    }),
  });
}

export async function deleteNote(noteId: number) {
  return apiFetch(`/api/notes/${noteId}`, {
    method: "DELETE",
  });
}

export async function getFlashcards(studyRoomId: number) {
  return apiFetch(`/api/flashcards/${studyRoomId}`);
}

export async function createFlashcard(
  studyRoomId: number,
  question: string,
  answer: string
) {
  return apiFetch("/api/flashcards", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      question,
      answer,
    }),
  });
}

export async function deleteFlashcard(flashcardId: number) {
  return apiFetch(`/api/flashcards/${flashcardId}`, {
    method: "DELETE",
  });
}

export async function getQuizzes(studyRoomId: number) {
  return apiFetch(`/api/quizzes/${studyRoomId}`);
}

export async function createQuiz(
  studyRoomId: number,
  question: string,
  answer: string
) {
  return apiFetch("/api/quizzes", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      question,
      answer,
    }),
  });
}

export async function deleteQuiz(quizId: number) {
  return apiFetch(`/api/quizzes/${quizId}`, {
    method: "DELETE",
  });
}
