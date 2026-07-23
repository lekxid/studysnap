"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  downloadArtifactFile,
  getArtifactAccessUrl,
  getArtifactsForMessage,
  type StudySnapArtifact,
} from "@/lib/api";


type Props = {
  messageId: number;
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "Ready";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(
    value
    / (1024 * 1024)
  ).toFixed(1)} MB`;
}

function fileLabel(
  artifact: StudySnapArtifact
): string {
  const extension =
    artifact.filename
      .split(".")
      .pop()
      ?.toUpperCase();

  return extension || "FILE";
}

export default function ArtifactFileCards({
  messageId,
}: Props) {
  const [artifacts, setArtifacts] =
    useState<StudySnapArtifact[]>([]);

  const [busyId, setBusyId] =
    useState<number | null>(null);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let active = true;

    void getArtifactsForMessage(
      messageId
    )
      .then((items) => {
        if (active) {
          setArtifacts(items);
        }
      })
      .catch(() => {
        // Ordinary AI messages have no file card.
      });

    return () => {
      active = false;
    };
  }, [messageId]);

  async function openArtifact(
    artifact: StudySnapArtifact
  ) {
    if (busyId !== null) return;

    const popup = window.open(
      "",
      "_blank"
    );

    if (popup) {
      popup.opener = null;
      popup.document.title =
        "Opening StudySnap file…";
    }

    setBusyId(artifact.id);
    setError("");

    try {
      const url =
        await getArtifactAccessUrl(
          artifact.id,
          true
        );

      if (popup) {
        popup.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (openError) {
      popup?.close();

      setError(
        openError instanceof Error
          ? openError.message
          : "The file could not be opened."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function downloadArtifact(
    artifact: StudySnapArtifact
  ) {
    if (busyId !== null) return;

    setBusyId(artifact.id);
    setError("");

    try {
      await downloadArtifactFile(
        artifact
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "The file could not be downloaded."
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!artifacts.length) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0 max-w-full space-y-2 overflow-hidden">
      {artifacts.map((artifact) => {
        const busy =
          busyId === artifact.id;

        return (
          <div
            key={artifact.id}
            className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d9ca83]/25 bg-[#d9ca83]/10 text-xs font-black text-[#e8dda4]">
                {fileLabel(artifact)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-bold leading-5 text-zinc-100 sm:truncate">
                  {artifact.filename}
                </p>

                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {formatBytes(
                    artifact.file_size
                  )}
                  {" · "}
                  Secure StudySnap file
                </p>
              </div>
            </div>

            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void openArtifact(
                    artifact
                  )
                }
                className="w-full min-w-0 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                Open
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void downloadArtifact(
                    artifact
                  )
                }
                className="w-full min-w-0 rounded-xl bg-[#d9ca83] px-3 py-2 text-xs font-black text-black transition hover:bg-[#eadf9f] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                {busy
                  ? "Preparing…"
                  : "Download"}
              </button>
            </div>
          </div>
        );
      })}

      {error ? (
        <p
          className="text-xs text-red-300"
          role="status"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
