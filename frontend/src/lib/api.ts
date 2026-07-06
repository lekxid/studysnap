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

function getErrorMessage(data: unknown): string {
  if (typeof data === "string") return data;

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (typeof obj.detail === "string") return obj.detail;

    if (Array.isArray(obj.detail)) {
      return obj.detail
        .map((item) => {
          if (item && typeof item === "object") {
            const error = item as Record<string, unknown>;
            return String(error.msg || JSON.stringify(error));
          }
          return String(item);
        })
        .join(", ");
    }

    if (typeof obj.message === "string") return obj.message;

    return JSON.stringify(obj);
  }

  return "Request failed";
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

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
      message = getErrorMessage(data);
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

export async function generateLesson(question: string, context?: string) {
  return apiFetch("/api/ai/lesson", {
    method: "POST",
    body: JSON.stringify({
      question,
      context: context || "",
      study_room_id: null,
    }),
  });
}

export async function createAIConversation(
  studyRoomId: number,
  title = "New Conversation",
  conversationMode = "general"
) {
  return apiFetch("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      title,
      mode: conversationMode,
    }),
  });
}

export async function getAIConversations(
  studyRoomId: number,
  conversationMode = "general"
) {
  return apiFetch(
    `/api/ai/conversations/${studyRoomId}?mode=${encodeURIComponent(
      conversationMode
    )}`
  );
}

export async function renameAIConversation(
  conversationId: number,
  title: string
) {
  return apiFetch(`/api/ai/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteAIConversation(conversationId: number) {
  return apiFetch(`/api/ai/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export async function getAIMessages(conversationId: number) {
  return apiFetch(`/api/ai/messages/${conversationId}`);
}

export async function sendAIMessage(
  conversationId: number,
  content: string,
  mode = "explain"
) {
  return apiFetch("/api/ai/messages", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      content,
      mode,
    }),
  });
}

export async function streamAIMessage(
  conversationId: number,
  content: string,
  mode = "explain",
  onToken: (token: string) => void
) {
  const token = getToken();

  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}/api/ai/messages/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      content,
      mode,
    }),
  });

  if (!res.ok || !res.body) {
    let message = "Streaming request failed";

    try {
      const data = await res.json();
      message = getErrorMessage(data);
    } catch {
      message = await res.text();
    }

    throw new Error(message || "Streaming request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const lines = event.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const rawData = line.slice(6);

        if (rawData === "[DONE]") {
          return;
        }

        try {
          const parsedToken = JSON.parse(rawData);

          if (typeof parsedToken === "string") {
            onToken(parsedToken);
          }
        } catch {
          onToken(rawData);
        }
      }
    }
  }
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
  return apiFetch("/api/ai/generate-quiz", {
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

export async function createNote(
  studyRoomId: number,
  titleOrContent: string,
  content?: string
) {
  return apiFetch("/api/notes", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      title: content ? titleOrContent : "Untitled Note",
      content: content || titleOrContent,
    }),
  });
}

export async function updateNote(
  noteId: number,
  title: string,
  content: string
) {
  return apiFetch(`/api/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title,
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

export async function getPDFs(studyRoomId: number) {
  return apiFetch(`/api/pdfs/${studyRoomId}`);
}

export async function deletePDF(pdfId: number) {
  return apiFetch(`/api/pdfs/${pdfId}`, {
    method: "DELETE",
  });
}

export async function summarizePDF(pdfId: number) {
  return apiFetch(`/api/pdfs/${pdfId}/summary`, {
    method: "POST",
  });
}

export async function chatWithPDF(pdfId: number, question: string) {
  return apiFetch(`/api/pdfs/${pdfId}/chat`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}
export async function createLearningEvent(data: {
  study_room_id?: number | null;
  activity_type: string;
  reference_id?: number | null;
  result?: string | null;
  confidence?: number | null;
}) {
  return apiFetch("/api/learning-events", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
