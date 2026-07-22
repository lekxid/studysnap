"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import SmartScanAskPanel from "@/features/smart-scan/SmartScanAskPanel";
import SmartScanPageRail from "@/features/smart-scan/SmartScanPageRail";

import {
  askSmartScan,
  createSmartScan,
  deleteSmartScan,
  deleteSmartScanPage,
  downloadSmartScanPdf,
  getSmartScan,
  getSmartScanPageBlobUrl,
  getSmartScanPdfBlobUrl,
  getStudyRooms,
  getToken,
  listSmartScans,
  recognizeSmartScanPages,
  reorderSmartScanPages,
  rotateSmartScanPage,
  updateSmartScan,
  uploadSmartScanPages,
  type SmartScan,
  type SmartScanPage,
  type StudyRoom,
} from "@/lib/api";

const MAX_SCAN_PAGES = 50;

function formatDate(value: string | null) {
  if (!value) return "Recently";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function isAcceptedImage(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

function readablePageCount(scan: SmartScan) {
  return scan.pages.filter(
    (page) => page.extracted_text.trim(),
  ).length;
}

function failedPageCount(scan: SmartScan) {
  return scan.pages.filter(
    (page) =>
      Boolean(page.ocr_error) ||
      page.ocr_status.toLowerCase() === "failed",
  ).length;
}

function sortScans(scans: SmartScan[]) {
  return [...scans].sort((first, second) => {
    const firstTime = new Date(
      first.updated_at ||
        first.created_at ||
        0,
    ).getTime();

    const secondTime = new Date(
      second.updated_at ||
        second.created_at ||
        0,
    ).getTime();

    return secondTime - firstTime;
  });
}

function scanStatusLabel(scan: SmartScan) {
  const status = scan.status.toLowerCase();

  if (
    status === "failed" ||
    status === "error"
  ) {
    return "Review";
  }

  if (
    scan.extracted_text.trim() ||
    status === "ready" ||
    status === "completed"
  ) {
    return "Ready";
  }

  if (scan.page_count > 0) {
    return "Draft";
  }

  return "Empty";
}

export default function SmartScanWorkspace() {
  const router = useRouter();

  const photoInputRef =
    useRef<HTMLInputElement | null>(null);

  const cameraInputRef =
    useRef<HTMLInputElement | null>(null);

  const [scans, setScans] =
    useState<SmartScan[]>([]);

  const [activeScan, setActiveScan] =
    useState<SmartScan | null>(null);

  const [rooms, setRooms] =
    useState<StudyRoom[]>([]);

  const [newScanRoomId, setNewScanRoomId] =
    useState<number | null>(null);

  const [selectedPageId, setSelectedPageId] =
    useState<number | null>(null);

  const [titleDraft, setTitleDraft] =
    useState("");

  const [loaded, setLoaded] =
    useState(false);

  const [loadingScanId, setLoadingScanId] =
    useState<number | null>(null);

  const [creating, setCreating] =
    useState(false);

  const [savingTitle, setSavingTitle] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [uploadProgress, setUploadProgress] =
    useState(0);

  const [uploadController, setUploadController] =
    useState<AbortController | null>(null);

  const [recognizing, setRecognizing] =
    useState(false);

  const [recognitionMessage, setRecognitionMessage] =
    useState("");

  const [busyPageId, setBusyPageId] =
    useState<number | null>(null);

  const [previewUrl, setPreviewUrl] =
    useState("");

  const [previewForPageId, setPreviewForPageId] =
    useState<number | null>(null);

  const [previewLoading, setPreviewLoading] =
    useState(false);

  const [previewError, setPreviewError] =
    useState("");

  const [question, setQuestion] =
    useState("");

  const [answer, setAnswer] =
    useState("");

  const [asking, setAsking] =
    useState(false);

  const [pdfBusy, setPdfBusy] =
    useState<"open" | "download" | null>(null);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const selectedPage =
    activeScan?.pages.find(
      (page) => page.id === selectedPageId,
    ) ?? null;

  const previewPageId =
    selectedPage?.id ?? null;

  const activeRoomName =
    activeScan?.study_room_id
      ? rooms.find(
          (room) =>
            room.id === activeScan.study_room_id,
        )?.name ||
        `Room #${activeScan.study_room_id}`
      : null;

  const readablePages =
    activeScan
      ? readablePageCount(activeScan)
      : 0;

  const failedPages =
    activeScan
      ? failedPageCount(activeScan)
      : 0;

  const canAsk = Boolean(
    activeScan?.extracted_text.trim(),
  );

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function commitScan(scan: SmartScan) {
    setActiveScan(scan);
    setTitleDraft(scan.title);

    setScans((current) =>
      sortScans([
        scan,
        ...current.filter(
          (item) => item.id !== scan.id,
        ),
      ]),
    );
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace(
        "/login?next=/smart-scan",
      );
      return;
    }

    let cancelled = false;

    async function loadWorkspace() {
      try {
        const [scanItems, roomItems] =
          await Promise.all([
            listSmartScans(),
            getStudyRooms().catch(() => []),
          ]);

        if (cancelled) return;

        const orderedScans = sortScans(
          Array.isArray(scanItems)
            ? scanItems
            : [],
        );

        setScans(orderedScans);

        setRooms(
          Array.isArray(roomItems)
            ? roomItems
            : [],
        );

        if (orderedScans[0]) {
          const fullScan = await getSmartScan(
            orderedScans[0].id,
          );

          if (cancelled) return;

          setActiveScan(fullScan);
          setTitleDraft(fullScan.title);
          setSelectedPageId(
            fullScan.pages[0]?.id ?? null,
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Smart Scan could not be opened.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (previewPageId === null) {
      return;
    }

    let cancelled = false;
    let objectUrl = "";

    const frame = window.requestAnimationFrame(
      () => {
        if (cancelled) return;

        setPreviewForPageId(null);
        setPreviewUrl("");
        setPreviewLoading(true);
        setPreviewError("");

        void getSmartScanPageBlobUrl(
          previewPageId,
        )
          .then((url) => {
            if (cancelled) {
              URL.revokeObjectURL(url);
              return;
            }

            objectUrl = url;
            setPreviewUrl(url);
            setPreviewForPageId(
              previewPageId,
            );
          })
          .catch((previewLoadError) => {
            if (cancelled) return;

            setPreviewForPageId(
              previewPageId,
            );

            setPreviewError(
              previewLoadError instanceof Error
                ? previewLoadError.message
                : "This page preview could not be opened.",
            );
          })
          .finally(() => {
            if (!cancelled) {
              setPreviewLoading(false);
            }
          });
      },
    );

    return () => {
      cancelled = true;

      window.cancelAnimationFrame(frame);

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [previewPageId]);

  async function openScan(scanId: number) {
    if (
      loadingScanId !== null ||
      scanId === activeScan?.id
    ) {
      return;
    }

    clearMessages();
    setLoadingScanId(scanId);
    setQuestion("");
    setAnswer("");

    try {
      const scan = await getSmartScan(scanId);

      setActiveScan(scan);
      setTitleDraft(scan.title);
      setSelectedPageId(
        scan.pages[0]?.id ?? null,
      );
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "This scan could not be opened.",
      );
    } finally {
      setLoadingScanId(null);
    }
  }

  async function createNewScan() {
    if (creating) return;

    clearMessages();
    setCreating(true);

    try {
      const scan = await createSmartScan({
        title: "New Scan",
        study_room_id: newScanRoomId,
      });

      commitScan(scan);
      setSelectedPageId(null);
      setQuestion("");
      setAnswer("");

      setNotice(
        "New scan created. Add clear photos in page order.",
      );

      window.setTimeout(() => {
        photoInputRef.current?.click();
      }, 0);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The scan could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function saveTitle() {
    if (!activeScan || savingTitle) return;

    const title = titleDraft.trim();

    if (!title) {
      setError("Enter a scan title.");
      return;
    }

    if (title === activeScan.title) {
      return;
    }

    clearMessages();
    setSavingTitle(true);

    try {
      const updated = await updateSmartScan(
        activeScan.id,
        title,
      );

      commitScan(updated);
      setNotice("Scan title updated.");
    } catch (titleError) {
      setError(
        titleError instanceof Error
          ? titleError.message
          : "The title could not be updated.",
      );
    } finally {
      setSavingTitle(false);
    }
  }

  async function addFiles(
    fileList: FileList | null,
  ) {
    if (
      !activeScan ||
      uploading ||
      !fileList
    ) {
      return;
    }

    const selectedFiles =
      Array.from(fileList);

    if (!selectedFiles.length) return;

    const imageFiles =
      selectedFiles.filter(isAcceptedImage);

    if (
      imageFiles.length !==
      selectedFiles.length
    ) {
      setError(
        "Smart Scan currently accepts image pages only.",
      );
      return;
    }

    const remaining =
      MAX_SCAN_PAGES -
      activeScan.page_count;

    if (remaining <= 0) {
      setError(
        "This scan already has the maximum of 50 pages.",
      );
      return;
    }

    if (imageFiles.length > remaining) {
      setError(
        `This scan can accept ${remaining} more page${
          remaining === 1 ? "" : "s"
        }.`,
      );
      return;
    }

    clearMessages();

    const controller =
      new AbortController();

    setUploadController(controller);
    setUploading(true);
    setUploadProgress(0);

    try {
      const updated =
        await uploadSmartScanPages({
          scanId: activeScan.id,
          files: imageFiles,
          signal: controller.signal,
          onProgress: setUploadProgress,
        });

      commitScan(updated);

      setSelectedPageId(
        updated.pages[
          updated.pages.length - 1
        ]?.id ?? null,
      );

      setNotice(
        `${imageFiles.length} page${
          imageFiles.length === 1 ? "" : "s"
        } added. Review the order before reading.`,
      );
    } catch (uploadError) {
      if (
        uploadError instanceof DOMException &&
        uploadError.name === "AbortError"
      ) {
        setNotice("Image upload cancelled.");
      } else {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "The images could not be uploaded.",
        );
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadController(null);
    }
  }

  function handlePhotoInput(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    void addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  async function runRecognition(
    pageIds: number[] | null,
  ) {
    if (
      !activeScan ||
      recognizing ||
      activeScan.page_count === 0
    ) {
      return;
    }

    clearMessages();
    setRecognizing(true);

    setRecognitionMessage(
      pageIds
        ? "Reading selected page..."
        : "Reading pages in safe batches...",
    );

    try {
      let latestScan = activeScan;
      let stoppedWithoutProgress = false;

      const maximumRounds =
        pageIds ? 1 : MAX_SCAN_PAGES + 2;

      for (
        let round = 0;
        round < maximumRounds;
        round += 1
      ) {
        const result =
          await recognizeSmartScanPages(
            latestScan.id,
            pageIds,
          );

        latestScan = result.scan;
        commitScan(latestScan);

        const readable =
          readablePageCount(latestScan);

        const failed =
          failedPageCount(latestScan);

        setRecognitionMessage(
          pageIds
            ? "Selected page processed."
            : `Read ${readable} of ${latestScan.page_count} pages${
                failed > 0
                  ? ` · ${failed} need review`
                  : ""
              }`,
        );

        if (
          pageIds ||
          result.remaining_count <= 0
        ) {
          break;
        }

        if (result.processed_count <= 0) {
          stoppedWithoutProgress = true;
          break;
        }
      }

      setNotice(
        stoppedWithoutProgress
          ? "Automatic reading stopped because a remaining page could not be processed safely. Review its error and retry it individually."
          : "Reading finished. Check low-confidence and failed pages before relying on the text.",
      );
    } catch (recognitionError) {
      setError(
        recognitionError instanceof Error
          ? recognitionError.message
          : "StudySnap could not read these pages.",
      );
    } finally {
      setRecognizing(false);
      setRecognitionMessage("");
    }
  }

  async function rotatePage(
    page: SmartScanPage,
  ) {
    if (!activeScan || busyPageId !== null) {
      return;
    }

    clearMessages();
    setBusyPageId(page.id);

    try {
      const updatedPage =
        await rotateSmartScanPage(
          page.id,
          (page.rotation + 90) % 360,
        );

      commitScan({
        ...activeScan,
        pages: activeScan.pages.map(
          (item) =>
            item.id === updatedPage.id
              ? updatedPage
              : item,
        ),
      });
    } catch (rotationError) {
      setError(
        rotationError instanceof Error
          ? rotationError.message
          : "The page could not be rotated.",
      );
    } finally {
      setBusyPageId(null);
    }
  }

  async function movePage(
    pageId: number,
    direction: -1 | 1,
  ) {
    if (!activeScan || busyPageId !== null) {
      return;
    }

    const currentIndex =
      activeScan.pages.findIndex(
        (page) => page.id === pageId,
      );

    const nextIndex =
      currentIndex + direction;

    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= activeScan.pages.length
    ) {
      return;
    }

    const nextPages = [
      ...activeScan.pages,
    ];

    [
      nextPages[currentIndex],
      nextPages[nextIndex],
    ] = [
      nextPages[nextIndex],
      nextPages[currentIndex],
    ];

    clearMessages();
    setBusyPageId(pageId);

    try {
      const updated =
        await reorderSmartScanPages(
          activeScan.id,
          nextPages.map(
            (page) => page.id,
          ),
        );

      commitScan(updated);
    } catch (reorderError) {
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "The pages could not be reordered.",
      );
    } finally {
      setBusyPageId(null);
    }
  }

  async function removePage(
    page: SmartScanPage,
  ) {
    if (!activeScan || busyPageId !== null) {
      return;
    }

    if (
      !window.confirm(
        `Delete page ${page.page_number}?`,
      )
    ) {
      return;
    }

    clearMessages();
    setBusyPageId(page.id);

    try {
      const result =
        await deleteSmartScanPage(page.id);

      commitScan(result.scan);

      if (selectedPageId === page.id) {
        setSelectedPageId(
          result.scan.pages[0]?.id ?? null,
        );
      }

      setNotice("Page deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The page could not be deleted.",
      );
    } finally {
      setBusyPageId(null);
    }
  }

  async function askCurrentScan() {
    if (
      !activeScan ||
      asking ||
      !question.trim()
    ) {
      return;
    }

    clearMessages();
    setAsking(true);
    setAnswer("");

    try {
      const response = await askSmartScan(
        activeScan.id,
        question,
      );

      setAnswer(response.answer);
    } catch (askError) {
      setError(
        askError instanceof Error
          ? askError.message
          : "StudySnap could not answer from this scan.",
      );
    } finally {
      setAsking(false);
    }
  }

  async function openPdf() {
    if (!activeScan || pdfBusy) return;

    clearMessages();
    setPdfBusy("open");

    const popup = window.open(
      "",
      "_blank",
    );

    try {
      const objectUrl =
        await getSmartScanPdfBlobUrl(
          activeScan.id,
        );

      if (popup) {
        popup.location.href = objectUrl;
      } else {
        const link =
          document.createElement("a");

        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      window.setTimeout(
        () => URL.revokeObjectURL(objectUrl),
        60_000,
      );
    } catch (pdfError) {
      popup?.close();

      setError(
        pdfError instanceof Error
          ? pdfError.message
          : "The PDF could not be opened.",
      );
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadPdf() {
    if (!activeScan || pdfBusy) return;

    clearMessages();
    setPdfBusy("download");

    try {
      await downloadSmartScanPdf(
        activeScan.id,
        activeScan.pdf_filename ||
          `studysnap-scan-${activeScan.id}.pdf`,
      );

      setNotice("PDF download started.");
    } catch (pdfError) {
      setError(
        pdfError instanceof Error
          ? pdfError.message
          : "The PDF could not be downloaded.",
      );
    } finally {
      setPdfBusy(null);
    }
  }

  async function removeScan() {
    if (!activeScan) return;

    if (
      !window.confirm(
        `Delete “${activeScan.title}” and all of its pages?`,
      )
    ) {
      return;
    }

    clearMessages();

    try {
      await deleteSmartScan(activeScan.id);

      const remaining = scans.filter(
        (scan) =>
          scan.id !== activeScan.id,
      );

      setScans(remaining);
      setActiveScan(null);
      setSelectedPageId(null);
      setTitleDraft("");
      setQuestion("");
      setAnswer("");

      if (remaining[0]) {
        const next = await getSmartScan(
          remaining[0].id,
        );

        setActiveScan(next);
        setTitleDraft(next.title);
        setSelectedPageId(
          next.pages[0]?.id ?? null,
        );
      }

      setNotice("Smart Scan deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The scan could not be deleted.",
      );
    }
  }

  if (!loaded) {
    return (
      <section className="rounded-2xl border border-white/[0.075] bg-white/[0.025] p-8 text-center">
        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-[#c9ad50] border-t-transparent" />

        <p className="mt-4 text-sm font-black text-white">
          Opening Smart Scan...
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="studysnap-glass-panel overflow-hidden rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(18,24,30,0.84),rgba(4,7,10,0.74))] shadow-[0_20px_55px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
        <div className="h-px bg-white/[0.08]" />

        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#c9ad50]/20 bg-[#c9ad50]/10 text-lg font-black text-[#dfce8c]">
              S
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c9ad50]">
                Scan → Review → Learn
              </p>

              <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
                Turn photos into searchable study material
              </h1>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Add up to 50 image pages, check their
                order, let StudySnap read them, ask
                questions, and create a searchable PDF.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={newScanRoomId ?? ""}
              onChange={(event) => {
                const roomId = Number(
                  event.target.value,
                );

                setNewScanRoomId(
                  Number.isFinite(roomId) &&
                    roomId > 0
                    ? roomId
                    : null,
                );
              }}
              aria-label="Room for new scan"
              className="min-h-11 rounded-xl border border-white/[0.09] bg-[#0b0f13] px-3 text-sm font-bold text-slate-200 outline-none focus:border-[#c9ad50]/35"
            >
              <option value="">
                No study room
              </option>

              {rooms.map((room) => (
                <option
                  key={room.id}
                  value={room.id}
                >
                  {room.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() =>
                void createNewScan()
              }
              disabled={creating}
              className="min-h-11 rounded-xl bg-[#c9ad50] px-4 py-2.5 text-sm font-black text-[#111317] transition hover:bg-[#d5bb63] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating
                ? "Creating..."
                : "New scan"}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-[#c9ad50]/20 bg-[#c9ad50]/[0.07] px-4 py-3 text-sm font-bold text-[#e2d28d]"
        >
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(17,22,27,0.94),rgba(4,7,10,0.92))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <div>
              <p className="text-sm font-black text-white">
                Recent scans
              </p>

              <p className="mt-1 text-[10px] text-slate-500">
                {scans.length} saved
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void createNewScan()
              }
              disabled={creating}
              aria-label="Create new scan"
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#c9ad50]/20 bg-[#c9ad50]/10 text-lg font-black text-[#dfce8c] transition hover:bg-[#c9ad50]/15 disabled:opacity-40"
            >
              +
            </button>
          </div>

          {scans.length ? (
            <div className="studysnap-scroll max-h-[42rem] space-y-2 overflow-y-auto pr-1">
              {scans.map((scan) => {
                const active =
                  activeScan?.id === scan.id;

                return (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() =>
                      void openScan(scan.id)
                    }
                    disabled={
                      loadingScanId !== null
                    }
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-[#c9ad50]/30 bg-[#c9ad50]/[0.08]"
                        : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-xs font-black ${
                          active
                            ? "border-[#c9ad50]/20 bg-[#c9ad50]/10 text-[#dfce8c]"
                            : "border-white/[0.07] bg-black/20 text-slate-400"
                        }`}
                      >
                        {scan.page_count}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-white">
                          {scan.title}
                        </span>

                        <span className="mt-1 block text-[10px] text-slate-500">
                          {formatDate(
                            scan.updated_at ||
                              scan.created_at,
                          )}
                        </span>
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-500">
                        {scan.page_count} / 50 pages
                      </span>

                      <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-300">
                        {scanStatusLabel(scan)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.09] bg-white/[0.025] p-5 text-center">
              <p className="text-sm font-black text-white">
                No scans yet
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Create a scan and add your first page.
              </p>
            </div>
          )}
        </aside>

        <main className="min-w-0">
          {activeScan ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(17,22,27,0.94),rgba(4,7,10,0.92))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)] sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={titleDraft}
                        onChange={(event) =>
                          setTitleDraft(
                            event.target.value,
                          )
                        }
                        maxLength={120}
                        aria-label="Scan title"
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-black/25 px-3 text-base font-black text-white outline-none focus:border-[#c9ad50]/35"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          void saveTitle()
                        }
                        disabled={
                          savingTitle ||
                          !titleDraft.trim() ||
                          titleDraft.trim() ===
                            activeScan.title
                        }
                        className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 text-xs font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {savingTitle
                          ? "Saving..."
                          : "Save title"}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-slate-300">
                        {activeScan.page_count} / 50 pages
                      </span>

                      <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.07] px-2.5 py-1 text-emerald-200">
                        {readablePages} read
                      </span>

                      {failedPages > 0 ? (
                        <span className="rounded-full border border-red-300/15 bg-red-400/[0.07] px-2.5 py-1 text-red-200">
                          {failedPages} need review
                        </span>
                      ) : null}

                      {activeRoomName ? (
                        <span className="rounded-full border border-[#c9ad50]/15 bg-[#c9ad50]/[0.06] px-2.5 py-1 text-[#daca87]">
                          {activeRoomName}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        photoInputRef.current?.click()
                      }
                      disabled={
                        uploading ||
                        recognizing ||
                        activeScan.page_count >=
                          MAX_SCAN_PAGES
                      }
                      className="min-h-10 rounded-xl bg-[#c9ad50] px-4 py-2 text-xs font-black text-[#111317] transition hover:bg-[#d5bb63] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add photos
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        cameraInputRef.current?.click()
                      }
                      disabled={
                        uploading ||
                        recognizing ||
                        activeScan.page_count >=
                          MAX_SCAN_PAGES
                      }
                      className="min-h-10 rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Camera
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void runRecognition(null)
                      }
                      disabled={
                        recognizing ||
                        uploading ||
                        activeScan.page_count === 0
                      }
                      className="min-h-10 rounded-xl border border-[#c9ad50]/20 bg-[#c9ad50]/[0.07] px-4 py-2 text-xs font-black text-[#dfce8c] transition hover:bg-[#c9ad50]/12 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {recognizing
                        ? "Reading..."
                        : "Read all"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void removeScan()
                      }
                      className="min-h-10 rounded-xl border border-red-300/15 bg-red-400/[0.05] px-3 py-2 text-xs font-black text-red-200 transition hover:bg-red-400/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <input
                  ref={photoInputRef}
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={handlePhotoInput}
                />

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoInput}
                />

                {uploading ? (
                  <div className="mt-4 rounded-xl border border-[#c9ad50]/15 bg-[#c9ad50]/[0.055] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black text-[#e0d18d]">
                        Uploading pages
                      </p>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-[#e0d18d]">
                          {uploadProgress}%
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            uploadController?.abort()
                          }
                          className="rounded-lg border border-red-300/15 bg-red-400/10 px-2.5 py-1 text-[10px] font-black text-red-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#c9ad50] transition-[width]"
                        style={{
                          width: `${uploadProgress}%`,
                        }}
                      />
                    </div>

                    <p className="mt-2 text-[10px] leading-4 text-slate-500">
                      This percentage shows upload transfer
                      only. Page reading begins separately.
                    </p>
                  </div>
                ) : null}

                {recognizing ? (
                  <div
                    aria-live="polite"
                    className="mt-4 rounded-xl border border-[#c9ad50]/15 bg-[#c9ad50]/[0.055] px-3 py-3 text-xs font-bold text-[#e0d18d]"
                  >
                    {recognitionMessage ||
                      "StudySnap is reading pages..."}
                  </div>
                ) : null}
              </section>

              <div className="grid min-w-0 gap-4 2xl:grid-cols-[18rem_minmax(0,1fr)]">
                <section className="rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(17,22,27,0.94),rgba(4,7,10,0.92))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
                  <div className="flex items-center justify-between gap-3 px-1 pb-3">
                    <div>
                      <h2 className="text-sm font-black text-white">
                        Pages
                      </h2>

                      <p className="mt-1 text-[10px] text-slate-500">
                        Select, rotate, move or remove
                      </p>
                    </div>

                    {selectedPage ? (
                      <button
                        type="button"
                        onClick={() =>
                          void runRecognition([
                            selectedPage.id,
                          ])
                        }
                        disabled={
                          recognizing ||
                          uploading
                        }
                        className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-35"
                      >
                        Read selected
                      </button>
                    ) : null}
                  </div>

                  <SmartScanPageRail
                    pages={activeScan.pages}
                    selectedPageId={selectedPageId}
                    busyPageId={busyPageId}
                    onSelect={setSelectedPageId}
                    onRotate={(page) =>
                      void rotatePage(page)
                    }
                    onMove={(pageId, direction) =>
                      void movePage(
                        pageId,
                        direction,
                      )
                    }
                    onDelete={(page) =>
                      void removePage(page)
                    }
                  />
                </section>

                <div className="min-w-0 space-y-4">
                  <section className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,rgba(17,22,27,0.94),rgba(4,7,10,0.92))] shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
                    <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-sm font-black text-white">
                          Review
                        </h2>

                        <p className="mt-1 text-[10px] text-slate-500">
                          Confirm the image and recognized text
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void openPdf()
                          }
                          disabled={
                            pdfBusy !== null ||
                            activeScan.page_count === 0
                          }
                          className="min-h-9 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-35"
                        >
                          {pdfBusy === "open"
                            ? "Opening..."
                            : "Open PDF"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void downloadPdf()
                          }
                          disabled={
                            pdfBusy !== null ||
                            activeScan.page_count === 0
                          }
                          className="min-h-9 rounded-xl border border-[#c9ad50]/20 bg-[#c9ad50]/[0.07] px-3 text-[10px] font-black text-[#dfce8c] transition hover:bg-[#c9ad50]/12 disabled:opacity-35"
                        >
                          {pdfBusy === "download"
                            ? "Preparing..."
                            : "Download PDF"}
                        </button>
                      </div>
                    </div>

                    {selectedPage ? (
                      <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                        <div className="grid min-h-[24rem] place-items-center overflow-hidden rounded-xl border border-white/[0.07] bg-black/30 p-3">
                          {previewLoading ||
                          previewForPageId !==
                            selectedPage.id ? (
                            <div className="text-center">
                              <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-[#c9ad50] border-t-transparent" />

                              <p className="mt-3 text-xs font-bold text-slate-400">
                                Opening page...
                              </p>
                            </div>
                          ) : previewError ? (
                            <p className="max-w-sm text-center text-sm font-bold leading-6 text-red-200">
                              {previewError}
                            </p>
                          ) : previewUrl ? (
                            <Image
                              src={previewUrl}
                              alt={`Page ${selectedPage.page_number}`}
                              width={Math.max(
                                selectedPage.width,
                                1,
                              )}
                              height={Math.max(
                                selectedPage.height,
                                1,
                              )}
                              unoptimized
                              className="max-h-[44rem] h-auto max-w-full w-auto object-contain transition-transform duration-200"
                              style={{
                                transform: `rotate(${selectedPage.rotation}deg)`,
                              }}
                            />
                          ) : (
                            <p className="text-sm text-slate-500">
                              Preview unavailable
                            </p>
                          )}
                        </div>

                        <div className="min-w-0 space-y-3">
                          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                              Page {selectedPage.page_number}
                            </p>

                            <p className="mt-2 truncate text-sm font-black text-white">
                              {selectedPage.original_filename}
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                              <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-slate-300">
                                Rotation {selectedPage.rotation}°
                              </span>

                              {typeof selectedPage.ocr_confidence ===
                              "number" ? (
                                <span className="rounded-full border border-[#c9ad50]/15 bg-[#c9ad50]/[0.06] px-2 py-1 text-[#daca87]">
                                  Confidence{" "}
                                  {selectedPage.ocr_confidence}%
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {selectedPage.ocr_error ? (
                            <div className="rounded-xl border border-red-300/20 bg-red-400/10 p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-200">
                                Reading warning
                              </p>

                              <p className="mt-2 text-xs leading-5 text-red-100">
                                {selectedPage.ocr_error}
                              </p>
                            </div>
                          ) : null}

                          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                              Recognized text
                            </p>

                            {selectedPage.extracted_text.trim() ? (
                              <div className="studysnap-scroll mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-200">
                                {selectedPage.extracted_text}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs leading-5 text-slate-500">
                                This page has not been read
                                successfully yet.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-xl">
                          ▧
                        </div>

                        <p className="mt-4 text-sm font-black text-white">
                          Select a page
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Its preview and recognized text
                          will appear here.
                        </p>
                      </div>
                    )}
                  </section>

                  <SmartScanAskPanel
                    question={question}
                    answer={answer}
                    asking={asking}
                    disabled={!canAsk}
                    disabledReason={
                      activeScan.page_count === 0
                        ? "Add pages before asking questions."
                        : "Read at least one page successfully before asking questions."
                    }
                    onQuestionChange={setQuestion}
                    onAsk={() =>
                      void askCurrentScan()
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <section className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.025] p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#c9ad50]/20 bg-[#c9ad50]/10 text-2xl text-[#dfce8c]">
                ▧
              </div>

              <h2 className="mt-4 text-lg font-black text-white">
                Create your first Smart Scan
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Keep related pages together, check their
                order, and review recognition warnings
                before studying from them.
              </p>

              <button
                type="button"
                onClick={() =>
                  void createNewScan()
                }
                disabled={creating}
                className="mt-5 min-h-11 rounded-xl bg-[#c9ad50] px-5 py-2.5 text-sm font-black text-[#111317] transition hover:bg-[#d5bb63] disabled:opacity-40"
              >
                {creating
                  ? "Creating..."
                  : "Create scan"}
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
