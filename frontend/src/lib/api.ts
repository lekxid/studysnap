import { API_BASE, getWebSocketBaseUrl } from "./apiBase";

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

async function readResponseError(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return fallbackMessage;
  }

  try {
    return getErrorMessage(JSON.parse(rawBody));
  } catch {
    return rawBody;
  }
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
    const message = await readResponseError(
      res,
      "Request failed"
    );
    throw new Error(message);
  }

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return res.json();
  }

  return res.text();
}


export async function getProtectedFileBlobUrl(
  path: string
): Promise<string> {
  const token = getToken();

  const response = await fetch(
    `${API_BASE}${path}`,
    {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
    }
  );

  if (!response.ok) {
    const message = await readResponseError(
      response,
      "The file could not be opened."
    );

    throw new Error(message);
  }

  return URL.createObjectURL(
    await response.blob()
  );
}

export async function hideAIAttachmentFromFeed(
  messageId: number
): Promise<{
  id: number;
  hidden_from_feed: boolean;
}> {
  return apiFetch(
    `/api/ai/attachments/${messageId}/feed?hidden=true`,
    {
      method: "PATCH",
    }
  ) as Promise<{
    id: number;
    hidden_from_feed: boolean;
  }>;
}

export async function pinAIAttachment(
  messageId: number,
  pinned: boolean
): Promise<{
  id: number;
  is_pinned: boolean;
}> {
  return apiFetch(
    `/api/ai/attachments/${messageId}/pin?pinned=${String(
      pinned
    )}`,
    {
      method: "PATCH",
    }
  ) as Promise<{
    id: number;
    is_pinned: boolean;
  }>;
}

export async function deleteAIAttachment(
  messageId: number
): Promise<{
  id: number;
  conversation_id: number;
  deleted: boolean;
  message: string;
}> {
  return apiFetch(
    `/api/ai/attachments/${messageId}`,
    {
      method: "DELETE",
    }
  ) as Promise<{
    id: number;
    conversation_id: number;
    deleted: boolean;
    message: string;
  }>;
}

export async function signup(
  name: string,
  email: string,
  password: string,
  inviteCode: string,
) {
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

export async function resetPassword(
  token: string,
  password: string,
) {
  return apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token,
      password,
    }),
  });
}

export type UserProfile = {
  id: number;
  email: string;
  full_name: string;
  learning_mode: string;
  greeting_emoji?: string | null;
  avatar_url?: string | null;
};

export const PROFILE_UPDATED_EVENT =
  "studysnap:profile-updated";

export async function getCurrentUser(): Promise<UserProfile> {
  return apiFetch("/api/auth/me");
}

export async function updateCurrentUserProfile(
  fullName: string,
  greetingEmoji?: string | null
): Promise<UserProfile> {
  return apiFetch("/api/users/me/profile", {
    method: "PUT",
    body: JSON.stringify({
      full_name: fullName,
      greeting_emoji: greetingEmoji,
    }),
  });
}

export async function uploadCurrentUserAvatar(
  file: File
): Promise<UserProfile> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch("/api/users/me/avatar", {
    method: "POST",
    body: formData,
  });
}

export async function removeCurrentUserAvatar(): Promise<void> {
  await apiFetch("/api/users/me/avatar", {
    method: "DELETE",
  });
}

export async function getCurrentUserAvatarBlob(): Promise<Blob | null> {
  const token = getToken();

  const response = await fetch(
    `${API_BASE}/api/users/me/avatar`,
    {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
      cache: "no-store",
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await readResponseError(
      response,
      "Could not load profile picture."
    );

    throw new Error(message);
  }

  return response.blob();
}

export function announceProfileUpdated(
  profile?: UserProfile
) {
  if (typeof window === "undefined") return;

  if (profile) {
    localStorage.setItem(
      "studysnap_user",
      JSON.stringify(profile)
    );
  }

  window.dispatchEvent(
    new CustomEvent(PROFILE_UPDATED_EVENT, {
      detail: profile,
    })
  );
}

export async function getDashboard() {
  return apiFetch("/api/dashboard");
}

export type DashboardActivityType =
  | "file"
  | "room"
  | "note"
  | "quiz"
  | "concept"
  | "ai"
  | "group"
  | "progress"
  | "plan";

export type DashboardMetadata = Record<
  string,
  unknown
>;

export type DashboardNextStep = {
  id: string;
  type: DashboardActivityType;
  title: string;
  description: string;
  icon: string;
  reason: string;
  action_label: string;
  action_href: string;
  room_id: number | null;
  metadata: DashboardMetadata;
};

export type DashboardAttentionItem = {
  id: string;
  type: DashboardActivityType;
  priority: number;
  title: string;
  description: string;
  icon: string;
  reason: string;
  room_id: number | null;
  action_label: string;
  action_href: string;
  created_at: string;
  metadata: DashboardMetadata;
};

export type DashboardContinueItem = {
  id: string;
  type: DashboardActivityType;
  title: string;
  description: string;
  icon: string;
  room_id: number | null;
  room_name: string | null;
  entity_type: string | null;
  entity_id: number | null;
  action_label: string;
  action_href: string;
  progress_percent: number | null;
  last_active_at: string;
  metadata: DashboardMetadata;
};

export type DashboardFeedItem = {
  id: string;
  type: DashboardActivityType;
  event: string;
  timestamp: string;
  title: string;
  description: string;
  icon: string;
  room_id: number | null;
  room_name: string | null;
  entity_type: string | null;
  entity_id: number | null;
  actor_name: string | null;
  action_label: string;
  action_href: string;
  priority: number;
  session_id: string | null;
  dedupe_key: string | null;
  metadata: DashboardMetadata;
};

export type DashboardEmptyState = {
  is_empty: boolean;
  title: string;
  description: string;
};

export type SmartDashboardResponse = {
  generated_at: string;
  next_step: DashboardNextStep;
  needs_attention: DashboardAttentionItem[];
  continue_learning: DashboardContinueItem[];
  group_activity: DashboardFeedItem[];
  feed: DashboardFeedItem[];
  pinned_feed?: DashboardFeedItem[];
  unread_group_count: number;
  next_cursor: string | null;
  has_more: boolean;
  empty_states: {
    needs_attention: DashboardEmptyState;
    continue_learning: DashboardEmptyState;
    group_activity: DashboardEmptyState;
    feed: DashboardEmptyState;
  };
  summary: {
    accessible_rooms: number;
    materials: number;
    notes: number;
    quizzes: number;
    quiz_attempts: number;
    ai_conversations: number;
    weak_topics: number;
    unread_group_messages: number;
  };
};

export type SmartDashboardOptions = {
  limit?: number;
  cursor?: string | null;
};

export async function getSmartDashboard(
  options: SmartDashboardOptions = {}
): Promise<SmartDashboardResponse> {
  const params = new URLSearchParams();

  params.set(
    "limit",
    String(options.limit || 20)
  );

  if (options.cursor) {
    params.set("cursor", options.cursor);
  }

  return apiFetch(
    `/api/dashboard/smart?${params.toString()}`
  ) as Promise<SmartDashboardResponse>;
}

export async function getLearningInsights() {
  const params = new URLSearchParams();

  if (typeof window !== "undefined") {
    params.set(
      "timezone_offset_minutes",
      String(new Date().getTimezoneOffset())
    );
  }

  const query = params.toString();

  return apiFetch(
    query ? `/api/learning-insights?${query}` : "/api/learning-insights"
  );
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


export async function askAiWithImage(
  question: string,
  image: File,
  options: { studyRoomId?: number; conversationId?: number | null
    signal?: AbortSignal;
  } = {}
) {
  const formData = new FormData();
  formData.append("question", question || "Describe this image clearly.");
  formData.append("image", image);

  if (typeof options.studyRoomId === "number") {
    formData.append("study_room_id", String(options.studyRoomId));
  }

  if (typeof options.conversationId === "number") {
    formData.append("conversation_id", String(options.conversationId));
  }

  return apiFetch("/api/ai/ask-image", {
    method: "POST",
    signal: options.signal,
    body: formData,
  });
}


export async function executeBrainAction(
  command: string,
  options: { studyRoomId?: number; conversationId?: number | null } = {}
) {
  return apiFetch("/api/brain/actions/execute", {
    method: "POST",
    body: JSON.stringify({
      command,
      study_room_id:
        typeof options.studyRoomId === "number" ? options.studyRoomId : null,
      conversation_id:
        typeof options.conversationId === "number" ? options.conversationId : null,
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

export type AIConversationSurface =
  | "general_ai"
  | "room_ai"
  | "pdf_ai"
  | "notes_ai"
  | "quiz_ai"
  | "concept_cards_ai"
  | "brain"
  | "planner_ai"
  | "smart_organizer"
  | "voice_ai";

export type AIConversation = {
  id: number;
  title: string;
  mode: string;
  surface: AIConversationSurface;
  study_room_id: number | null;
  context_type: string | null;
  context_id: number | null;
  is_pinned: boolean;
  owner_id: number;
  created_at: string;
  updated_at: string;
};

export type AIAttachment = {
  filename: string;
  file_size: number | null;
  content_type: string | null;
  kind: "image" | "file";
  hidden_from_feed: boolean;
  url: string;
};

export type AIMessage = {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  attachment?: AIAttachment | null;
};

export type GenerateAIImageSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536";

export type GenerateAIImageQuality =
  | "low"
  | "medium"
  | "high"
  | "auto";

export type GenerateAIImageOptions = {
  conversationId?: number | null;
  studyRoomId?: number | null;
  size?: GenerateAIImageSize;
  quality?: GenerateAIImageQuality;
};

export type GenerateAIImageResponse = {
  image_data_url: string | null;
  image_url: string | null;
  mime_type: string | null;
  model: string;
  prompt: string;
  revised_prompt?: string | null;
  conversation?: AIConversation | null;
  user_message?: AIMessage | null;
  assistant_message?: AIMessage | null;
};

export async function getAIAttachmentDataUrl(
  messageId: number
): Promise<string> {
  const token = getToken();

  const response = await fetch(
    `${API_BASE}/api/ai/attachments/${messageId}`,
    {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
    }
  );

  if (!response.ok) {
    throw new Error(
      "The saved image could not be opened."
    );
  }

  const imageBlob = await response.blob();

  return new Promise<string>(
    (resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const value = String(
          reader.result || ""
        );

        if (!value) {
          reject(
            new Error(
              "The saved image was empty."
            )
          );
          return;
        }

        resolve(value);
      };

      reader.onerror = () => {
        reject(
          new Error(
            "The saved image could not be read."
          )
        );
      };

      reader.readAsDataURL(imageBlob);
    }
  );
}


export async function generateAIImage(
  prompt: string,
  options: GenerateAIImageOptions = {}
): Promise<GenerateAIImageResponse> {
  const cleanPrompt = prompt.trim();

  if (!cleanPrompt) {
    throw new Error(
      "Describe the image you want StudySnap to create."
    );
  }

  return apiFetch("/api/ai/generate-image", {
    method: "POST",
    body: JSON.stringify({
      prompt: cleanPrompt,
      conversation_id:
        typeof options.conversationId === "number"
          ? options.conversationId
          : null,
      study_room_id:
        typeof options.studyRoomId === "number"
          ? options.studyRoomId
          : null,
      size: options.size || "1024x1024",
      quality: options.quality || "medium",
    }),
  }) as Promise<GenerateAIImageResponse>;
}


export type EditAIImageOptions =
  GenerateAIImageOptions & {
    identityImage?: File | null;
  };

export async function editAIImage(
  prompt: string,
  image: File,
  options: EditAIImageOptions = {}
): Promise<GenerateAIImageResponse> {
  const cleanPrompt = prompt.trim();

  if (!cleanPrompt) {
    throw new Error(
      "Describe how you want StudySnap to change the image."
    );
  }

  const formData = new FormData();

  formData.append(
    "prompt",
    cleanPrompt
  );

  formData.append(
    "image",
    image
  );

  if (
    options.identityImage &&
    options.identityImage !== image
  ) {
    formData.append(
      "identity_image",
      options.identityImage
    );
  }

  formData.append(
    "size",
    options.size || "1024x1024"
  );

  formData.append(
    "quality",
    options.quality || "high"
  );

  if (
    typeof options.conversationId ===
    "number"
  ) {
    formData.append(
      "conversation_id",
      String(options.conversationId)
    );
  }

  if (
    typeof options.studyRoomId ===
    "number"
  ) {
    formData.append(
      "study_room_id",
      String(options.studyRoomId)
    );
  }

  return apiFetch(
    "/api/ai/edit-image",
    {
      method: "POST",
      body: formData,
    }
  ) as Promise<GenerateAIImageResponse>;
}

export type CreateAIConversationOptions = {
  studyRoomId?: number | null;
  title?: string;
  mode?: string;
  surface?: AIConversationSurface;
  contextType?: string | null;
  contextId?: number | null;
  forceNew?: boolean;
};

export async function createAIConversation(
  studyRoomIdOrOptions: number | CreateAIConversationOptions | null,
  title = "New Conversation",
  conversationMode = "general"
): Promise<AIConversation> {
  const options: CreateAIConversationOptions =
    typeof studyRoomIdOrOptions === "object" &&
    studyRoomIdOrOptions !== null
      ? studyRoomIdOrOptions
      : {
          studyRoomId: studyRoomIdOrOptions,
          title,
          mode: conversationMode,
          surface:
            conversationMode === "pdf"
              ? "pdf_ai"
              : "room_ai",
        };

  return apiFetch("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({
      study_room_id:
        typeof options.studyRoomId === "number"
          ? options.studyRoomId
          : null,
      title: options.title || "New Conversation",
      mode: options.mode || "general",
      surface: options.surface || "general_ai",
      context_type: options.contextType || null,
      context_id:
        typeof options.contextId === "number"
          ? options.contextId
          : null,
      force_new: Boolean(options.forceNew),
    }),
  }) as Promise<AIConversation>;
}

export async function getStudyTrails(
  surface?: AIConversationSurface,
  search = "",
  limit = 100
): Promise<AIConversation[]> {
  const params = new URLSearchParams();

  if (surface) {
    params.set("surface", surface);
  }

  if (search.trim()) {
    params.set("search", search.trim());
  }

  params.set("limit", String(limit));

  return apiFetch(
    `/api/ai/trails?${params.toString()}`
  ) as Promise<AIConversation[]>;
}

export async function getAIConversations(
  studyRoomId: number,
  conversationMode = "general",
  surface?: AIConversationSurface
): Promise<AIConversation[]> {
  const params = new URLSearchParams();
  params.set("mode", conversationMode);

  if (surface) {
    params.set("surface", surface);
  }

  return apiFetch(
    `/api/ai/conversations/${studyRoomId}?${params.toString()}`
  ) as Promise<AIConversation[]>;
}

export async function updateAIConversation(
  conversationId: number,
  updates: {
    title?: string;
    isPinned?: boolean;
  }
): Promise<AIConversation> {
  return apiFetch(`/api/ai/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: updates.title,
      is_pinned: updates.isPinned,
    }),
  }) as Promise<AIConversation>;
}

export async function renameAIConversation(
  conversationId: number,
  title: string
): Promise<AIConversation> {
  return updateAIConversation(conversationId, { title });
}

export async function pinAIConversation(
  conversationId: number,
  isPinned: boolean
): Promise<AIConversation> {
  return updateAIConversation(conversationId, {
    isPinned,
  });
}

export async function deleteAIConversation(conversationId: number) {
  return apiFetch(`/api/ai/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export async function getAIMessages(
  conversationId: number
): Promise<AIMessage[]> {
  return apiFetch(
    `/api/ai/messages/${conversationId}`
  ) as Promise<AIMessage[]>;
}

export async function sendAIMessage(
  conversationId: number,
  content: string,
  mode = "explain",
  context = ""
) {
  return apiFetch("/api/ai/messages", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      content,
      mode,
      context,
    }),
  });
}

export async function recordAIConversationExchange(
  conversationId: number,
  userContent: string,
  assistantContent: string
) {
  return apiFetch("/api/ai/messages/record", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      user_content: userContent,
      assistant_content: assistantContent,
    }),
  });
}

export async function cancelAIMessage(
  requestId: string
) {
  return apiFetch(
    "/api/ai/messages/cancel",
    {
      method: "POST",
      body: JSON.stringify({
        request_id: requestId,
      }),
    }
  );
}

export type StreamAIMessageOptions = {
  signal?: AbortSignal;
  onConnected?: () => void;
  requestId?: string;
};

export async function streamAIMessage(
  conversationId: number,
  content: string,
  mode = "explain",
  onToken: (token: string) => void,
  context = "",
  options: StreamAIMessageOptions = {},
) {
  const token = getToken();

  const headers = new Headers();

  headers.set(
    "Content-Type",
    "application/json"
  );

  headers.set(
    "Accept",
    "text/event-stream"
  );

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`
    );
  }

  const res = await fetch(
    `${API_BASE}/api/ai/messages/stream`,
    {
      method: "POST",
      headers,
      cache: "no-store",
      signal: options.signal,
      body: JSON.stringify({
        conversation_id: conversationId,
        content,
        mode,
        context,
        request_id:
          options.requestId || null,
      }),
    }
  );

  if (!res.ok) {
    const message =
      await readResponseError(
        res,
        "Streaming request failed"
      );

    throw new Error(message);
  }

  if (!res.body) {
    throw new Error(
      "Streaming response did not "
      + "include a readable body."
    );
  }

  options.onConnected?.();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let finished = false;

  function processEvent(
    eventText: string
  ) {
    const normalized =
      eventText.replace(
        /\r\n/g,
        "\n"
      );

    for (
      const line
      of normalized.split("\n")
    ) {
      if (
        !line.startsWith("data:")
      ) {
        continue;
      }

      const rawData =
        line.slice(5).trimStart();

      if (rawData === "[DONE]") {
        finished = true;
        return;
      }

      try {
        const parsed =
          JSON.parse(rawData);

        if (
          typeof parsed === "string"
        ) {
          onToken(parsed);
        }
      } catch {
        if (rawData) {
          onToken(rawData);
        }
      }
    }
  }

  while (!finished) {
    const {
      value,
      done,
    } = await reader.read();

    if (value) {
      buffer += decoder.decode(
        value,
        {
          stream: !done,
        }
      );
    }

    buffer = buffer.replace(
      /\r\n/g,
      "\n"
    );

    let boundary =
      buffer.indexOf("\n\n");

    while (boundary !== -1) {
      const eventText =
        buffer.slice(0, boundary);

      buffer =
        buffer.slice(boundary + 2);

      processEvent(eventText);

      if (finished) {
        break;
      }

      boundary =
        buffer.indexOf("\n\n");
    }

    if (done) {
      buffer += decoder.decode();

      const remaining =
        buffer.trim();

      if (remaining) {
        processEvent(remaining);
      }

      break;
    }
  }

  try {
    await reader.cancel();
  } catch {
    // Stream already closed.
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

export type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string;
  owner_id?: number;
  created_at?: string;
};

export async function getStudyRooms(): Promise<StudyRoom[]> {
  return apiFetch("/api/study-rooms") as Promise<StudyRoom[]>;
}

export async function getStudyRoom(
  id: number
): Promise<StudyRoom> {
  return apiFetch(
    `/api/study-rooms/${id}`
  ) as Promise<StudyRoom>;
}

export type RoomInvitationRole =
  | "member"
  | "viewer"
  | "ai_tutor";

export type RoomEmailInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired";

export type RoomInviteLinkStatus =
  | "active"
  | "revoked"
  | "expired"
  | "exhausted";

export type RoomEmailInvitation = {
  id: number;
  room_id: number;
  invited_by_user_id: number;
  invited_email: string;
  role: RoomInvitationRole;
  status: RoomEmailInvitationStatus;
  expires_at: string | null;
  accepted_by_user_id: number | null;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
};

export type RoomInviteLink = {
  id: number;
  room_id: number;
  created_by_user_id: number;
  role: RoomInvitationRole;
  status: RoomInviteLinkStatus;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string | null;
};

export type RoomInvitationList = {
  room_id: number;
  email_invitations: RoomEmailInvitation[];
  share_links: RoomInviteLink[];
};

export type CreateRoomEmailInvitationResponse = {
  invitation: RoomEmailInvitation;
  delivery: {
    status: string;
    message: string;
  };
  accept_token: string;
  accept_api_path: string;
  frontend_accept_url: string;
};

export type CreateRoomInviteLinkResponse = {
  link: RoomInviteLink;
  share_token: string;
  join_api_path: string;
  share_url: string;
};

export type RoomInvitationMembership = {
  room_id: number;
  user_id: number;
  role: string;
  status: string;
};

export type RoomInvitationJoinResponse = {
  message: string;
  already_member: boolean;
  room: {
    id: number;
    name: string;
    subject: string | null;
  };
  membership: RoomInvitationMembership;
  link_status?: RoomInviteLinkStatus;
};

export async function getRoomInvitations(
  roomId: number
): Promise<RoomInvitationList> {
  return apiFetch(
    `/api/room-invitations/rooms/${roomId}`
  ) as Promise<RoomInvitationList>;
}

export async function createRoomEmailInvitation(
  roomId: number,
  email: string,
  role: RoomInvitationRole = "member",
  expiresInDays = 7
): Promise<CreateRoomEmailInvitationResponse> {
  return apiFetch(
    `/api/room-invitations/rooms/${roomId}/email`,
    {
      method: "POST",
      body: JSON.stringify({
        email,
        role,
        expires_in_days: expiresInDays,
      }),
    }
  ) as Promise<CreateRoomEmailInvitationResponse>;
}

export async function revokeRoomEmailInvitation(
  roomId: number,
  invitationId: number
): Promise<{
  message: string;
  invitation: RoomEmailInvitation;
}> {
  return apiFetch(
    `/api/room-invitations/rooms/${roomId}/email/${invitationId}`,
    {
      method: "DELETE",
    }
  ) as Promise<{
    message: string;
    invitation: RoomEmailInvitation;
  }>;
}

export async function createRoomInviteLink(
  roomId: number,
  role: RoomInvitationRole = "member",
  expiresInDays = 7,
  maxUses: number | null = null
): Promise<CreateRoomInviteLinkResponse> {
  return apiFetch(
    `/api/room-invitations/rooms/${roomId}/links`,
    {
      method: "POST",
      body: JSON.stringify({
        role,
        expires_in_days: expiresInDays,
        max_uses: maxUses,
      }),
    }
  ) as Promise<CreateRoomInviteLinkResponse>;
}

export async function revokeRoomInviteLink(
  roomId: number,
  linkId: number
): Promise<{
  message: string;
  link: RoomInviteLink;
}> {
  return apiFetch(
    `/api/room-invitations/rooms/${roomId}/links/${linkId}`,
    {
      method: "DELETE",
    }
  ) as Promise<{
    message: string;
    link: RoomInviteLink;
  }>;
}

export async function acceptRoomEmailInvitation(
  token: string
): Promise<RoomInvitationJoinResponse> {
  return apiFetch(
    `/api/room-invitations/email/${encodeURIComponent(token)}/accept`,
    {
      method: "POST",
    }
  ) as Promise<RoomInvitationJoinResponse>;
}

export async function declineRoomEmailInvitation(
  token: string
): Promise<{
  message: string;
  invitation: RoomEmailInvitation;
}> {
  return apiFetch(
    `/api/room-invitations/email/${encodeURIComponent(token)}/decline`,
    {
      method: "POST",
    }
  ) as Promise<{
    message: string;
    invitation: RoomEmailInvitation;
  }>;
}

export async function joinRoomWithInviteLink(
  token: string
): Promise<RoomInvitationJoinResponse> {
  return apiFetch(
    `/api/room-invitations/links/${encodeURIComponent(token)}/join`,
    {
      method: "POST",
    }
  ) as Promise<RoomInvitationJoinResponse>;
}

export type RoomFoundationAction = {
  id: string;
  label: string;
  description: string;
  output_type: string;
  future?: boolean;
};

export type RoomFoundation = {
  room: {
    id: number;
    name: string;
    subject?: string | null;
    description?: string | null;
  };
  user_role: string;
  permissions: string[];
  actions?: RoomFoundationAction[];
  available_actions?: RoomFoundationAction[];
  output_types: string[];
  context_engine: {
    active_context: string | null;
    available_sources: string[];
    memory_bucket_types: string[];
    status: string;
  };
  realtime: {
    enabled: boolean;
    channel: string;
    note: string;
  };
};

export async function getRoomFoundation(
  studyRoomId: number
): Promise<RoomFoundation> {
  return apiFetch(`/api/room-foundation/${studyRoomId}`) as Promise<RoomFoundation>;
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

async function downloadPdfResponse(res: Response, fallbackFilename: string) {
  if (!res.ok) {
    const message = await readResponseError(
      res,
      "Failed to download PDF."
    );
    throw new Error(message);
  }

  const blob = await res.blob();
  const contentDisposition = res.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch?.[1] || fallbackFilename;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}

export async function downloadNotePdf(noteId: number) {
  const token = getToken();

  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}/api/notes/${noteId}/download-pdf`, {
    method: "GET",
    headers,
  });

  await downloadPdfResponse(res, `studysnap-note-${noteId}.pdf`);
}

export async function downloadAITextPdf(
  title: string,
  content: string,
  subtitle = "Exported from StudySnap AI Workspace"
) {
  const token = getToken();

  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}/api/notes/export-pdf`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      content,
      subtitle,
    }),
  });

  await downloadPdfResponse(res, "studysnap-ai-export.pdf");
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

export type QuizQuestionInput = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation?: string | null;
};

export type QuizQuestionResult = QuizQuestionInput & {
  id: number;
  quiz_id: number;
  created_at?: string;
};

export type QuizWithQuestions = {
  id: number;
  title: string;
  study_room_id: number;
  owner_id: number;
  created_at?: string;
  questions: QuizQuestionResult[];
};

export async function getQuizzes(studyRoomId: number) {
  return apiFetch(`/api/quizzes/${studyRoomId}`) as Promise<QuizWithQuestions[]>;
}

export async function createQuiz(
  studyRoomId: number,
  title: string,
  questions: QuizQuestionInput[] = []
) {
  return apiFetch("/api/quizzes", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      title,
      questions,
    }),
  }) as Promise<QuizWithQuestions>;
}

export async function deleteQuiz(quizId: number) {
  return apiFetch(`/api/quizzes/${quizId}`, {
    method: "DELETE",
  });
}


export async function generateQuizFromContent(
  studyRoomId: number,
  title: string,
  content: string
) {
  return apiFetch("/api/ai/generate-quiz", {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      title,
      content,
    }),
  });
}

export async function getPDFs(studyRoomId: number) {
  return apiFetch(`/api/pdfs/${studyRoomId}`);
}

export type StudyMaterialItem = {
  id: number;
  original_filename: string;
  file_size: number;
  content_type: string | null;
  material_type: string;
  processing_status: string;
  preview_available: boolean;
  purpose_category: string | null;
  content_category: string | null;
  detected_topic: string | null;
  intelligence_summary: string | null;
  classification_confidence: number | null;
  intelligence_status:
    | "pending"
    | "processing"
    | "ready"
    | "failed";
  intelligence_error: string | null;
  analyzed_at: string | null;
  study_room_id: number;
  created_by_user_id: number;
  created_at: string;
  last_opened_at: string | null;
};

export type StudyMaterialListResponse = {
  study_room_id: number;
  materials: StudyMaterialItem[];
};

export async function getStudyMaterials(
  studyRoomId: number
): Promise<StudyMaterialListResponse> {
  return apiFetch(
    `/api/materials/room/${studyRoomId}`
  ) as Promise<StudyMaterialListResponse>;
}

export async function openStudyMaterial(
  materialId: number,
  fallbackFilename: string
) {
  const token = getToken();
  const headers = new Headers();

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`
    );
  }

  const previewWindow = window.open(
    "about:blank",
    "_blank"
  );

  if (previewWindow) {
    previewWindow.opener = null;
    previewWindow.document.title =
      `Opening ${fallbackFilename}`;
  }

  const response = await fetch(
    `${API_BASE}/api/materials/${materialId}/download`,
    {
      method: "GET",
      headers,
    }
  );

  if (!response.ok) {
    previewWindow?.close();

    const message = await readResponseError(
      response,
      "The material could not be opened."
    );

    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl =
    window.URL.createObjectURL(blob);

  if (previewWindow) {
    previewWindow.location.replace(objectUrl);
  } else {
    const link = document.createElement("a");

    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 5 * 60 * 1000);
}


export async function downloadStudyMaterial(
  materialId: number,
  fallbackFilename: string
) {
  const token = getToken();
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${API_BASE}/api/materials/${materialId}/download`,
    {
      method: "GET",
      headers,
    }
  );

  await downloadPdfResponse(
    response,
    fallbackFilename || `studysnap-material-${materialId}`
  );
}

export async function analyzeStudyMaterial(
  materialId: number
): Promise<StudyMaterialItem> {
  return apiFetch(
    `/api/materials/${materialId}/analyze`,
    {
      method: "POST",
    }
  ) as Promise<StudyMaterialItem>;
}


export async function deleteStudyMaterial(
  materialId: number
) {
  return apiFetch(`/api/materials/${materialId}`, {
    method: "DELETE",
  });
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
  concept_id?: string | null;
  concept_name?: string | null;
  concept_type?: string | null;
  source?: string | null;
}) {
  const result = await apiFetch(
    "/api/learning-events",
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );

  if (typeof window !== "undefined") {
    const updatedAt = new Date().toISOString();

    window.localStorage.setItem(
      "studysnap:last-learning-progress-update",
      updatedAt
    );

    window.dispatchEvent(
      new CustomEvent(
        "studysnap:learning-progress-updated",
        {
          detail: {
            updatedAt,
            activityType: data.activity_type,
          },
        }
      )
    );
  }

  return result;
}

export type UniversalSearchResult = {
  type: "project" | "note" | "pdf" | "flashcard";
  id: number;
  title: string;
  subtitle: string;
  href: string;
  score: number;
};

export type UniversalSearchResponse = {
  query: string;
  results: UniversalSearchResult[];
};

export async function universalSearch(q: string, limit = 12) {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });

  return apiFetch(`/api/search?${params.toString()}`) as Promise<UniversalSearchResponse>;
}

export type BrainConceptInsight = {
  concept_id: string;
  concept_name: string;
  concept_type: string;
  mastery_score: number;
  confidence: number;
  strength: string;
  seen_count: number;
  review_count: number;
  needs_review: boolean;
  last_seen: string | null;
  last_reviewed: string | null;
};

export type BrainInsights = {
  user_id: number;
  study_room_id: number | null;
  concept_count: number;
  average_mastery: number;
  mastered_count: number;
  developing_count: number;
  weak_count: number;
  needs_review_count: number;
  mastered_concepts: BrainConceptInsight[];
  developing_concepts: BrainConceptInsight[];
  weak_concepts: BrainConceptInsight[];
  review_queue: BrainConceptInsight[];
};

export async function getBrainInsights(studyRoomId?: number) {
  const params = new URLSearchParams();

  if (typeof studyRoomId === "number") {
    params.set("study_room_id", String(studyRoomId));
  }

  const query = params.toString();

  return apiFetch(
    query ? `/api/brain/insights?${query}` : "/api/brain/insights"
  ) as Promise<BrainInsights>;
}


export type BrainSource = {
  source_type: string;
  source_id: string;
  title: string;
  text: string;
  score: number;
  reason: string;
  metadata: Record<string, unknown>;
};

export type BrainAnswerMetadata = {
  query?: string;
  requested_study_room_id?: number | null;
  effective_study_room_id?: number | null;
  source_count?: number;
  retrieval_count?: number;
  used_retrieval_count?: number;
  has_learning_profile?: boolean;
  has_coach?: boolean;
  coach_priority?: string | null;
  model?: string;
  usage?: Record<string, unknown> | null;
};

export type BrainAnswerResponse = {
  id?: number;
  answer: string;
  sources: BrainSource[];
  metadata: BrainAnswerMetadata;
  created_at?: string;
};

export type BrainHistoryItem = {
  id: number;
  question: string;
  answer: string;
  sources: BrainSource[];
  metadata: BrainAnswerMetadata;
  study_room_id: number | null;
  owner_id: number;
  created_at: string;
};

export type SaveBrainHistoryAsNoteResponse = {
  saved: boolean;
  already_saved?: boolean;
  note: {
    id: number;
    title: string;
    content: string;
    study_room_id: number;
    owner_id: number;
    created_at: string;
  };
};

export type DeleteBrainHistoryResponse = {
  deleted: boolean;
  id: number;
};

export async function askBrain(
  question: string,
  studyRoomId: number | null = null,
  limit = 6
): Promise<BrainAnswerResponse> {
  return apiFetch("/api/brain/answer", {
    method: "POST",
    body: JSON.stringify({
      question,
      study_room_id: studyRoomId,
      limit,
    }),
  }) as Promise<BrainAnswerResponse>;
}


export async function getBrainHistory(
  limit = 10,
  studyRoomId: number | null = null
): Promise<BrainHistoryItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  if (studyRoomId !== null) {
    params.set("study_room_id", String(studyRoomId));
  }

  return apiFetch(`/api/brain/history?${params.toString()}`) as Promise<
    BrainHistoryItem[]
  >;
}

export async function saveBrainHistoryAsNote(
  historyId: number,
  studyRoomId: number | null = null,
  title?: string
): Promise<SaveBrainHistoryAsNoteResponse> {
  return apiFetch(`/api/brain/history/${historyId}/save-note`, {
    method: "POST",
    body: JSON.stringify({
      study_room_id: studyRoomId,
      title: title || null,
    }),
  }) as Promise<SaveBrainHistoryAsNoteResponse>;
}

export async function deleteBrainHistory(
  historyId: number
): Promise<DeleteBrainHistoryResponse> {
  return apiFetch(`/api/brain/history/${historyId}`, {
    method: "DELETE",
  }) as Promise<DeleteBrainHistoryResponse>;
}


export type BrainRetrieveResponse = {
  query: string;
  study_room_id?: number | null;
  limit?: number;
  count?: number;
  results: BrainSource[];
};

export async function retrieveBrain(
  query: string,
  studyRoomId: number | null = null,
  limit = 8
): Promise<BrainRetrieveResponse> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(limit));

  if (studyRoomId !== null) {
    params.set("study_room_id", String(studyRoomId));
  }

  return apiFetch(`/api/brain/retrieve?${params.toString()}`) as Promise<
    BrainRetrieveResponse
  >;
}

export type SyncedUserSettings = {
  id: number;
  user_id: number;

  learning_mode: string;
  knowledge_level: string;
  progress_sharing: string;
  favorite_subject: string;
  selected_subjects: string[];
  daily_goal: string;
  notifications: string;

  theme: string;

  ai_memory_enabled: boolean;
  save_notes_to_memory: boolean;
  save_flashcards_to_memory: boolean;
  save_quiz_results_to_memory: boolean;
  save_weak_strong_concepts: boolean;
  save_study_history: boolean;

  connected_apps: Record<string, { connected?: boolean; last_synced_at?: string | null }>;
  auto_import_rules: Record<string, boolean>;

  last_opened_subject?: string | null;
  last_opened_pdf_id?: number | null;
  last_ai_conversation_id?: number | null;
};

export type SyncedUserSettingsUpdate = Partial<
  Omit<SyncedUserSettings, "id" | "user_id">
>;

export async function getUserSettings(): Promise<SyncedUserSettings> {
  return apiFetch("/api/users/me/settings");
}

export async function updateUserSettings(
  settings: SyncedUserSettingsUpdate
): Promise<SyncedUserSettings> {
  return apiFetch("/api/users/me/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export type GoogleDriveIntegrationStatus = {
  provider: string;
  configured: boolean;
  connected: boolean;
  account_email?: string | null;
  scopes?: string | null;
  last_synced_at?: string | null;
};

export async function getGoogleDriveStatus(): Promise<GoogleDriveIntegrationStatus> {
  return apiFetch("/api/integrations/google/status");
}

export async function getGoogleDriveConnectUrl(): Promise<{
  authorization_url: string;
}> {
  return apiFetch("/api/integrations/google/connect-url");
}

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string | null;
  size?: string | null;
  webViewLink?: string | null;
  iconLink?: string | null;
};

export type GoogleDriveFilesResponse = {
  provider: string;
  account_email?: string | null;
  files: GoogleDriveFile[];
  next_page_token?: string | null;
};

export async function getGoogleDriveFiles(
  options: {
    pageSize?: number;
    pageToken?: string | null;
    search?: string;
  } = {}
): Promise<GoogleDriveFilesResponse> {
  const params = new URLSearchParams();

  params.set("page_size", String(options.pageSize || 10));

  if (options.pageToken) {
    params.set("page_token", options.pageToken);
  }

  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }

  return apiFetch(
    `/api/integrations/google/files?${params.toString()}`
  ) as Promise<GoogleDriveFilesResponse>;
}


export type GoogleDrivePDFImportResponse = {
  provider: string;
  account_email?: string | null;
  message: string;
  pdf: {
    id: number;
    original_filename: string;
    stored_filename: string;
    file_path: string;
    file_size: number;
    extracted_text?: string | null;
    study_room_id: number;
    owner_id: number;
    created_at?: string | null;
  };
};

export async function importGoogleDrivePDF(
  fileId: string,
  studyRoomId: number
): Promise<GoogleDrivePDFImportResponse> {
  return apiFetch("/api/integrations/google/import-pdf", {
    method: "POST",
    body: JSON.stringify({
      file_id: fileId,
      study_room_id: studyRoomId,
    }),
  }) as Promise<GoogleDrivePDFImportResponse>;
}

export type UserSession = {
  id: number;
  device_name: string;
  browser: string;
  operating_system: string;
  ip_address?: string | null;
  is_trusted: boolean;
  is_current: boolean;
  created_at: string;
  last_active_at: string;
  revoked_at?: string | null;
};

export async function getUserSessions(): Promise<UserSession[]> {
  return apiFetch("/api/sessions");
}

export async function revokeUserSession(sessionId: number) {
  return apiFetch(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function logoutCurrentSession() {
  return apiFetch("/api/sessions/logout-current", {
    method: "POST",
  });
}

export async function signOutCurrentSession() {
  try {
    await logoutCurrentSession();
  } catch (error) {
    console.warn("Could not revoke current session before logout.", error);
  } finally {
    removeToken();
  }
}

export async function logoutOtherSessions() {
  return apiFetch("/api/sessions/logout-others", {
    method: "POST",
  });
}

export async function logoutAllSessions() {
  return apiFetch("/api/sessions/logout-all", {
    method: "POST",
  });
}

export type AskAIWithFilesResponse = {
  answer: string;
  count: number;
  attachments: AIMessage[];
  assistant_message?: AIMessage | null;
};

export type SmartOrganizerItem = {
  filename: string;
  material_type: string;
  topic: string;
  room: StudyRoom;
  saved_as: string;
  saved_id: number;
  generated_flashcards: number;
  generated_quizzes: number;
  generated_quiz_questions: number;
};

export type SmartOrganizerResult = {
  organized_count: number;
  rooms: StudyRoom[];
  generated_flashcards: number;
  generated_quizzes: number;
  generated_quiz_questions: number;
  items: SmartOrganizerItem[];
};

export async function organizeFilesIntoStudyRooms(
  files: File[]
): Promise<SmartOrganizerResult> {
  if (!files.length) {
    throw new Error(
      "Choose at least one file to create a study room."
    );
  }

  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file, file.name);
  });

  formData.append("assignments_json", "{}");

  return apiFetch(
    "/api/smart-organizer/organize",
    {
      method: "POST",
      body: formData,
    }
  ) as Promise<SmartOrganizerResult>;
}

export function askAiWithFiles({
  question,
  files,
  conversationId,
  studyRoomId,
  onProgress,
  signal,
}: {
  question: string;
  files: File[];
  conversationId?: number | null;
  studyRoomId?: number | null;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<AskAIWithFilesResponse> {
  return new Promise((resolve, reject) => {
    if (!files.length) {
      reject(
        new Error("Choose at least one file.")
      );
      return;
    }

    const xhr = new XMLHttpRequest();
    const token = getToken();
    const formData = new FormData();

    formData.append(
      "question",
      question.trim() ||
        "Explain these files clearly."
    );

    files.forEach((file) => {
      formData.append(
        "files",
        file,
        file.name
      );
    });

    if (
      typeof conversationId === "number"
    ) {
      formData.append(
        "conversation_id",
        String(conversationId)
      );
    }

    if (
      typeof studyRoomId === "number"
    ) {
      formData.append(
        "study_room_id",
        String(studyRoomId)
      );
    }

    xhr.open(
      "POST",
      `${API_BASE}/api/ai/ask-files`
    );

    if (token) {
      xhr.setRequestHeader(
        "Authorization",
        `Bearer ${token}`
      );
    }

    xhr.upload.addEventListener(
      "progress",
      (event) => {
        if (!event.lengthComputable) return;

        onProgress?.(
          Math.min(
            99,
            Math.max(
              0,
              Math.round(
                (event.loaded /
                  event.total) *
                  100
              )
            )
          )
        );
      }
    );

    xhr.addEventListener("load", () => {
      if (
        xhr.status >= 200 &&
        xhr.status < 300
      ) {
        onProgress?.(100);

        try {
          resolve(
            JSON.parse(
              xhr.responseText
            ) as AskAIWithFilesResponse
          );
        } catch {
          reject(
            new Error(
              "StudySnap returned an unreadable response."
            )
          );
        }

        return;
      }

      try {
        const data = JSON.parse(
          xhr.responseText
        ) as {
          detail?: string;
          message?: string;
        };

        reject(
          new Error(
            data.detail ||
              data.message ||
              "The files could not be uploaded."
          )
        );
      } catch {
        reject(
          new Error(
            xhr.responseText ||
              "The files could not be uploaded."
          )
        );
      }
    });

    xhr.addEventListener(
      "error",
      () => {
        reject(
          new Error(
            "The upload was interrupted."
          )
        );
      }
    );

    xhr.addEventListener(
      "abort",
      () => {
        reject(
          new DOMException(
            "The upload was cancelled.",
            "AbortError"
          )
        );
      }
    );

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }

      signal.addEventListener(
        "abort",
        () => xhr.abort(),
        { once: true }
      );
    }

    xhr.send(formData);
  });
}


export type AskAIWithFileResponse = {
  answer: string;
  filename?: string;
  file_kind?: string;
  user_message?: AIMessage | null;
  assistant_message?: AIMessage | null;
};

export async function askAiWithFile(
  question: string,
  file: File,
  options: {
    conversationId?: number | null;
    studyRoomId?: number | null;
    signal?: AbortSignal;
  } = {},
): Promise<AskAIWithFileResponse> {
  const formData = new FormData();

  formData.append(
    "question",
    question.trim() || "Summarize this file clearly.",
  );

  formData.append("file", file, file.name);

  if (typeof options.conversationId === "number") {
    formData.append(
      "conversation_id",
      String(options.conversationId),
    );
  }

  if (typeof options.studyRoomId === "number") {
    formData.append(
      "study_room_id",
      String(options.studyRoomId),
    );
  }

  return apiFetch("/api/ai/ask-file", {
    method: "POST",
    signal: options.signal,
    body: formData,
  }) as Promise<AskAIWithFileResponse>;
}

export type UniversalMaterialUploadResponse = {
  id: number;
  original_filename: string;
  file_size: number;
  content_type?: string | null;
  material_type: string;
  processing_status:
    | "ready"
    | "stored_only"
    | "quarantined";
  preview_available: boolean;
  study_room_id: number;
  created_at?: string | null;
  sha256?: string;
  message?: string;
  security?: {
    private_to_owner: boolean;
    automatic_execution: boolean;
    basic_executable_check: boolean;
  };
};

export type UniversalMaterialListItem = {
  id: number;
  original_filename: string;
  file_size: number;
  content_type?: string | null;
  material_type: string;
  processing_status:
    | "ready"
    | "stored_only"
    | "quarantined";
  preview_available: boolean;
  study_room_id: number;
  created_at?: string | null;
  last_opened_at?: string | null;
};


export type ResumableUploadSession = {
  upload_id: string;
  study_room_id: number;
  filename: string;
  file_size: number;
  content_type: string;
  chunk_size: number;
  total_chunks: number;
  uploaded_chunks: number[];
  uploaded_bytes?: number;
};

export async function startResumableMaterialUpload({
  file,
  studyRoomId,
}: {
  file: File;
  studyRoomId: number;
}): Promise<ResumableUploadSession> {
  return apiFetch(
    "/api/materials/resumable/start",
    {
      method: "POST",
      body: JSON.stringify({
        study_room_id: studyRoomId,
        filename: file.name,
        file_size: file.size,
        content_type:
          file.type ||
          "application/octet-stream",
      }),
    }
  ) as Promise<ResumableUploadSession>;
}

export async function getResumableMaterialUpload(
  uploadId: string
): Promise<ResumableUploadSession> {
  return apiFetch(
    `/api/materials/resumable/${uploadId}`
  ) as Promise<ResumableUploadSession>;
}

function uploadMaterialChunk({
  uploadId,
  chunkIndex,
  chunk,
  signal,
}: {
  uploadId: string;
  chunkIndex: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = getToken();

    xhr.open(
      "PUT",
      `${API_BASE}/api/materials/resumable/${uploadId}/chunks/${chunkIndex}`
    );

    xhr.setRequestHeader(
      "Content-Type",
      "application/octet-stream"
    );

    if (token) {
      xhr.setRequestHeader(
        "Authorization",
        `Bearer ${token}`
      );
    }

    xhr.addEventListener("load", () => {
      if (
        xhr.status >= 200 &&
        xhr.status < 300
      ) {
        resolve();
        return;
      }

      let message =
        `Chunk upload failed with status ${xhr.status}.`;

      try {
        const body = JSON.parse(
          xhr.responseText
        ) as {
          detail?: string;
        };

        if (
          typeof body.detail === "string"
        ) {
          message = body.detail;
        }
      } catch {
        // Keep fallback.
      }

      reject(new Error(message));
    });

    xhr.addEventListener("error", () => {
      reject(
        new Error(
          "The upload could not reach StudySnap."
        )
      );
    });

    xhr.addEventListener("abort", () => {
      reject(
        new DOMException(
          "Upload paused.",
          "AbortError"
        )
      );
    });

    const abort = () => xhr.abort();

    signal?.addEventListener(
      "abort",
      abort,
      { once: true }
    );

    xhr.addEventListener("loadend", () => {
      signal?.removeEventListener(
        "abort",
        abort
      );
    });

    xhr.send(chunk);
  });
}

export async function completeResumableMaterialUpload(
  uploadId: string
): Promise<UniversalMaterialUploadResponse> {
  return apiFetch(
    `/api/materials/resumable/${uploadId}/complete`,
    {
      method: "POST",
    }
  ) as Promise<UniversalMaterialUploadResponse>;
}

export async function cancelResumableMaterialUpload(
  uploadId: string
): Promise<void> {
  await apiFetch(
    `/api/materials/resumable/${uploadId}`,
    {
      method: "DELETE",
    }
  );
}

export async function uploadResumableMaterial({
  file,
  studyRoomId,
  existingUploadId,
  onProgress,
  onSession,
  signal,
}: {
  file: File;
  studyRoomId: number;
  existingUploadId?: string;
  onProgress?: (percent: number) => void;
  onSession?: (uploadId: string) => void;
  signal?: AbortSignal;
}): Promise<UniversalMaterialUploadResponse> {
  const session = existingUploadId
    ? await getResumableMaterialUpload(
        existingUploadId
      )
    : await startResumableMaterialUpload({
        file,
        studyRoomId,
      });

  onSession?.(session.upload_id);

  const uploaded = new Set(
    session.uploaded_chunks ?? []
  );

  const chunkSize = session.chunk_size;
  const totalChunks = session.total_chunks;

  let uploadedBytes =
    session.uploaded_bytes ??
    Array.from(uploaded).reduce(
      (total, chunkIndex) => {
        const start =
          chunkIndex * chunkSize;

        const end = Math.min(
          file.size,
          start + chunkSize
        );

        return total + (end - start);
      },
      0
    );

  onProgress?.(
    Math.min(
      99,
      Math.round(
        (uploadedBytes / file.size) * 100
      )
    )
  );

  for (
    let chunkIndex = 0;
    chunkIndex < totalChunks;
    chunkIndex += 1
  ) {
    if (signal?.aborted) {
      throw new DOMException(
        "Upload paused.",
        "AbortError"
      );
    }

    if (uploaded.has(chunkIndex)) {
      continue;
    }

    const start =
      chunkIndex * chunkSize;

    const end = Math.min(
      file.size,
      start + chunkSize
    );

    const chunk = file.slice(
      start,
      end
    );

    await uploadMaterialChunk({
      uploadId: session.upload_id,
      chunkIndex,
      chunk,
      signal,
    });

    uploadedBytes += chunk.size;

    onProgress?.(
      Math.min(
        99,
        Math.round(
          (uploadedBytes / file.size) * 100
        )
      )
    );
  }

  const result =
    await completeResumableMaterialUpload(
      session.upload_id
    );

  onProgress?.(100);

  return result;
}


export function uploadUniversalMaterial({
  file,
  studyRoomId,
  onProgress,
  signal,
}: {
  file: File;
  studyRoomId: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<UniversalMaterialUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = getToken();

    xhr.open(
      "POST",
      `${API_BASE}/api/materials/upload`
    );

    if (token) {
      xhr.setRequestHeader(
        "Authorization",
        `Bearer ${token}`
      );
    }

    xhr.upload.addEventListener(
      "progress",
      (event) => {
        if (!event.lengthComputable) return;

        const percent = Math.min(
          99,
          Math.max(
            0,
            Math.round(
              (event.loaded / event.total) * 100
            )
          )
        );

        onProgress?.(percent);
      }
    );

    xhr.addEventListener("load", () => {
      let body: unknown = null;

      try {
        body = xhr.responseText
          ? JSON.parse(xhr.responseText)
          : null;
      } catch {
        body = xhr.responseText;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(
          body as UniversalMaterialUploadResponse
        );
        return;
      }

      reject(
        new Error(
          getErrorMessage(body) ||
            `Upload failed with status ${xhr.status}.`
        )
      );
    });

    xhr.addEventListener("error", () => {
      reject(
        new Error(
          "The upload could not reach StudySnap."
        )
      );
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled."));
    });

    const abortUpload = () => {
      xhr.abort();
    };

    signal?.addEventListener(
      "abort",
      abortUpload,
      { once: true }
    );

    xhr.addEventListener("loadend", () => {
      signal?.removeEventListener(
        "abort",
        abortUpload
      );
    });

    const formData = new FormData();

    formData.append(
      "study_room_id",
      String(studyRoomId)
    );

    formData.append(
      "file",
      file,
      file.name
    );

    xhr.send(formData);
  });
}

export async function getRoomMaterials(
  studyRoomId: number
): Promise<{
  study_room_id: number;
  materials: UniversalMaterialListItem[];
}> {
  return apiFetch(
    `/api/materials/room/${studyRoomId}`
  ) as Promise<{
    study_room_id: number;
    materials: UniversalMaterialListItem[];
  }>;
}

export async function deleteUniversalMaterial(
  materialId: number
) {
  return apiFetch(
    `/api/materials/${materialId}`,
    {
      method: "DELETE",
    }
  );
}


// =========================================================
// Study Together shared room messages
// =========================================================

export type RoomMessageSender = {
  id: number;
  full_name: string;
  email: string;
};

export type RoomMessage = {
  id: number;
  room_id: number;
  sender_id: number | null;
  sender: RoomMessageSender | null;
  message_type: string;
  content: string;
  reply_to_message_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  is_deleted: boolean;
};

export async function getRoomMessages(
  studyRoomId: number,
  options: {
    beforeId?: number;
    limit?: number;
  } = {}
): Promise<RoomMessage[]> {
  const params = new URLSearchParams();

  if (
    typeof options.beforeId === "number" &&
    options.beforeId > 0
  ) {
    params.set(
      "before_id",
      String(options.beforeId)
    );
  }

  params.set(
    "limit",
    String(options.limit ?? 50)
  );

  return apiFetch(
    `/api/room-messages/rooms/${studyRoomId}?${params.toString()}`
  ) as Promise<RoomMessage[]>;
}

export async function createRoomMessage(
  studyRoomId: number,
  content: string,
  replyToMessageId?: number | null
): Promise<RoomMessage> {
  return apiFetch(
    `/api/room-messages/rooms/${studyRoomId}`,
    {
      method: "POST",
      body: JSON.stringify({
        content,
        reply_to_message_id:
          replyToMessageId ?? null,
      }),
    }
  ) as Promise<RoomMessage>;
}

export async function downloadUniversalMaterial(
  materialId: number,
  filename: string
): Promise<void> {
  const token = getToken();

  const response = await fetch(
    `${API_BASE}/api/materials/${materialId}/download`,
    {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
    }
  );

  if (!response.ok) {
    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    throw new Error(
      getErrorMessage(body) ||
        "The file could not be downloaded."
    );
  }

  const blob = await response.blob();
  const objectUrl =
    window.URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(
    objectUrl
  );
}

export async function createRoomAttachmentMessage(
  studyRoomId: number,
  materialId: number,
  content = "",
  replyToMessageId?: number | null
): Promise<RoomMessage> {
  return apiFetch(
    `/api/room-messages/rooms/${studyRoomId}/attachments`,
    {
      method: "POST",
      body: JSON.stringify({
        material_id: materialId,
        content,
        reply_to_message_id:
          replyToMessageId ?? null,
      }),
    }
  ) as Promise<RoomMessage>;
}

export type RoomAIMessageResult = {
  invitation_message: RoomMessage;
  ai_message: RoomMessage;
};

export async function askRoomAI(
  studyRoomId: number,
  sourceMessageId: number,
  invocationType: "ask_ai" | "mention" =
    "ask_ai"
): Promise<RoomAIMessageResult> {
  return apiFetch(
    `/api/room-messages/rooms/${studyRoomId}/ask-ai`,
    {
      method: "POST",
      body: JSON.stringify({
        source_message_id: sourceMessageId,
        invocation_type: invocationType,
      }),
    }
  ) as Promise<RoomAIMessageResult>;
}

export async function updateRoomMessage(
  studyRoomId: number,
  messageId: number,
  content: string
): Promise<RoomMessage> {
  return apiFetch(
    `/api/room-messages/rooms/${studyRoomId}/${messageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        content,
      }),
    }
  ) as Promise<RoomMessage>;
}

export async function deleteRoomAIInteraction(
  studyRoomId: number,
  messageId: number
): Promise<{
  messages: RoomMessage[];
}> {
  return apiFetch(
    `/api/room-messages/rooms/${studyRoomId}/ai-interactions/${messageId}`,
    {
      method: "DELETE",
    }
  ) as Promise<{
    messages: RoomMessage[];
  }>;
}

export async function deleteRoomMessage(
  studyRoomId: number,
  messageId: number
): Promise<RoomMessage> {
  return apiFetch(
    `/api/room-messages/rooms/${studyRoomId}/${messageId}`,
    {
      method: "DELETE",
    }
  ) as Promise<RoomMessage>;
}



// =========================================================
// Study Together real-time room channel
// =========================================================

export type RoomRealtimeTicket = {
  ticket: string;
  expires_in_seconds: number;
  expires_at: string;
  websocket_path: string;
  room_id: number;
  user_id: number;
  role: string;
};

export type RoomRealtimeEvent = {
  event: string;
  room_id: number;
  event_id: string;
  occurred_at: string;
  actor_user_id: number | null;
  data: Record<string, unknown>;
};

export async function createRoomRealtimeTicket(
  studyRoomId: number
): Promise<RoomRealtimeTicket> {
  return apiFetch(
    `/api/room-realtime/rooms/${studyRoomId}/ticket`,
    {
      method: "POST",
    }
  ) as Promise<RoomRealtimeTicket>;
}

export function buildRoomRealtimeWebSocketUrl(
  ticketResponse: RoomRealtimeTicket
): string {
  if (typeof window === "undefined") {
    throw new Error(
      "The room connection is only available in the browser."
    );
  }

  const websocketBase = getWebSocketBaseUrl();

  const params = new URLSearchParams({
    ticket: ticketResponse.ticket,
  });

  return (
    `${websocketBase}` +
    `${ticketResponse.websocket_path}` +
    `?${params.toString()}`
  );
}



// =========================================================
// Study Together real room members
// =========================================================

export type RoomMember = {
  id: number;
  room_id: number;
  user_id: number;
  full_name: string;
  email: string | null;
  role: string;
  status: string;
  joined_at: string | null;
  last_active_at: string | null;
  is_current_user: boolean;
  is_owner: boolean;
};

export type RoomMemberListResponse = {
  room_id: number;
  current_user_role: string;
  permissions: {
    can_manage_members: boolean;
  };
  total: number;
  members: RoomMember[];
};

export async function getRoomMembers(
  studyRoomId: number
): Promise<RoomMemberListResponse> {
  return apiFetch(
    `/api/room-members/rooms/${studyRoomId}`
  ) as Promise<RoomMemberListResponse>;
}
