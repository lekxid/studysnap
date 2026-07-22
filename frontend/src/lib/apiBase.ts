function normalizeBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") || "";
}

/**
 * Browser HTTP requests use the explicitly configured public API URL.
 * When it is not configured, requests use Next.js's same-origin
 * /backend rewrite.
 */
export const API_BASE =
  normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) ||
  "/backend";

/**
 * WebSockets cannot reliably use a normal HTTP rewrite on every host.
 * Beta and production deployments should configure
 * NEXT_PUBLIC_WS_BASE_URL or an absolute NEXT_PUBLIC_API_BASE_URL.
 */
export function getWebSocketBaseUrl(): string {
  if (typeof window === "undefined") {
    throw new Error(
      "The realtime connection is only available in the browser."
    );
  }

  const configuredBase =
    normalizeBaseUrl(process.env.NEXT_PUBLIC_WS_BASE_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

  if (configuredBase && !configuredBase.startsWith("/")) {
    return configuredBase
      .replace(/^https:/i, "wss:")
      .replace(/^http:/i, "ws:");
  }

  // Preserve local and VM development without hardcoding a machine IP.
  if (window.location.protocol === "http:") {
    return `ws://${window.location.hostname}:8000`;
  }

  throw new Error(
    "NEXT_PUBLIC_WS_BASE_URL is required for realtime " +
      "Study Together connections in beta and production."
  );
}
