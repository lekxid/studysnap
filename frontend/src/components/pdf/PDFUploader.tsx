"use client";

import { useRef, useState } from "react";
import { getToken } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";

type PDFUploaderProps = {
  studyRoomId: number;
  onUploaded?: () => void;
};

export default function PDFUploader({
  studyRoomId,
  onUploaded,
}: PDFUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpload() {
    if (!selectedFile) {
      setMessage("Choose a PDF first.");
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      setMessage("Only PDF files are allowed.");
      return;
    }

    const token = getToken();

    if (!token) {
      setMessage("Not authenticated. Please log in again.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setUploading(true);
      setMessage("");

      const response = await fetch(`${API_BASE}/api/pdfs/${studyRoomId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const detail = data?.detail;

        if (typeof detail === "string") {
          throw new Error(detail);
        }

        throw new Error("Upload failed.");
      }

      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setMessage("PDF uploaded successfully.");
      onUploaded?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1022] p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
        Resources
      </p>

      <h3 className="mt-2 text-2xl font-bold text-white">Upload PDF</h3>

      <p className="mt-2 text-sm text-white/60">
        Upload study material for this room.
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-white/20 bg-black/30 p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setSelectedFile(e.target.files?.[0] || null);
            setMessage("");
          }}
          className="w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-white"
        />

        {selectedFile ? (
          <p className="mt-3 text-sm text-cyan-300">{selectedFile.name}</p>
        ) : null}

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black disabled:opacity-60"
        >
          {uploading ? "Uploading..." : "Upload PDF"}
        </button>

        {message ? (
          <div className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-white">
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}