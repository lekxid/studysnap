import {
  API_BASE,
} from "./apiBase";

import {
  apiFetch,
  getToken,
  type AIMessage,
} from "./api";


export type FileBrainSourceSurface =
  | "general_ai"
  | "dashboard"
  | "room"
  | "notes"
  | "smart_scan"
  | "other";


export type FileBrainUploadState =
  | "pending"
  | "uploading"
  | "paused"
  | "uploaded"
  | "completed"
  | "failed"
  | "cancelled"
  | string;


export type FileBrainUploadSummary = {
  id?: string | null;
  state?: FileBrainUploadState;
  upload_state?: FileBrainUploadState;
  chunk_size?: number;
  total_chunks?: number;
  uploaded_chunks?: number[];
  uploaded_bytes?: number;
  progress_percent?: number;
  attempts?: number;
  staging_available?: boolean;
};


export type FileBrainItem = {
  id: number;
  batch_id: number;
  owner_id?: number;
  item_order?: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  sha256?: string | null;
  status: string;
  duplicate_found?: boolean;
  duplicate_item_id?: number | null;
  duplicate_material_id?: number | null;
  suggested_room_id?: number | null;
  confirmed_room_id?: number | null;
  material_id?: number | null;
  current_location_type?: string | null;
  current_location_id?: number | null;
  result_message?: string | null;
  error_message?: string | null;
  upload?: FileBrainUploadSummary | null;
};


export type FileBrainBatch = {
  id: number;
  owner_id?: number;
  title: string;
  source_surface: string;
  status: string;
  total_items: number;
  duplicate_items: number;
  completed_items: number;
  failed_items: number;
  created_at?: string | null;
  updated_at?: string | null;
};


export type FileBrainBatchResponse = {
  batch: FileBrainBatch;
  items: FileBrainItem[];
};


export type FileBrainUploadSession = {
  item_id?: number;
  upload_id?: string | null;
  upload_state?: FileBrainUploadState;
  state?: FileBrainUploadState;
  filename?: string;
  file_size?: number;
  content_type?: string;
  chunk_size: number;
  total_chunks: number;
  uploaded_chunks: number[];
  uploaded_bytes?: number;
  progress_percent?: number;
  attempts?: number;
  duplicate_found?: boolean;
  item?: FileBrainItem;
};


export type AskFileBrainResponse = {
  answer: string;
  count: number;
  attachments: AIMessage[];
  assistant_message?: AIMessage | null;
  file_brain_items: Array<{
    id: number;
    filename: string;
    kind: "image" | "file";
    source_type: string;
    source_id: number;
    read: boolean;
  }>;
  storage: {
    reuploaded: boolean;
    second_file_copy: boolean;
    method:
      | "hard_link"
      | "source_reference"
      | string;
    note?: string;
  };
};


export async function createFileBrainBatch({
  title,
  sourceSurface = "general_ai",
  files,
}: {
  title: string;
  sourceSurface?: FileBrainSourceSurface;
  files: File[];
}): Promise<FileBrainBatchResponse> {
  if (!files.length) {
    throw new Error(
      "Choose at least one file."
    );
  }

  if (files.length > 100) {
    throw new Error(
      "Choose up to 100 files at a time."
    );
  }

  return apiFetch(
    "/api/file-brain/batches",
    {
      method: "POST",
      body: JSON.stringify({
        title:
          title.trim() ||
          "General AI upload",
        source_surface:
          sourceSurface,
        items: files.map(
          (file) => ({
            filename: file.name,
            content_type:
              file.type ||
              "application/octet-stream",
            file_size: file.size,
          }),
        ),
      }),
    },
  ) as Promise<FileBrainBatchResponse>;
}


export async function getFileBrainBatch(
  batchId: number,
): Promise<FileBrainBatchResponse> {
  return apiFetch(
    `/api/file-brain/batches/${batchId}`,
  ) as Promise<FileBrainBatchResponse>;
}


export async function startFileBrainUpload(
  itemId: number,
): Promise<FileBrainUploadSession> {
  return apiFetch(
    `/api/file-brain/items/${itemId}/upload/start`,
    {
      method: "POST",
    },
  ) as Promise<FileBrainUploadSession>;
}


export async function resumeFileBrainUpload(
  itemId: number,
): Promise<FileBrainUploadSession> {
  return apiFetch(
    `/api/file-brain/items/${itemId}/upload/resume`,
    {
      method: "POST",
    },
  ) as Promise<FileBrainUploadSession>;
}


export async function retryFileBrainUpload(
  itemId: number,
): Promise<FileBrainUploadSession> {
  return apiFetch(
    `/api/file-brain/items/${itemId}/upload/retry`,
    {
      method: "POST",
    },
  ) as Promise<FileBrainUploadSession>;
}


export async function pauseFileBrainUpload(
  itemId: number,
): Promise<FileBrainUploadSession> {
  return apiFetch(
    `/api/file-brain/items/${itemId}/upload/pause`,
    {
      method: "POST",
    },
  ) as Promise<FileBrainUploadSession>;
}


export async function getFileBrainUpload(
  itemId: number,
): Promise<FileBrainUploadSession> {
  return apiFetch(
    `/api/file-brain/items/${itemId}/upload`,
  ) as Promise<FileBrainUploadSession>;
}


function readXHRMessage(
  xhr: XMLHttpRequest,
  fallback: string,
) {
  try {
    const body = JSON.parse(
      xhr.responseText,
    ) as {
      detail?:
        | string
        | {
            message?: string;
          };
      message?: string;
    };

    if (
      typeof body.detail ===
      "string"
    ) {
      return body.detail;
    }

    if (
      body.detail &&
      typeof body.detail ===
        "object" &&
      typeof body.detail.message ===
        "string"
    ) {
      return body.detail.message;
    }

    if (
      typeof body.message ===
      "string"
    ) {
      return body.message;
    }
  } catch {
    if (
      xhr.responseText.trim()
    ) {
      return xhr.responseText;
    }
  }

  return fallback;
}


export function uploadFileBrainChunk({
  itemId,
  chunkIndex,
  chunk,
  signal,
  onProgress,
}: {
  itemId: number;
  chunkIndex: number;
  chunk: Blob;
  signal?: AbortSignal;
  onProgress?: (
    loadedBytes: number,
    totalBytes: number,
  ) => void;
}): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      const xhr =
        new XMLHttpRequest();

      const token =
        getToken();

      xhr.open(
        "PUT",
        `${API_BASE}/api/file-brain/items/${itemId}/upload/chunks/${chunkIndex}`,
      );

      xhr.setRequestHeader(
        "Content-Type",
        "application/octet-stream",
      );

      if (token) {
        xhr.setRequestHeader(
          "Authorization",
          `Bearer ${token}`,
        );
      }

      xhr.upload.addEventListener(
        "progress",
        (event) => {
          if (
            !event.lengthComputable
          ) {
            return;
          }

          onProgress?.(
            event.loaded,
            event.total,
          );
        },
      );

      xhr.addEventListener(
        "load",
        () => {
          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {
            resolve();
            return;
          }

          reject(
            new Error(
              readXHRMessage(
                xhr,
                "The file chunk could not be uploaded.",
              ),
            ),
          );
        },
      );

      xhr.addEventListener(
        "error",
        () => {
          reject(
            new Error(
              "The upload could not reach StudySnap.",
            ),
          );
        },
      );

      xhr.addEventListener(
        "abort",
        () => {
          reject(
            new DOMException(
              "Upload paused.",
              "AbortError",
            ),
          );
        },
      );

      const abort = () =>
        xhr.abort();

      signal?.addEventListener(
        "abort",
        abort,
        {
          once: true,
        },
      );

      xhr.addEventListener(
        "loadend",
        () => {
          signal?.removeEventListener(
            "abort",
            abort,
          );
        },
      );

      xhr.send(chunk);
    },
  );
}


export async function completeFileBrainUpload(
  itemId: number,
): Promise<FileBrainUploadSession> {
  return apiFetch(
    `/api/file-brain/items/${itemId}/upload/complete`,
    {
      method: "POST",
    },
  ) as Promise<FileBrainUploadSession>;
}


export async function cancelFileBrainUpload(
  itemId: number,
): Promise<FileBrainUploadSession> {
  return apiFetch(
    `/api/file-brain/items/${itemId}/upload`,
    {
      method: "DELETE",
    },
  ) as Promise<FileBrainUploadSession>;
}


export async function askFileBrain({
  question,
  itemIds,
  conversationId,
  studyRoomId,
  signal,
}: {
  question: string;
  itemIds: number[];
  conversationId?: number | null;
  studyRoomId?: number | null;
  signal?: AbortSignal;
}): Promise<AskFileBrainResponse> {
  if (!itemIds.length) {
    throw new Error(
      "Choose at least one completed file."
    );
  }

  if (itemIds.length > 10) {
    throw new Error(
      "General AI can read up to 10 files in one question."
    );
  }

  return apiFetch(
    "/api/file-brain/ask",
    {
      method: "POST",
      signal,
      body: JSON.stringify({
        question:
          question.trim() ||
          "Explain these files clearly.",
        item_ids: itemIds,
        conversation_id:
          typeof conversationId ===
          "number"
            ? conversationId
            : null,
        study_room_id:
          typeof studyRoomId ===
          "number"
            ? studyRoomId
            : null,
      }),
    },
  ) as Promise<AskFileBrainResponse>;
}
