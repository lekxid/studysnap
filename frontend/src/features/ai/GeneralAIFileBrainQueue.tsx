"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  askFileBrain,
  cancelFileBrainUpload,
  completeFileBrainUpload,
  createFileBrainBatch,
  getFileBrainUpload,
  pauseFileBrainUpload,
  resumeFileBrainUpload,
  retryFileBrainUpload,
  startFileBrainUpload,
  uploadFileBrainChunk,
  type AskFileBrainResponse,
  type FileBrainItem,
  type FileBrainUploadSession,
} from "@/lib/fileBrainApi";

import {
  deleteUploadQueueFiles,
  readUploadQueueFile,
  saveUploadQueueFiles,
} from "@/lib/uploadQueueStorage";


const QUEUE_STORAGE_KEY =
  "studysnap:general-ai-file-brain-queue-v1";

const MAX_QUEUE_FILES = 100;
const MAX_ASK_FILES = 10;
const MAX_CONCURRENT_UPLOADS = 3;

const MAX_FILE_BYTES =
  2 * 1024 * 1024 * 1024;


export type GeneralAIFileBrainStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "ready"
  | "duplicate"
  | "failed"
  | "cancelled";


export type GeneralAIFileBrainTask = {
  localId: string;
  batchId: number;
  itemId: number;
  filename: string;
  fileSize: number;
  contentType: string;
  progress: number;
  status: GeneralAIFileBrainStatus;
  selectedForAsk: boolean;
  duplicateFound: boolean;
  uploadedChunks: number[];
  chunkSize?: number;
  totalChunks?: number;
  error?: string;
  message?: string;
  createdAt: string;
  completedAt?: string;
};


export type AddFileBrainFilesResult = {
  accepted: number;
  rejected: number;
  recoveryAvailable: boolean;
};


export type GeneralAIFileBrainQueueController = {
  tasks: GeneralAIFileBrainTask[];
  selectedReadyItems:
    GeneralAIFileBrainTask[];
  selectedReadyCount: number;
  readyCount: number;
  uploadingCount: number;
  waitingCount: number;
  failedCount: number;
  hydrated: boolean;
  error: string;
  recoveryWarning: string;
  addFiles: (
    files: File[],
  ) => Promise<AddFileBrainFilesResult>;
  toggleSelected: (
    localId: string,
  ) => void;
  pauseTask: (
    localId: string,
  ) => Promise<void>;
  resumeTask: (
    localId: string,
  ) => void;
  retryTask: (
    localId: string,
  ) => void;
  cancelTask: (
    localId: string,
  ) => Promise<void>;
  dismissTask: (
    localId: string,
  ) => void;
  clearSelection: () => void;
  markAsked: (
    itemIds: number[],
  ) => void;
  askItems: (
    tasks: GeneralAIFileBrainTask[],
    options: {
      question: string;
      conversationId?: number | null;
      signal?: AbortSignal;
    },
  ) => Promise<AskFileBrainResponse>;
};


function makeLocalId(
  itemId: number,
) {
  return (
    "general-ai-file-brain:"
    + String(itemId)
  );
}


function isQueueStatus(
  value: unknown,
): value is GeneralAIFileBrainStatus {
  return [
    "queued",
    "uploading",
    "paused",
    "ready",
    "duplicate",
    "failed",
    "cancelled",
  ].includes(String(value));
}


function isReadyStatus(
  value: GeneralAIFileBrainStatus,
) {
  return (
    value === "ready" ||
    value === "duplicate"
  );
}


function isWaitingStatus(
  value: GeneralAIFileBrainStatus,
) {
  return (
    value === "queued" ||
    value === "paused"
  );
}


function uploadState(
  session: FileBrainUploadSession,
) {
  return String(
    session.state ||
    session.upload_state ||
    "",
  ).toLowerCase();
}


function calculateUploadedBytes(
  fileSize: number,
  chunkSize: number,
  chunks: number[],
) {
  return chunks.reduce(
    (total, chunkIndex) => {
      const start =
        chunkIndex * chunkSize;

      const end = Math.min(
        fileSize,
        start + chunkSize,
      );

      return total + Math.max(
        0,
        end - start,
      );
    },
    0,
  );
}


function statusLabel(
  status: GeneralAIFileBrainStatus,
) {
  const labels: Record<
    GeneralAIFileBrainStatus,
    string
  > = {
    queued: "Waiting",
    uploading: "Uploading",
    paused: "Paused",
    ready: "Ready",
    duplicate: "Already saved",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  return labels[status];
}


function statusClass(
  status: GeneralAIFileBrainStatus,
) {
  if (
    status === "ready" ||
    status === "duplicate"
  ) {
    return (
      "border-emerald-300/15 "
      + "bg-emerald-300/[0.07] "
      + "text-emerald-100"
    );
  }

  if (status === "failed") {
    return (
      "border-red-300/15 "
      + "bg-red-300/[0.07] "
      + "text-red-100"
    );
  }

  if (status === "paused") {
    return (
      "border-amber-300/15 "
      + "bg-amber-300/[0.07] "
      + "text-amber-100"
    );
  }

  if (status === "cancelled") {
    return (
      "border-white/[0.07] "
      + "bg-white/[0.03] "
      + "text-zinc-500"
    );
  }

  return (
    "border-[#c9ad50]/20 "
    + "bg-[#c9ad50]/[0.07] "
    + "text-[#e2d58d]"
  );
}


function formatBytes(
  bytes: number,
) {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const unitIndex = Math.min(
    Math.floor(
      Math.log(bytes) /
      Math.log(1024),
    ),
    units.length - 1,
  );

  const value =
    bytes /
    Math.pow(
      1024,
      unitIndex,
    );

  return (
    value.toFixed(
      unitIndex === 0 ||
      value >= 10
        ? 0
        : 1,
    )
    + " "
    + units[unitIndex]
  );
}


export function useGeneralAIFileBrainQueue():
  GeneralAIFileBrainQueueController {
  const [
    tasks,
    setTasks,
  ] = useState<
    GeneralAIFileBrainTask[]
  >([]);

  const [
    hydrated,
    setHydrated,
  ] = useState(false);

  const [
    queueTick,
    setQueueTick,
  ] = useState(0);

  const [
    error,
    setError,
  ] = useState("");

  const [
    recoveryWarning,
    setRecoveryWarning,
  ] = useState("");

  const tasksRef = useRef<
    GeneralAIFileBrainTask[]
  >([]);

  const fileRefs = useRef<
    Map<string, File>
  >(new Map());

  const controllers = useRef<
    Map<string, AbortController>
  >(new Map());

  const activeIds = useRef<
    Set<string>
  >(new Set());

  const pauseRequestedIds = useRef<
    Set<string>
  >(new Set());

  const cancelRequestedIds = useRef<
    Set<string>
  >(new Set());


  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);


  const updateTask = useCallback(
    (
      localId: string,
      updates:
        Partial<GeneralAIFileBrainTask>,
    ) => {
      setTasks((current) =>
        current.map((task) =>
          task.localId === localId
            ? {
                ...task,
                ...updates,
              }
            : task
        )
      );
    },
    [],
  );


  useEffect(() => {
    let cancelled = false;

    async function hydrateQueue() {
      try {
        const raw =
          window.localStorage.getItem(
            QUEUE_STORAGE_KEY,
          );

        if (!raw) {
          return;
        }

        const parsed =
          JSON.parse(
            raw,
          ) as GeneralAIFileBrainTask[];

        if (!Array.isArray(parsed)) {
          return;
        }

        const validTasks =
          parsed
            .filter(
              (
                task,
              ): task is
                GeneralAIFileBrainTask =>
                Boolean(task) &&
                typeof task.localId ===
                  "string" &&
                typeof task.itemId ===
                  "number" &&
                typeof task.batchId ===
                  "number" &&
                typeof task.filename ===
                  "string" &&
                isQueueStatus(
                  task.status,
                ),
            )
            .slice(
              0,
              MAX_QUEUE_FILES,
            );

        const restored =
          await Promise.all(
            validTasks.map(
              async (
                task,
              ): Promise<
                GeneralAIFileBrainTask
              > => {
                let nextTask = {
                  ...task,
                  status:
                    task.status ===
                    "uploading"
                      ? "queued"
                      : task.status,
                  progress:
                    task.status ===
                    "uploading"
                      ? Math.min(
                          task.progress,
                          99,
                        )
                      : task.progress,
                  message:
                    task.status ===
                    "uploading"
                      ? (
                          "Upload restored "
                          + "and waiting "
                          + "to continue."
                        )
                      : task.message,
                } satisfies
                  GeneralAIFileBrainTask;

                if (
                  nextTask.status ===
                    "queued" ||
                  nextTask.status ===
                    "paused" ||
                  nextTask.status ===
                    "failed"
                ) {
                  try {
                    const file =
                      await readUploadQueueFile(
                        nextTask.localId,
                      );

                    if (file) {
                      fileRefs.current.set(
                        nextTask.localId,
                        file,
                      );
                    } else {
                      nextTask = {
                        ...nextTask,
                        status: "failed",
                        selectedForAsk:
                          false,
                        error:
                          "Select this file "
                          + "again to continue.",
                        message:
                          "The browser no "
                          + "longer has the "
                          + "original file.",
                      };
                    }
                  } catch {
                    nextTask = {
                      ...nextTask,
                      status: "failed",
                      selectedForAsk: false,
                      error:
                        "Select this file "
                        + "again to continue.",
                      message:
                        "Upload recovery "
                        + "storage could "
                        + "not be read.",
                    };
                  }
                }

                return nextTask;
              },
            ),
          );

        if (!cancelled) {
          setTasks(restored);
        }
      } catch {
        if (!cancelled) {
          window.localStorage.removeItem(
            QUEUE_STORAGE_KEY,
          );

          setRecoveryWarning(
            "The previous File Brain "
            + "queue could not be restored.",
          );
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setQueueTick(
            (current) =>
              current + 1,
          );
        }
      }
    }

    void hydrateQueue();

    return () => {
      cancelled = true;

      controllers.current.forEach(
        (controller) =>
          controller.abort(),
      );

      controllers.current.clear();
      activeIds.current.clear();
    };
  }, []);


  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify(
        tasks.slice(
          0,
          MAX_QUEUE_FILES,
        ),
      ),
    );
  }, [
    hydrated,
    tasks,
  ]);


  const selectedReadyItems =
    useMemo(
      () =>
        tasks
          .filter(
            (task) =>
              task.selectedForAsk &&
              isReadyStatus(
                task.status,
              ),
          )
          .slice(
            0,
            MAX_ASK_FILES,
          ),
      [tasks],
    );


  const readyCount =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            isReadyStatus(
              task.status,
            ),
        ).length,
      [tasks],
    );


  const uploadingCount =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.status ===
            "uploading",
        ).length,
      [tasks],
    );


  const waitingCount =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            isWaitingStatus(
              task.status,
            ),
        ).length,
      [tasks],
    );


  const failedCount =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.status ===
            "failed",
        ).length,
      [tasks],
    );


  const addFiles =
    useCallback(
      async (
        files: File[],
      ): Promise<
        AddFileBrainFilesResult
      > => {
        setError("");
        setRecoveryWarning("");

        const currentCount =
          tasksRef.current.filter(
            (task) =>
              task.status !==
              "cancelled",
          ).length;

        const availableSlots =
          Math.max(
            0,
            MAX_QUEUE_FILES -
              currentCount,
          );

        if (availableSlots === 0) {
          throw new Error(
            "The File Brain queue "
            + "already contains "
            + `${MAX_QUEUE_FILES} files.`,
          );
        }

        const selected =
          files.slice(
            0,
            availableSlots,
          );

        const accepted =
          selected.filter(
            (file) =>
              file.size <=
              MAX_FILE_BYTES,
          );

        const oversizedCount =
          selected.length -
          accepted.length;

        const queueLimitRejected =
          files.length -
          selected.length;

        if (!accepted.length) {
          throw new Error(
            oversizedCount > 0
              ? (
                  "The selected files "
                  + "are larger than "
                  + "the 2 GB per-file "
                  + "limit."
                )
              : "Choose at least one file.",
          );
        }

        const response =
          await createFileBrainBatch({
            title:
              accepted.length === 1
                ? accepted[0].name
                : (
                    "General AI upload "
                    + new Date()
                      .toLocaleString()
                  ),
            sourceSurface:
              "general_ai",
            files: accepted,
          });

        const responseEnvelope =
          response as typeof response & {
            id?: number;
            batch?: {
              id?: number;
            };
          };

        const responseBatchId =
          responseEnvelope.id ??
          responseEnvelope.batch?.id;

        if (
          typeof responseBatchId !==
            "number" ||
          !Number.isInteger(
            responseBatchId
          ) ||
          responseBatchId <= 0
        ) {
          throw new Error(
            "StudySnap could not start "
            + "the secure upload queue. "
            + "Your selected files are "
            + "still available to retry.",
          );
        }

        if (
          response.items.length !==
          accepted.length
        ) {
          throw new Error(
            "StudySnap could not "
            + "register every selected "
            + "file.",
          );
        }

        const now =
          new Date().toISOString();

        const newTasks =
          response.items.map(
            (
              item: FileBrainItem,
              index,
            ): GeneralAIFileBrainTask => {
              const file =
                accepted[index];

              const localId =
                makeLocalId(
                  item.id,
                );

              fileRefs.current.set(
                localId,
                file,
              );

              return {
                localId,
                batchId:
                  responseBatchId,
                itemId: item.id,
                filename:
                  item.original_filename ||
                  file.name,
                fileSize:
                  item.file_size ??
                  file.size,
                contentType:
                  item.content_type ||
                  file.type ||
                  "application/octet-stream",
                progress: 0,
                status: "queued",
                selectedForAsk: false,
                duplicateFound:
                  Boolean(
                    item.duplicate_found,
                  ),
                uploadedChunks: [],
                createdAt: now,
              };
            },
          );

        let recoveryAvailable = true;

        try {
          await saveUploadQueueFiles(
            newTasks.map(
              (task, index) => ({
                taskId:
                  task.localId,
                file:
                  accepted[index],
              }),
            ),
          );
        } catch {
          recoveryAvailable = false;

          setRecoveryWarning(
            "Uploads can continue "
            + "now, but files may "
            + "need to be selected "
            + "again after a refresh.",
          );
        }

        setTasks((current) => [
          ...current,
          ...newTasks,
        ]);

        setQueueTick(
          (current) =>
            current + 1,
        );

        const rejected =
          oversizedCount +
          queueLimitRejected;

        if (rejected > 0) {
          setError(
            `${rejected} file${
              rejected === 1
                ? " was"
                : "s were"
            } not added because of `
            + "the 100-file queue or "
            + "2 GB per-file limit.",
          );
        }

        return {
          accepted:
            newTasks.length,
          rejected,
          recoveryAvailable,
        };
      },
      [],
    );


  async function beginSession(
    task: GeneralAIFileBrainTask,
  ) {
    if (task.status === "failed") {
      return retryFileBrainUpload(
        task.itemId,
      );
    }

    if (task.status === "paused") {
      return resumeFileBrainUpload(
        task.itemId,
      );
    }

    let existing:
      | FileBrainUploadSession
      | null = null;

    try {
      existing =
        await getFileBrainUpload(
          task.itemId,
        );
    } catch {
      existing = null;
    }

    if (
      !existing ||
      !existing.upload_id ||
      typeof existing.chunk_size !==
        "number" ||
      existing.chunk_size <= 0 ||
      typeof existing.total_chunks !==
        "number" ||
      existing.total_chunks <= 0 ||
      !Array.isArray(
        existing.uploaded_chunks
      )
    ) {
      return startFileBrainUpload(
        task.itemId,
      );
    }

    const state =
      uploadState(existing);

    if (state === "paused") {
      return resumeFileBrainUpload(
        task.itemId,
      );
    }

    if (state === "failed") {
      return retryFileBrainUpload(
        task.itemId,
      );
    }

    if (state === "cancelled") {
      throw new Error(
        "This upload was cancelled.",
      );
    }

    return existing;
  }


  async function markTaskReady(
    task: GeneralAIFileBrainTask,
    duplicateFound: boolean,
  ) {
    fileRefs.current.delete(
      task.localId,
    );

    await deleteUploadQueueFiles(
      [task.localId],
    ).catch(() => undefined);

    setTasks((current) => {
      const selectedCount =
        current.filter(
          (item) =>
            item.selectedForAsk &&
            isReadyStatus(
              item.status,
            ),
        ).length;

      return current.map((item) =>
        item.localId ===
        task.localId
          ? {
              ...item,
              progress: 100,
              status:
                duplicateFound
                  ? "duplicate"
                  : "ready",
              duplicateFound,
              selectedForAsk:
                item.selectedForAsk ||
                selectedCount <
                  MAX_ASK_FILES,
              error: undefined,
              message:
                duplicateFound
                  ? (
                      "Exact duplicate "
                      + "detected. StudySnap "
                      + "will reuse the "
                      + "existing private "
                      + "file."
                    )
                  : (
                      "Ready for "
                      + "General AI."
                    ),
              completedAt:
                new Date()
                  .toISOString(),
            }
          : item
      );
    });
  }


  async function startTask(
    localId: string,
  ) {
    const task =
      tasksRef.current.find(
        (item) =>
          item.localId === localId,
      );

    if (
      !task ||
      activeIds.current.has(
        localId,
      ) ||
      task.status !== "queued"
    ) {
      return;
    }

    let file =
      fileRefs.current.get(
        localId,
      );

    if (!file) {
      try {
        file =
          await readUploadQueueFile(
            localId,
          ) || undefined;

        if (file) {
          fileRefs.current.set(
            localId,
            file,
          );
        }
      } catch {
        file = undefined;
      }
    }

    if (!file) {
      updateTask(
        localId,
        {
          status: "failed",
          selectedForAsk: false,
          error:
            "Select this file "
            + "again to continue.",
          message:
            "The browser no longer "
            + "has the original file.",
        },
      );

      return;
    }

    const controller =
      new AbortController();

    controllers.current.set(
      localId,
      controller,
    );

    activeIds.current.add(
      localId,
    );

    pauseRequestedIds.current.delete(
      localId,
    );

    cancelRequestedIds.current.delete(
      localId,
    );

    updateTask(
      localId,
      {
        status: "uploading",
        error: undefined,
        message:
          "Uploading privately "
          + "to File Brain.",
      },
    );

    try {
      const session =
        await beginSession(
          task,
        );

      const state =
        uploadState(session);

      if (state === "completed") {
        await markTaskReady(
          task,
          Boolean(
            session.duplicate_found,
          ),
        );

        return;
      }

      const chunkSize =
        Number(
          session.chunk_size,
        );

      const totalChunks =
        Number(
          session.total_chunks,
        );

      if (
        !Number.isFinite(
          chunkSize,
        ) ||
        chunkSize <= 0 ||
        !Number.isInteger(
          totalChunks,
        ) ||
        totalChunks <= 0
      ) {
        throw new Error(
          "StudySnap returned an "
          + "invalid resumable-upload "
          + "session.",
        );
      }

      const uploaded =
        new Set<number>(
          session.uploaded_chunks ||
          [],
        );

      let uploadedBytes =
        session.uploaded_bytes ??
        calculateUploadedBytes(
          file.size,
          chunkSize,
          Array.from(uploaded),
        );

      updateTask(
        localId,
        {
          chunkSize,
          totalChunks,
          uploadedChunks:
            Array.from(uploaded)
              .sort(
                (a, b) =>
                  a - b,
              ),
          progress:
            file.size > 0
              ? Math.min(
                  99,
                  Math.round(
                    (
                      uploadedBytes /
                      file.size
                    ) * 100,
                  ),
                )
              : 0,
        },
      );

      for (
        let chunkIndex = 0;
        chunkIndex < totalChunks;
        chunkIndex += 1
      ) {
        if (
          controller.signal.aborted
        ) {
          throw new DOMException(
            "Upload interrupted.",
            "AbortError",
          );
        }

        if (
          uploaded.has(
            chunkIndex,
          )
        ) {
          continue;
        }

        const start =
          chunkIndex *
          chunkSize;

        const end =
          Math.min(
            file.size,
            start + chunkSize,
          );

        const chunk =
          file.slice(
            start,
            end,
          );

        await uploadFileBrainChunk({
          itemId:
            task.itemId,
          chunkIndex,
          chunk,
          signal:
            controller.signal,
          onProgress: (
            loadedBytes,
          ) => {
            const totalProgress =
              uploadedBytes +
              loadedBytes;

            updateTask(
              localId,
              {
                progress:
                  file.size > 0
                    ? Math.min(
                        99,
                        Math.round(
                          (
                            totalProgress /
                            file.size
                          ) * 100,
                        ),
                      )
                    : 0,
              },
            );
          },
        });

        uploaded.add(
          chunkIndex,
        );

        uploadedBytes +=
          chunk.size;

        updateTask(
          localId,
          {
            uploadedChunks:
              Array.from(uploaded)
                .sort(
                  (a, b) =>
                    a - b,
                ),
            progress:
              file.size > 0
                ? Math.min(
                    99,
                    Math.round(
                      (
                        uploadedBytes /
                        file.size
                      ) * 100,
                    ),
                  )
                : 99,
          },
        );
      }

      const completed =
        await completeFileBrainUpload(
          task.itemId,
        );

      await markTaskReady(
        task,
        Boolean(
          completed.duplicate_found,
        ),
      );
    } catch (uploadError) {
      const pauseRequested =
        pauseRequestedIds.current.has(
          localId,
        );

      const cancelRequested =
        cancelRequestedIds.current.has(
          localId,
        );

      const aborted =
        controller.signal.aborted;

      const offline =
        typeof navigator !==
          "undefined" &&
        !navigator.onLine;

      if (cancelRequested) {
        updateTask(
          localId,
          {
            status: "cancelled",
            selectedForAsk: false,
            error: undefined,
            message:
              "Upload cancelled.",
            completedAt:
              new Date()
                .toISOString(),
          },
        );
      } else if (pauseRequested) {
        updateTask(
          localId,
          {
            status: "paused",
            selectedForAsk: false,
            error: undefined,
            message:
              "Upload paused.",
          },
        );
      } else if (
        offline ||
        aborted
      ) {
        updateTask(
          localId,
          {
            status: "queued",
            selectedForAsk: false,
            error: undefined,
            message:
              offline
                ? (
                    "Waiting for an "
                    + "internet connection."
                  )
                : (
                    "Upload interrupted "
                    + "and waiting to "
                    + "continue."
                  ),
          },
        );
      } else {
        updateTask(
          localId,
          {
            status: "failed",
            selectedForAsk: false,
            error:
              uploadError instanceof
              Error
                ? uploadError.message
                : "Upload failed.",
            message:
              "Retry when ready.",
          },
        );
      }
    } finally {
      controllers.current.delete(
        localId,
      );

      activeIds.current.delete(
        localId,
      );

      pauseRequestedIds.current.delete(
        localId,
      );

      cancelRequestedIds.current.delete(
        localId,
      );

      setQueueTick(
        (current) =>
          current + 1,
      );
    }
  }


  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (
      typeof navigator !==
        "undefined" &&
      !navigator.onLine
    ) {
      return;
    }

    const availableSlots =
      MAX_CONCURRENT_UPLOADS -
      activeIds.current.size;

    if (availableSlots <= 0) {
      return;
    }

    const nextTasks =
      tasks
        .filter(
          (task) =>
            task.status ===
              "queued" &&
            !activeIds.current.has(
              task.localId,
            ),
        )
        .slice(
          0,
          availableSlots,
        );

    nextTasks.forEach(
      (task) => {
        void startTask(
          task.localId,
        );
      },
    );
  }, [
    hydrated,
    queueTick,
    tasks,
  ]);


  const toggleSelected =
    useCallback(
      (
        localId: string,
      ) => {
        setError("");

        setTasks((current) => {
          const target =
            current.find(
              (task) =>
                task.localId ===
                localId,
            );

          if (
            !target ||
            !isReadyStatus(
              target.status,
            )
          ) {
            return current;
          }

          if (
            target.selectedForAsk
          ) {
            return current.map(
              (task) =>
                task.localId ===
                localId
                  ? {
                      ...task,
                      selectedForAsk:
                        false,
                    }
                  : task,
            );
          }

          const selectedCount =
            current.filter(
              (task) =>
                task.selectedForAsk &&
                isReadyStatus(
                  task.status,
                ),
            ).length;

          if (
            selectedCount >=
            MAX_ASK_FILES
          ) {
            setError(
              "Select up to 10 "
              + "completed files for "
              + "one AI question.",
            );

            return current;
          }

          return current.map(
            (task) =>
              task.localId ===
              localId
                ? {
                    ...task,
                    selectedForAsk:
                      true,
                  }
                : task,
          );
        });
      },
      [],
    );


  async function pauseTask(
    localId: string,
  ) {
    const task =
      tasksRef.current.find(
        (item) =>
          item.localId === localId,
      );

    if (!task) {
      return;
    }

    pauseRequestedIds.current.add(
      localId,
    );

    controllers.current
      .get(localId)
      ?.abort();

    try {
      await pauseFileBrainUpload(
        task.itemId,
      );
    } catch {
      // The active request may have
      // already observed the abort.
    }

    updateTask(
      localId,
      {
        status: "paused",
        selectedForAsk: false,
        error: undefined,
        message: "Upload paused.",
      },
    );
  }


  function resumeTask(
    localId: string,
  ) {
    updateTask(
      localId,
      {
        status: "queued",
        error: undefined,
        message:
          "Waiting to resume.",
      },
    );

    setQueueTick(
      (current) =>
        current + 1,
    );
  }


  function retryTask(
    localId: string,
  ) {
    updateTask(
      localId,
      {
        status: "queued",
        error: undefined,
        message:
          "Waiting to retry.",
      },
    );

    setQueueTick(
      (current) =>
        current + 1,
    );
  }


  async function cancelTask(
    localId: string,
  ) {
    const task =
      tasksRef.current.find(
        (item) =>
          item.localId === localId,
      );

    if (!task) {
      return;
    }

    cancelRequestedIds.current.add(
      localId,
    );

    controllers.current
      .get(localId)
      ?.abort();

    try {
      await cancelFileBrainUpload(
        task.itemId,
      );
    } catch {
      // A session may not have been
      // created yet.
    }

    fileRefs.current.delete(
      localId,
    );

    await deleteUploadQueueFiles(
      [localId],
    ).catch(() => undefined);

    updateTask(
      localId,
      {
        status: "cancelled",
        selectedForAsk: false,
        error: undefined,
        message:
          "Upload cancelled.",
        completedAt:
          new Date()
            .toISOString(),
      },
    );
  }


  function dismissTask(
    localId: string,
  ) {
    const task =
      tasksRef.current.find(
        (item) =>
          item.localId === localId,
      );

    if (
      !task ||
      task.status ===
        "uploading" ||
      task.status ===
        "queued" ||
      task.status ===
        "paused"
    ) {
      return;
    }

    fileRefs.current.delete(
      localId,
    );

    void deleteUploadQueueFiles(
      [localId],
    ).catch(() => undefined);

    setTasks((current) =>
      current.filter(
        (item) =>
          item.localId !== localId,
      )
    );
  }


  function clearSelection() {
    setTasks((current) =>
      current.map((task) => ({
        ...task,
        selectedForAsk: false,
      }))
    );
  }


  function markAsked(
    itemIds: number[],
  ) {
    const ids =
      new Set(itemIds);

    setTasks((current) =>
      current.map((task) =>
        ids.has(task.itemId)
          ? {
              ...task,
              selectedForAsk:
                false,
              message:
                "Ready for another "
                + "question.",
            }
          : task
      )
    );
  }


  async function askItems(
    selectedTasks:
      GeneralAIFileBrainTask[],
    options: {
      question: string;
      conversationId?: number | null;
      signal?: AbortSignal;
    },
  ) {
    const safeTasks =
      selectedTasks
        .filter(
          (task) =>
            isReadyStatus(
              task.status,
            ),
        )
        .slice(
          0,
          MAX_ASK_FILES,
        );

    return askFileBrain({
      question:
        options.question,
      itemIds:
        safeTasks.map(
          (task) =>
            task.itemId,
        ),
      conversationId:
        options.conversationId,
      signal:
        options.signal,
    });
  }


  return {
    tasks,
    selectedReadyItems,
    selectedReadyCount:
      selectedReadyItems.length,
    readyCount,
    uploadingCount,
    waitingCount,
    failedCount,
    hydrated,
    error,
    recoveryWarning,
    addFiles,
    toggleSelected,
    pauseTask,
    resumeTask,
    retryTask,
    cancelTask,
    dismissTask,
    clearSelection,
    markAsked,
    askItems,
  };
}


export function GeneralAIFileBrainQueue({
  queue,
}: {
  queue:
    GeneralAIFileBrainQueueController;
}) {
  if (
    !queue.hydrated ||
    queue.tasks.length === 0
  ) {
    return null;
  }

  const activeCount =
    queue.uploadingCount +
    queue.waitingCount;

  const summary =
    activeCount > 0
      ? (
          `${activeCount} uploading`
          + (
              queue.readyCount > 0
                ? (
                    ` • ${queue.readyCount}`
                    + " ready"
                  )
                : ""
            )
        )
      : (
          `${queue.readyCount} ready`
          + (
              queue.failedCount > 0
                ? (
                    ` • ${queue.failedCount}`
                    + " failed"
                  )
                : ""
            )
        );

  return (
    <details
      className={
        "mb-2 overflow-hidden "
        + "rounded-xl border "
        + "border-white/[0.08] "
        + "bg-white/[0.035]"
      }
    >
      <summary
        className={
          "flex min-h-10 cursor-pointer "
          + "list-none items-center gap-2 "
          + "px-3 text-xs "
          + "[&::-webkit-details-marker]:hidden"
        }
      >
        <span
          className={
            "grid h-6 w-6 shrink-0 "
            + "place-items-center rounded-lg "
            + "bg-[#c9ad50]/10 "
            + "text-[#dfd18a]"
          }
        >
          ▤
        </span>

        <span
          className={
            "min-w-0 flex-1 truncate "
            + "font-bold text-zinc-300"
          }
        >
          Files
        </span>

        <span
          className={
            "shrink-0 text-[10px] "
            + "font-bold text-zinc-500"
          }
        >
          {summary}
        </span>

        {queue.selectedReadyCount > 0 ? (
          <span
            className={
              "shrink-0 rounded-full "
              + "bg-[#c9ad50]/12 "
              + "px-2 py-1 text-[9px] "
              + "font-black text-[#dfd18a]"
            }
          >
            {queue.selectedReadyCount}/10
          </span>
        ) : null}

        <span
          className="text-zinc-500"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>

      <div
        className={
          "max-h-64 space-y-1.5 "
          + "overflow-y-auto border-t "
          + "border-white/[0.07] p-2"
        }
      >
        {queue.error ? (
          <p
            className={
              "rounded-lg border "
              + "border-red-300/15 "
              + "bg-red-300/[0.06] "
              + "px-2.5 py-2 text-[10px] "
              + "font-bold text-red-100"
            }
          >
            {queue.error}
          </p>
        ) : null}

        {queue.recoveryWarning ? (
          <p
            className={
              "rounded-lg border "
              + "border-amber-300/15 "
              + "bg-amber-300/[0.06] "
              + "px-2.5 py-2 text-[10px] "
              + "font-bold text-amber-100"
            }
          >
            {queue.recoveryWarning}
          </p>
        ) : null}

        {queue.tasks.map(
          (task) => {
            const ready =
              isReadyStatus(
                task.status,
              );

            const canCancel =
              task.status ===
                "queued" ||
              task.status ===
                "uploading" ||
              task.status ===
                "paused" ||
              task.status ===
                "failed";

            const canDismiss =
              task.status ===
                "ready" ||
              task.status ===
                "duplicate" ||
              task.status ===
                "cancelled";

            return (
              <div
                key={task.localId}
                className={
                  "rounded-xl border "
                  + "border-white/[0.07] "
                  + "bg-black/20 px-2.5 py-2"
                }
              >
                <div
                  className={
                    "flex items-center gap-2"
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      queue.toggleSelected(
                        task.localId,
                      )
                    }
                    disabled={!ready}
                    className={
                      "grid h-6 w-6 shrink-0 "
                      + "place-items-center "
                      + "rounded-md border "
                      + (
                          task.selectedForAsk
                            ? (
                                "border-[#c9ad50]/40 "
                                + "bg-[#c9ad50] "
                                + "text-black"
                              )
                            : (
                                "border-white/[0.10] "
                                + "bg-white/[0.04] "
                                + "text-transparent"
                              )
                        )
                      + " disabled:opacity-30"
                    }
                    aria-label={
                      task.selectedForAsk
                        ? (
                            "Do not use "
                            + task.filename
                            + " in the next question"
                          )
                        : (
                            "Use "
                            + task.filename
                            + " in the next question"
                          )
                    }
                    title={
                      ready
                        ? (
                            "Select for the "
                            + "next AI question"
                          )
                        : (
                            "Available after "
                            + "upload finishes"
                          )
                    }
                  >
                    ✓
                  </button>

                  <div
                    className={
                      "min-w-0 flex-1"
                    }
                  >
                    <p
                      className={
                        "truncate text-[11px] "
                        + "font-black text-zinc-200"
                      }
                    >
                      {task.filename}
                    </p>

                    <div
                      className={
                        "mt-1 flex items-center "
                        + "gap-2"
                      }
                    >
                      <span
                        className={
                          "rounded-full border "
                          + "px-1.5 py-0.5 "
                          + "text-[8px] font-black "
                          + statusClass(
                              task.status,
                            )
                        }
                      >
                        {statusLabel(
                          task.status,
                        )}
                      </span>

                      <span
                        className={
                          "text-[9px] "
                          + "text-zinc-600"
                        }
                      >
                        {formatBytes(
                          task.fileSize,
                        )}
                      </span>

                      {task.status ===
                        "uploading" ? (
                        <span
                          className={
                            "text-[9px] "
                            + "font-bold "
                            + "text-[#d8c878]"
                          }
                        >
                          {Math.round(
                            task.progress,
                          )}
                          %
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={
                      "flex shrink-0 "
                      + "items-center gap-1"
                    }
                  >
                    {task.status ===
                    "uploading" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void queue.pauseTask(
                            task.localId,
                          )
                        }
                        className={
                          "grid h-7 w-7 "
                          + "place-items-center "
                          + "rounded-lg "
                          + "bg-white/[0.06] "
                          + "text-[10px] "
                          + "text-zinc-300"
                        }
                        title="Pause"
                        aria-label={
                          `Pause ${task.filename}`
                        }
                      >
                        Ⅱ
                      </button>
                    ) : null}

                    {task.status ===
                    "paused" ? (
                      <button
                        type="button"
                        onClick={() =>
                          queue.resumeTask(
                            task.localId,
                          )
                        }
                        className={
                          "grid h-7 w-7 "
                          + "place-items-center "
                          + "rounded-lg "
                          + "bg-[#c9ad50]/12 "
                          + "text-[10px] "
                          + "text-[#dfd18a]"
                        }
                        title="Resume"
                        aria-label={
                          `Resume ${task.filename}`
                        }
                      >
                        ▶
                      </button>
                    ) : null}

                    {task.status ===
                    "failed" ? (
                      <button
                        type="button"
                        onClick={() =>
                          queue.retryTask(
                            task.localId,
                          )
                        }
                        className={
                          "grid h-7 w-7 "
                          + "place-items-center "
                          + "rounded-lg "
                          + "bg-[#c9ad50]/12 "
                          + "text-[11px] "
                          + "text-[#dfd18a]"
                        }
                        title="Retry"
                        aria-label={
                          `Retry ${task.filename}`
                        }
                      >
                        ↻
                      </button>
                    ) : null}

                    {canCancel ? (
                      <button
                        type="button"
                        onClick={() =>
                          void queue.cancelTask(
                            task.localId,
                          )
                        }
                        className={
                          "grid h-7 w-7 "
                          + "place-items-center "
                          + "rounded-lg "
                          + "bg-white/[0.04] "
                          + "text-sm text-zinc-500 "
                          + "hover:bg-red-400/10 "
                          + "hover:text-red-200"
                        }
                        title="Cancel"
                        aria-label={
                          `Cancel ${task.filename}`
                        }
                      >
                        ×
                      </button>
                    ) : null}

                    {canDismiss ? (
                      <button
                        type="button"
                        onClick={() =>
                          queue.dismissTask(
                            task.localId,
                          )
                        }
                        className={
                          "grid h-7 w-7 "
                          + "place-items-center "
                          + "rounded-lg "
                          + "bg-white/[0.04] "
                          + "text-sm text-zinc-500"
                        }
                        title="Remove from list"
                        aria-label={
                          `Remove ${task.filename} from the list`
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>

                {task.status ===
                  "uploading" ||
                task.status ===
                  "queued" ||
                task.status ===
                  "paused" ? (
                  <div
                    className={
                      "mt-2 h-1 overflow-hidden "
                      + "rounded-full bg-white/[0.07]"
                    }
                  >
                    <div
                      className={
                        "h-full rounded-full "
                        + "bg-[#c9ad50] "
                        + "transition-[width]"
                      }
                      style={{
                        width:
                          `${Math.max(
                            2,
                            task.progress,
                          )}%`,
                      }}
                    />
                  </div>
                ) : null}

                {task.error ? (
                  <p
                    className={
                      "mt-1.5 truncate "
                      + "text-[9px] "
                      + "font-bold text-red-200"
                    }
                    title={task.error}
                  >
                    {task.error}
                  </p>
                ) : task.message ? (
                  <p
                    className={
                      "mt-1.5 truncate "
                      + "text-[9px] "
                      + "text-zinc-600"
                    }
                    title={task.message}
                  >
                    {task.message}
                  </p>
                ) : null}
              </div>
            );
          },
        )}
      </div>
    </details>
  );
}


export function buildFileBrainDisplayAttachments(
  tasks: GeneralAIFileBrainTask[],
): Array<{
  id: string;
  name: string;
  size: number;
  kind: "image" | "file";
}> {
  return tasks.map(
    (task) => ({
      id: task.localId,
      name: task.filename,
      size: task.fileSize,
      kind:
        task.contentType.startsWith(
          "image/",
        )
          ? "image"
          : "file",
    }),
  );
}


export type FileBrainQueueNode =
  ReactNode;
