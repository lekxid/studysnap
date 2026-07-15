"use client";

import {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  getStudyRooms,
  getToken,
  type StudyRoom,
  type UniversalMaterialUploadResponse,
  uploadUniversalMaterial,
} from "@/lib/api";

import {
  getSavedProjectRoomId,
  PROJECT_ROOM_CHANGED_EVENT,
} from "@/features/projects/projectRoomContext";

import {
  deleteUploadQueueFiles,
  readUploadQueueFile,
  saveUploadQueueFiles,
} from "@/lib/uploadQueueStorage";


type UploadStatus =
  | "queued"
  | "uploading"
  | "ready"
  | "stored_only"
  | "quarantined"
  | "failed"
  | "cancelled";

type UploadTask = {
  id: string;
  filename: string;
  fileSize: number;
  roomId: number;
  roomName: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  message?: string;
  materialId?: number;
  materialType?: string;
  previewAvailable?: boolean;
  createdAt: string;
  completedAt?: string;
};

type FloatingButtonPosition = {
  x: number;
  y: number;
};

type FloatingButtonDragSession = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const TASK_STORAGE_KEY =
  "studysnap:universal-upload-history";

const FLOATING_BUTTON_POSITION_KEY =
  "studysnap:upload-button-position";

const FLOATING_BUTTON_MARGIN = 12;

const MAX_VISIBLE_HISTORY = 100;
const MAX_FILES_PER_BATCH = 50;
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_UPLOAD_MB = 100;
const MAX_UPLOAD_BYTES =
  MAX_UPLOAD_MB * 1024 * 1024;

const HIDDEN_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
]);

function createTaskId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    ),
    units.length - 1
  );

  const value =
    bytes / Math.pow(1024, index);

  return `${value.toFixed(
    index === 0 || value >= 10 ? 0 : 1
  )} ${units[index]}`;
}

function statusLabel(status: UploadStatus) {
  const labels: Record<
    UploadStatus,
    string
  > = {
    queued: "Waiting",
    uploading: "Uploading",
    ready: "Ready",
    stored_only: "Stored",
    quarantined: "Quarantined",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  return labels[status];
}

function statusTone(status: UploadStatus) {
  if (status === "ready") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "stored_only") {
    return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  }

  if (status === "quarantined") {
    return "border-orange-300/25 bg-orange-300/10 text-orange-100";
  }

  if (status === "failed") {
    return "border-red-300/25 bg-red-300/10 text-red-100";
  }

  if (status === "cancelled") {
    return "border-slate-300/20 bg-slate-300/10 text-slate-300";
  }

  return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
}

function isFinished(status: UploadStatus) {
  return [
    "ready",
    "stored_only",
    "quarantined",
    "failed",
    "cancelled",
  ].includes(status);
}

function isUploadStatus(
  value: unknown
): value is UploadStatus {
  return [
    "queued",
    "uploading",
    "ready",
    "stored_only",
    "quarantined",
    "failed",
    "cancelled",
  ].includes(String(value));
}

function clampFloatingButtonPosition(
  position: FloatingButtonPosition,
  width: number,
  height: number
): FloatingButtonPosition {
  if (typeof window === "undefined") {
    return position;
  }

  const maxX = Math.max(
    FLOATING_BUTTON_MARGIN,
    window.innerWidth -
      width -
      FLOATING_BUTTON_MARGIN
  );

  const maxY = Math.max(
    FLOATING_BUTTON_MARGIN,
    window.innerHeight -
      height -
      FLOATING_BUTTON_MARGIN
  );

  return {
    x: Math.min(
      Math.max(position.x, FLOATING_BUTTON_MARGIN),
      maxX
    ),
    y: Math.min(
      Math.max(position.y, FLOATING_BUTTON_MARGIN),
      maxY
    ),
  };
}


function normalizeServerStatus(
  result: UniversalMaterialUploadResponse
): UploadStatus {
  if (
    result.processing_status ===
    "quarantined"
  ) {
    return "quarantined";
  }

  if (
    result.processing_status ===
    "stored_only"
  ) {
    return "stored_only";
  }

  return "ready";
}

export default function GlobalTaskDock({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const floatingButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const floatingButtonDragRef =
    useRef<FloatingButtonDragSession | null>(
      null
    );

  const ignoreNextButtonClickRef =
    useRef(false);

  const fileRefs = useRef<
    Map<string, File>
  >(new Map());

  const controllers = useRef<
    Map<string, AbortController>
  >(new Map());

  const activeUploadIds = useRef<
    Set<string>
  >(new Set());

  const userCancelledIds = useRef<
    Set<string>
  >(new Set());

  const [rooms, setRooms] =
    useState<StudyRoom[]>([]);

  const [
    selectedRoomId,
    setSelectedRoomId,
  ] = useState<number | null>(null);

  const [tasks, setTasks] =
    useState<UploadTask[]>([]);

  const [panelOpen, setPanelOpen] =
    useState(false);

  const [
    floatingButtonPosition,
    setFloatingButtonPosition,
  ] = useState<FloatingButtonPosition | null>(
    null
  );

  const [
    draggingFloatingButton,
    setDraggingFloatingButton,
  ] = useState(false);

  const [dragging, setDragging] =
    useState(false);

  const [error, setError] =
    useState("");

  const [loadingRooms, setLoadingRooms] =
    useState(false);

  const [hydrated, setHydrated] =
    useState(false);

  const [queueTick, setQueueTick] =
    useState(0);

  const hideDock =
    HIDDEN_PATHS.has(pathname) ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith(
      "/forgot-password"
    );

  useEffect(() => {
    let cancelled = false;

    async function hydrateQueue() {
      try {
        const raw =
          window.localStorage.getItem(
            TASK_STORAGE_KEY
          );

        if (!raw) {
          return;
        }

        const parsed =
          JSON.parse(raw) as UploadTask[];

        if (!Array.isArray(parsed)) {
          return;
        }

        const validTasks = parsed
          .filter(
            (task): task is UploadTask =>
              Boolean(task) &&
              typeof task.id ===
                "string" &&
              typeof task.filename ===
                "string" &&
              typeof task.roomId ===
                "number" &&
              isUploadStatus(
                task.status
              )
          )
          .slice(
            0,
            MAX_VISIBLE_HISTORY
          );

        const restoredTasks =
          await Promise.all(
            validTasks.map(
              async (
                task
              ): Promise<UploadTask> => {
                let restoredTask: UploadTask =
                  {
                    ...task,
                  };

                if (
                  task.status ===
                    "uploading" ||
                  task.status ===
                    "queued"
                ) {
                  restoredTask = {
                    ...task,
                    status: "queued",
                    progress: 0,
                    error: undefined,
                    message:
                      "Upload restored and waiting to continue.",
                    completedAt:
                      undefined,
                  };
                }

                if (
                  restoredTask.status ===
                    "queued" ||
                  restoredTask.status ===
                    "failed"
                ) {
                  try {
                    const restoredFile =
                      await readUploadQueueFile(
                        restoredTask.id
                      );

                    if (restoredFile) {
                      fileRefs.current.set(
                        restoredTask.id,
                        restoredFile
                      );

                      return restoredTask;
                    }
                  } catch {
                    // Fall through to the
                    // missing-file state.
                  }

                  if (
                    restoredTask.status ===
                    "queued"
                  ) {
                    return {
                      ...restoredTask,
                      status: "failed",
                      error:
                        "Select this file again to retry.",
                      message: undefined,
                      completedAt:
                        new Date().toISOString(),
                    };
                  }
                }

                return restoredTask;
              }
            )
          );

        if (!cancelled) {
          setTasks(restoredTasks);
        }
      } catch {
        window.localStorage.removeItem(
          TASK_STORAGE_KEY
        );
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    }

    void hydrateQueue();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const queueSnapshot = tasks
      .slice(0, MAX_VISIBLE_HISTORY)
      .map(
        (task): UploadTask => {
          if (
            task.status !==
            "uploading"
          ) {
            return task;
          }

          return {
            ...task,
            status: "queued",
            progress: 0,
            error: undefined,
            message:
              "Upload paused. It will continue when StudySnap opens again.",
            completedAt: undefined,
          };
        }
      );

    window.localStorage.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify(
        queueSnapshot
      )
    );
  }, [tasks, hydrated]);

  useEffect(() => {
    if (!getToken()) return;

    let cancelled = false;

    async function loadRooms() {
      try {
        setLoadingRooms(true);
        setError("");

        const roomData =
          await getStudyRooms();

        if (cancelled) return;

        setRooms(roomData);

        const savedRoomId =
          getSavedProjectRoomId();

        const savedRoomExists =
          roomData.some(
            (room) =>
              room.id === savedRoomId
          );

        setSelectedRoomId(
          savedRoomExists
            ? savedRoomId
            : roomData[0]?.id ?? null
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Rooms could not be loaded."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRooms(false);
        }
      }
    }

    void loadRooms();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !hydrated ||
      hideDock ||
      panelOpen ||
      !getToken()
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(
      () => {
        const button =
          floatingButtonRef.current;

        if (!button) return;

        const rect =
          button.getBoundingClientRect();

        let nextPosition:
          | FloatingButtonPosition
          | null = null;

        try {
          const saved =
            window.localStorage.getItem(
              FLOATING_BUTTON_POSITION_KEY
            );

          if (saved) {
            const parsed = JSON.parse(
              saved
            ) as Partial<FloatingButtonPosition>;

            if (
              typeof parsed.x === "number" &&
              Number.isFinite(parsed.x) &&
              typeof parsed.y === "number" &&
              Number.isFinite(parsed.y)
            ) {
              nextPosition = {
                x: parsed.x,
                y: parsed.y,
              };
            }
          }
        } catch {
          window.localStorage.removeItem(
            FLOATING_BUTTON_POSITION_KEY
          );
        }

        if (!nextPosition) {
          nextPosition = {
            x:
              window.innerWidth -
              rect.width -
              20,
            y:
              window.innerHeight -
              rect.height -
              20,
          };
        }

        setFloatingButtonPosition(
          clampFloatingButtonPosition(
            nextPosition,
            rect.width,
            rect.height
          )
        );
      }
    );

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    hydrated,
    hideDock,
    panelOpen,
    pathname,
  ]);

  useEffect(() => {
    if (!floatingButtonPosition) return;

    window.localStorage.setItem(
      FLOATING_BUTTON_POSITION_KEY,
      JSON.stringify(
        floatingButtonPosition
      )
    );
  }, [floatingButtonPosition]);

  useEffect(() => {
    function handleResize() {
      const button =
        floatingButtonRef.current;

      if (!button) return;

      const rect =
        button.getBoundingClientRect();

      setFloatingButtonPosition(
        (current) =>
          current
            ? clampFloatingButtonPosition(
                current,
                rect.width,
                rect.height
              )
            : current
      );
    }

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  useEffect(() => {
    if (!draggingFloatingButton) {
      return;
    }

    function handlePointerMove(
      event: PointerEvent
    ) {
      const dragSession =
        floatingButtonDragRef.current;

      const button =
        floatingButtonRef.current;

      if (
        !dragSession ||
        !button ||
        event.pointerId !==
          dragSession.pointerId
      ) {
        return;
      }

      const movedDistance = Math.hypot(
        event.clientX -
          dragSession.startX,
        event.clientY -
          dragSession.startY
      );

      if (movedDistance > 4) {
        dragSession.moved = true;
      }

      const rect =
        button.getBoundingClientRect();

      const nextPosition =
        clampFloatingButtonPosition(
          {
            x:
              event.clientX -
              dragSession.offsetX,
            y:
              event.clientY -
              dragSession.offsetY,
          },
          rect.width,
          rect.height
        );

      setFloatingButtonPosition(
        nextPosition
      );

      if (event.cancelable) {
        event.preventDefault();
      }
    }

    function finishPointerDrag(
      event: PointerEvent
    ) {
      const dragSession =
        floatingButtonDragRef.current;

      if (
        !dragSession ||
        event.pointerId !==
          dragSession.pointerId
      ) {
        return;
      }

      ignoreNextButtonClickRef.current =
        dragSession.moved;

      floatingButtonDragRef.current =
        null;

      setDraggingFloatingButton(false);

      window.setTimeout(() => {
        ignoreNextButtonClickRef.current =
          false;
      }, 0);
    }

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      { passive: false }
    );

    window.addEventListener(
      "pointerup",
      finishPointerDrag
    );

    window.addEventListener(
      "pointercancel",
      finishPointerDrag
    );

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "pointerup",
        finishPointerDrag
      );

      window.removeEventListener(
        "pointercancel",
        finishPointerDrag
      );
    };
  }, [draggingFloatingButton]);

  useEffect(() => {
    function handleRoomChange(
      event: Event
    ) {
      const roomEvent =
        event as CustomEvent<{
          roomId?: number;
        }>;

      const nextRoomId =
        roomEvent.detail?.roomId ??
        getSavedProjectRoomId();

      if (nextRoomId) {
        setSelectedRoomId(
          nextRoomId
        );
      }
    }

    window.addEventListener(
      PROJECT_ROOM_CHANGED_EVENT,
      handleRoomChange
    );

    return () => {
      window.removeEventListener(
        PROJECT_ROOM_CHANGED_EVENT,
        handleRoomChange
      );
    };
  }, []);

  useEffect(() => {
    function handleOpenUniversalUpload(
      event: Event
    ) {
      const uploadEvent =
        event as CustomEvent<{
          roomId?: number;
          openPanel?: boolean;
        }>;

      const requestedRoomId =
        uploadEvent.detail?.roomId;

      if (
        typeof requestedRoomId === "number" &&
        requestedRoomId > 0
      ) {
        setSelectedRoomId(
          requestedRoomId
        );
      }

      if (uploadEvent.detail?.openPanel !== false) {
        setPanelOpen(true);
      }

      const fileInput =
        fileInputRef.current;

      if (!fileInput) {
        setError(
          "The file picker could not open. Please refresh and try again."
        );
        return;
      }

      // Open synchronously so the browser keeps the user's click permission.
      fileInput.value = "";
      fileInput.click();
    }

    window.addEventListener(
      "studysnap:open-universal-upload",
      handleOpenUniversalUpload
    );

    return () => {
      window.removeEventListener(
        "studysnap:open-universal-upload",
        handleOpenUniversalUpload
      );
    };
  }, []);

  useEffect(() => {
    function handleOnline() {
      setQueueTick(
        (current) => current + 1
      );
    }

    window.addEventListener(
      "online",
      handleOnline
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );
    };
  }, []);

  useEffect(() => {
    return () => {
      controllers.current.forEach(
        (controller) =>
          controller.abort()
      );

      controllers.current.clear();
      activeUploadIds.current.clear();
      userCancelledIds.current.clear();
    };
  }, []);

  const activeCount = useMemo(
    () =>
      tasks.filter((task) =>
        [
          "queued",
          "uploading",
        ].includes(task.status)
      ).length,
    [tasks]
  );

  const completedCount = useMemo(
    () =>
      tasks.filter((task) =>
        [
          "ready",
          "stored_only",
        ].includes(task.status)
      ).length,
    [tasks]
  );

  const selectedRoom = useMemo(
    () =>
      rooms.find(
        (room) =>
          room.id === selectedRoomId
      ) ?? null,
    [rooms, selectedRoomId]
  );

  function updateTask(
    taskId: string,
    patch:
      | Partial<UploadTask>
      | ((
          current: UploadTask
        ) => Partial<UploadTask>)
  ) {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const nextPatch =
          typeof patch === "function"
            ? patch(task)
            : patch;

        return {
          ...task,
          ...nextPatch,
        };
      })
    );
  }

  async function startUpload(
    taskId: string,
    taskOverride?: UploadTask
  ) {
    const file =
      fileRefs.current.get(taskId);

    const task =
      taskOverride ??
      tasks.find(
        (item) => item.id === taskId
      );

    if (!file) {
      updateTask(taskId, {
        status: "failed",
        error:
          "Select this file again to retry.",
      });
      return;
    }

    if (!task) return;

    if (
      typeof navigator !==
        "undefined" &&
      !navigator.onLine
    ) {
      updateTask(taskId, {
        status: "queued",
        error: undefined,
        message:
          "Waiting for an internet connection.",
      });
      return;
    }

    if (
      activeUploadIds.current.has(
        taskId
      )
    ) {
      return;
    }

    activeUploadIds.current.add(
      taskId
    );

    controllers.current
      .get(taskId)
      ?.abort();

    const controller =
      new AbortController();

    controllers.current.set(
      taskId,
      controller
    );

    updateTask(taskId, {
      status: "uploading",
      progress: 0,
      error: undefined,
      message: undefined,
      completedAt: undefined,
    });

    try {
      const result =
        await uploadUniversalMaterial({
          file,
          studyRoomId: task.roomId,
          signal: controller.signal,
          onProgress: (progress) => {
            updateTask(taskId, {
              progress,
            });
          },
        });

      updateTask(taskId, {
        progress: 100,
        status:
          normalizeServerStatus(
            result
          ),
        materialId: result.id,
        materialType:
          result.material_type,

          previewAvailable:
            result.preview_available,
        message: result.message,
        completedAt:
          new Date().toISOString(),
      });

      fileRefs.current.delete(
        taskId
      );

      await deleteUploadQueueFiles(
        [taskId]
      ).catch(() => undefined);
    } catch (uploadError) {
      const aborted =
        controller.signal.aborted;

      const cancelledByUser =
        aborted &&
        userCancelledIds.current.has(
          taskId
        );

      const interrupted =
        aborted &&
        !cancelledByUser;

      const offline =
        typeof navigator !==
          "undefined" &&
        !navigator.onLine;

      if (cancelledByUser) {
        fileRefs.current.delete(
          taskId
        );

        await deleteUploadQueueFiles(
          [taskId]
        ).catch(() => undefined);
      }

      updateTask(taskId, {
        status: cancelledByUser
          ? "cancelled"
          : offline || interrupted
            ? "queued"
            : "failed",
        error: cancelledByUser
          ? "Upload cancelled."
          : offline || interrupted
            ? undefined
            : uploadError instanceof
                Error
              ? uploadError.message
              : "Upload failed.",
        message: offline
          ? "Waiting for an internet connection."
          : interrupted
            ? "Upload paused and will continue automatically."
            : undefined,
        completedAt:
          offline || interrupted
            ? undefined
            : new Date().toISOString(),
      });
    } finally {
      controllers.current.delete(
        taskId
      );

      activeUploadIds.current.delete(
        taskId
      );

      userCancelledIds.current.delete(
        taskId
      );

      setQueueTick(
        (current) => current + 1
      );
    }
  }

  useEffect(() => {
    if (!hydrated || !getToken()) {
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
      activeUploadIds.current.size;

    if (availableSlots <= 0) {
      return;
    }

    const nextTasks = tasks
      .filter(
        (task) =>
          task.status === "queued" &&
          fileRefs.current.has(task.id) &&
          !activeUploadIds.current.has(
            task.id
          )
      )
      .slice(0, availableSlots);

    nextTasks.forEach((task) => {
      void startUpload(
        task.id,
        task
      );
    });
  }, [hydrated, queueTick, tasks]);

  async function queueFiles(
    files: File[]
  ) {
    setError("");

    if (!selectedRoomId) {
      setError(
        "Choose a Study Room before uploading."
      );
      setPanelOpen(true);
      return;
    }

    if (!selectedRoom) {
      setError(
        "The selected Study Room could not be found."
      );
      setPanelOpen(true);
      return;
    }

    if (files.length === 0) {
      return;
    }

    const selectedFiles =
      files.slice(
        0,
        MAX_FILES_PER_BATCH
      );

    if (
      files.length >
      MAX_FILES_PER_BATCH
    ) {
      setError(
        `Only the first ${MAX_FILES_PER_BATCH} files were added.`
      );
    }

    const newTasks =
      selectedFiles.map(
        (file): UploadTask => {
          const id = createTaskId();

          const exceedsLimit =
            file.size >
            MAX_UPLOAD_BYTES;

          if (!exceedsLimit) {
            fileRefs.current.set(
              id,
              file
            );
          }

          return {
            id,
            filename: file.name,
            fileSize: file.size,
            roomId: selectedRoom.id,
            roomName:
              selectedRoom.name ||
              `Room #${selectedRoom.id}`,
            progress: 0,
            status: exceedsLimit
              ? "failed"
              : "queued",
            error: exceedsLimit
              ? `This file is larger than the ${MAX_UPLOAD_MB} MB upload limit.`
              : undefined,
            createdAt:
              new Date().toISOString(),
            completedAt: exceedsLimit
              ? new Date().toISOString()
              : undefined,
          };
        }
      );

    const oversizedCount =
      newTasks.filter(
        (task) =>
          task.fileSize >
          MAX_UPLOAD_BYTES
      ).length;

    setPanelOpen(true);

    let recoveryUnavailable =
      false;

    try {
      await saveUploadQueueFiles(
        newTasks.flatMap(
          (task, index) =>
            task.status === "queued"
              ? [
                  {
                    taskId: task.id,
                    file:
                      selectedFiles[
                        index
                      ],
                  },
                ]
              : []
        )
      );
    } catch {
      recoveryUnavailable = true;
    }

    setTasks((current) => [
      ...newTasks,
      ...current,
    ]);

    if (recoveryUnavailable) {
      setError(
        "Uploads can continue now, but some files may need to be selected again after a refresh."
      );
    } else if (oversizedCount > 0) {
      setError(
        `${oversizedCount} ${
          oversizedCount === 1
            ? "file is"
            : "files are"
        } larger than the ${MAX_UPLOAD_MB} MB upload limit.`
      );
    }

    setQueueTick(
      (current) => current + 1
    );
  }

  function beginFloatingButtonDrag(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (
      event.button !== 0 ||
      panelOpen
    ) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    floatingButtonDragRef.current = {
      pointerId: event.pointerId,
      offsetX:
        event.clientX - rect.left,
      offsetY:
        event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };

    setDraggingFloatingButton(true);

    event.currentTarget.setPointerCapture?.(
      event.pointerId
    );
  }

  function openUploadPanelFromButton() {
    if (
      ignoreNextButtonClickRef.current
    ) {
      ignoreNextButtonClickRef.current =
        false;
      return;
    }

    setPanelOpen(true);
  }

  function handleFileInput(
    event: ChangeEvent<HTMLInputElement>
  ) {
    void queueFiles(
      Array.from(
        event.target.files ?? []
      )
    );

    event.target.value = "";
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    setDragging(false);

    void queueFiles(
      Array.from(
        event.dataTransfer.files
      )
    );
  }

  function cancelTask(taskId: string) {
    const controller =
      controllers.current.get(
        taskId
      );

    if (controller) {
      userCancelledIds.current.add(
        taskId
      );

      controller.abort();
      return;
    }

    updateTask(taskId, {
      status: "cancelled",
      error: "Upload cancelled.",
      message: undefined,
      completedAt:
        new Date().toISOString(),
    });

    fileRefs.current.delete(
      taskId
    );

    void deleteUploadQueueFiles(
      [taskId]
    ).catch(() => undefined);
  }

  function retryTask(taskId: string) {
    const task = tasks.find(
      (item) =>
        item.id === taskId
    );

    if (
      task &&
      task.fileSize >
        MAX_UPLOAD_BYTES
    ) {
      updateTask(taskId, {
        status: "failed",
        error:
          `This file is larger than the ${MAX_UPLOAD_MB} MB upload limit.`,
        message: undefined,
        completedAt:
          new Date().toISOString(),
      });

      fileRefs.current.delete(
        taskId
      );

      void deleteUploadQueueFiles(
        [taskId]
      ).catch(() => undefined);

      return;
    }

    if (
      !fileRefs.current.has(taskId)
    ) {
      updateTask(taskId, {
        status: "failed",
        error:
          "Select this file again to retry.",
      });
      return;
    }

    updateTask(taskId, {
      status: "queued",
      progress: 0,
      error: undefined,
      message: undefined,
      completedAt: undefined,
    });

    setQueueTick(
      (current) => current + 1
    );
  }

  function dismissTask(taskId: string) {
    userCancelledIds.current.add(
      taskId
    );

    controllers.current
      .get(taskId)
      ?.abort();

    controllers.current.delete(
      taskId
    );

    fileRefs.current.delete(
      taskId
    );

    void deleteUploadQueueFiles(
      [taskId]
    ).catch(() => undefined);

    setTasks((current) =>
      current.filter(
        (task) =>
          task.id !== taskId
      )
    );
  }

  function clearFinished() {
    const finishedIds = new Set(
      tasks
        .filter((task) =>
          isFinished(task.status)
        )
        .map((task) => task.id)
    );

    finishedIds.forEach((id) => {
      fileRefs.current.delete(id);
    });

    void deleteUploadQueueFiles(
      Array.from(finishedIds)
    ).catch(() => undefined);

    setTasks((current) =>
      current.filter(
        (task) =>
          !finishedIds.has(task.id)
      )
    );
  }

  function openTaskRoom(
    task: UploadTask
  ) {
    router.push(
      `/study-rooms/${task.roomId}`
    );
    setPanelOpen(false);
  }

  function openTaskAI(
    task: UploadTask
  ) {
    if (
      typeof task.materialId !==
      "number"
    ) {
      openTaskRoom(task);
      return;
    }

    const searchParams =
      new URLSearchParams({
        tab: "ai",
        materialId: String(
          task.materialId
        ),
        materialName:
          task.filename,
      });

    router.push(
      `/study-rooms/${task.roomId}?${searchParams.toString()}`
    );

    setPanelOpen(false);
  }

  const canShowDock =
    hydrated &&
    !hideDock &&
    Boolean(getToken());

  return (
    <>
      {children}

      {canShowDock ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInput}
            className="hidden"
          />

          {panelOpen ? (
            <section
              aria-label="StudySnap Task Dock"
              className="fixed bottom-4 right-4 z-[90] flex max-h-[78vh] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#07111e]/98 shadow-[0_28px_100px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
            >
              <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">
                    StudySnap Task Dock
                  </p>

                  <h2 className="mt-1 text-lg font-black text-white">
                    Universal uploads
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPanelOpen(false)
                  }
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-slate-200 hover:bg-white/[0.09]"
                >
                  Minimize
                </button>
              </header>

              <div className="border-b border-white/10 p-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Save files to
                  </span>

                  <select
                    value={
                      selectedRoomId ?? ""
                    }
                    disabled={
                      loadingRooms ||
                      rooms.length === 0
                    }
                    onChange={(event) =>
                      setSelectedRoomId(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="rounded-xl px-3 py-2.5 text-sm"
                  >
                    {rooms.length === 0 ? (
                      <option value="">
                        No Study Rooms found
                      </option>
                    ) : (
                      rooms.map((room) => (
                        <option
                          key={room.id}
                          value={room.id}
                        >
                          {room.name} —{" "}
                          {room.subject}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();

                    if (
                      event.currentTarget ===
                      event.target
                    ) {
                      setDragging(false);
                    }
                  }}
                  onDrop={handleDrop}
                  className={`mt-3 rounded-2xl border border-dashed p-4 text-center transition ${
                    dragging
                      ? "border-yellow-300 bg-yellow-300/15"
                      : "border-white/15 bg-white/[0.035]"
                  }`}
                >
                  <p className="text-sm font-black text-white">
                    Drop any files here
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Code, audio, video,
                    Office files, archives,
                    PDFs and unknown formats.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    disabled={
                      rooms.length === 0
                    }
                    className="mt-3 rounded-xl bg-yellow-300 px-4 py-2.5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Choose files
                  </button>
                </div>

                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Uploaded code is stored as
                  text and never executed
                  automatically.
                </p>

                {error ? (
                  <p className="mt-3 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs text-red-100">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-xs font-bold text-slate-400">
                  {activeCount} active ·{" "}
                  {completedCount} ready
                </p>

                {tasks.some((task) =>
                  isFinished(task.status)
                ) ? (
                  <button
                    type="button"
                    onClick={clearFinished}
                    className="text-xs font-black text-slate-300 hover:text-white"
                  >
                    Clear finished
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {tasks.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                    <p className="text-sm font-black text-white">
                      No upload tasks yet
                    </p>

                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Start an upload, minimize
                      this dock and continue
                      working anywhere in
                      StudySnap.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {tasks.map((task) => {
                      const canRetry =
                        fileRefs.current.has(
                          task.id
                        );


                      const canAskAI =
                        task.status ===
                          "ready" &&
                        task.previewAvailable ===
                          true &&
                        typeof task.materialId ===
                          "number";
                      return (
                        <article
                          key={task.id}
                          className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white">
                                {task.filename}
                              </p>

                              <p className="mt-1 text-[11px] text-slate-500">
                                {formatBytes(
                                  task.fileSize
                                )}{" "}
                                · {task.roomName}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${statusTone(
                                task.status
                              )}`}
                            >
                              {statusLabel(
                                task.status
                              )}
                            </span>
                          </div>

                          {[
                            "queued",
                            "uploading",
                          ].includes(
                            task.status
                          ) ? (
                            <div className="mt-3">
                              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-yellow-300 transition-[width]"
                                  style={{
                                    width: `${task.progress}%`,
                                  }}
                                />
                              </div>

                              <p className="mt-1 text-right text-[11px] font-bold text-slate-400">
                                {task.progress}%
                              </p>
                            </div>
                          ) : null}

                          {task.materialType ? (
                            <p className="mt-2 text-xs text-slate-400">
                              Type:{" "}
                              <span className="font-bold text-slate-200">
                                {task.materialType}
                              </span>
                            </p>
                          ) : null}

                          {task.message ? (
                            <p className="mt-2 text-xs leading-5 text-slate-300">
                              {task.message}
                            </p>
                          ) : null}

                          {task.error ? (
                            <p className="mt-2 text-xs leading-5 text-red-200">
                              {task.error}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {task.status ===
                            "uploading" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  cancelTask(
                                    task.id
                                  )
                                }
                                className="rounded-lg border border-red-300/20 bg-red-300/10 px-3 py-1.5 text-xs font-black text-red-100"
                              >
                                Cancel
                              </button>
                            ) : null}

                            {[
                              "failed",
                              "cancelled",
                            ].includes(
                              task.status
                            ) &&
                            canRetry ? (
                              <button
                                type="button"
                                onClick={() =>
                                  retryTask(
                                    task.id
                                  )
                                }
                                className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-1.5 text-xs font-black text-yellow-100"
                              >
                                Retry
                              </button>
                            ) : null}
                              {canAskAI ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openTaskAI(
                                      task
                                    )
                                  }
                                  className="rounded-lg bg-yellow-300 px-3 py-1.5 text-xs font-black text-black transition hover:bg-yellow-200"
                                >
                                  Ask AI
                                </button>
                              ) : null}


                            {[
                              "ready",
                              "stored_only",
                              "quarantined",
                            ].includes(
                              task.status
                            ) ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openTaskRoom(
                                    task
                                  )
                                }
                                className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100"
                              >
                                Open room
                              </button>
                            ) : null}

                            {isFinished(
                              task.status
                            ) ? (
                              <button
                                type="button"
                                onClick={() =>
                                  dismissTask(
                                    task.id
                                  )
                                }
                                className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-black text-slate-300"
                              >
                                Dismiss
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : activeCount > 0 ? (
            <button
              ref={floatingButtonRef}
              type="button"
              onPointerDown={
                beginFloatingButtonDrag
              }
              onClick={
                openUploadPanelFromButton
              }
              style={
                floatingButtonPosition
                  ? {
                      left:
                        floatingButtonPosition.x,
                      top:
                        floatingButtonPosition.y,
                      right: "auto",
                      bottom: "auto",
                    }
                  : undefined
              }
              className={`fixed bottom-5 right-5 z-[90] flex touch-none select-none items-center gap-3 rounded-2xl border border-yellow-300/30 bg-[#08111d]/95 px-4 py-3 text-left shadow-[0_20px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl hover:border-yellow-300/55 ${
                draggingFloatingButton
                  ? "cursor-grabbing scale-[1.02]"
                  : "cursor-grab"
              }`}
              title="Drag to move. Click to open uploads."
              aria-label="Uploads. Drag to move or click to open."
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-yellow-300 text-xl text-black">
                ↑
              </span>

              <span>
                <span className="block text-xs font-black uppercase tracking-[0.14em] text-yellow-200">
                  Uploads
                </span>

                <span className="block text-xs text-slate-400">
                  {activeCount > 0
                    ? `${activeCount} active task${
                        activeCount === 1
                          ? ""
                          : "s"
                      }`
                    : "Add any file"}
                </span>
              </span>

              {activeCount > 0 ? (
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-yellow-300 px-2 text-xs font-black text-black">
                  {activeCount}
                </span>
              ) : null}

              <span
                aria-hidden="true"
                className="ml-1 text-sm font-black tracking-[-0.2em] text-slate-500"
              >
                ⋮⋮
              </span>
            </button>
          ) : null}
        </>
      ) : null}
    </>
  );
}
