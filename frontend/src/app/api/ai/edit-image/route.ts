import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function backendBase() {
  return (
    process.env.STUDYSNAP_BACKEND_INTERNAL_URL ||
    process.env.BACKEND_INTERNAL_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");
}

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * Buffer the multipart upload before
     * forwarding it to FastAPI. The browser
     * connection no longer acts as the backend
     * request stream during the complete edit.
     */
    const requestBody =
      await request.arrayBuffer();

    const headers =
      new Headers();

    const authorization =
      request.headers.get(
        "authorization"
      );

    const contentType =
      request.headers.get(
        "content-type"
      );

    if (authorization) {
      headers.set(
        "authorization",
        authorization
      );
    }

    if (contentType) {
      headers.set(
        "content-type",
        contentType
      );
    }

    const backendResponse =
      await fetch(
        `${backendBase()}/api/ai/edit-image`,
        {
          method: "POST",
          headers,
          body: requestBody,
          cache: "no-store",
        }
      );

    /*
     * Receive the complete backend result before
     * returning it to the browser. This prevents
     * failure from a chained response stream.
     */
    const responseBody =
      await backendResponse.arrayBuffer();

    const responseHeaders =
      new Headers();

    const responseType =
      backendResponse.headers.get(
        "content-type"
      );

    if (responseType) {
      responseHeaders.set(
        "content-type",
        responseType
      );
    }

    responseHeaders.set(
      "cache-control",
      "no-store, max-age=0"
    );

    return new Response(
      responseBody,
      {
        status:
          backendResponse.status,
        headers:
          responseHeaders,
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : (
            "The image service "
            + "could not be reached."
          );

    console.error(
      "StudySnap image route failed:",
      error
    );

    return Response.json(
      {
        detail:
          "Image request failed: "
          + message,
      },
      {
        status: 502,
        headers: {
          "cache-control":
            "no-store, max-age=0",
        },
      }
    );
  }
}
