let pendingAttachment: File | null = null;

export function setPendingAIAttachment(
  file: File,
): void {
  pendingAttachment = file;
}

export function takePendingAIAttachment():
  | File
  | null {
  const file = pendingAttachment;
  pendingAttachment = null;
  return file;
}
