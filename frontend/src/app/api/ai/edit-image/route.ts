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
    const body =
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

    const response =
      await fetch(
        `${backendBase()}/api/ai/edit-image`,
        {
          method: "POST",
          headers,
          body,
          cache: "no-store",
        }
      );

    const responseHeaders =
      new Headers();

    const responseType =
      response.headers.get(
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
      "no-store"
    );

    return new Response(
      response.body,
      {
        status:
          response.status,
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

    return Response.json(
      {
        detail:
          "Image request failed: "
          + message,
      },
      {
        status: 502,
      }
    );
  }
}
