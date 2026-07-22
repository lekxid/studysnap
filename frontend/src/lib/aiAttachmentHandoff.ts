let pendingAttachments: File[] = [];

export function setPendingAIAttachments(
  files: File[],
): void {
  pendingAttachments = files.slice(0, 20);
}

export function takePendingAIAttachments():
  File[] {
  const files = pendingAttachments;
  pendingAttachments = [];
  return files;
}

// Backward-compatible helpers.
export function setPendingAIAttachment(
  file: File,
): void {
  setPendingAIAttachments([file]);
}

export function takePendingAIAttachment():
  | File
  | null {
  return (
    takePendingAIAttachments()[0] ?? null
  );
}
