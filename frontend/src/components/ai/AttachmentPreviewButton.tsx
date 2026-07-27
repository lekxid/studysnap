"use client";

import Image from "next/image";
import {
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type ViewerItem = {
  src: string;
  name: string;
  key: string;
};

type Props = {
  src: string;
  name: string;
  groupId: string;
  variant?:
    | "composer"
    | "message"
    | "generated";
  className?: string;
};

function safeFileName(
  value: string
): string {
  const clean = value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return clean || "studysnap-image.png";
}

function collectViewerItems(
  groupId: string
): ViewerItem[] {
  const escaped =
    typeof CSS !== "undefined" &&
    typeof CSS.escape === "function"
      ? CSS.escape(groupId)
      : groupId.replace(
          /["\\]/g,
          "\\$&"
        );

  const elements =
    document.querySelectorAll<HTMLButtonElement>(
      `[data-studysnap-attachment-group="${escaped}"]`
    );

  return Array.from(elements)
    .map((element) => ({
      src:
        element.dataset
          .studysnapAttachmentSrc || "",
      name:
        element.dataset
          .studysnapAttachmentName ||
        "StudySnap image",
      key:
        element.dataset
          .studysnapAttachmentKey ||
        element.dataset
          .studysnapAttachmentSrc ||
        "",
    }))
    .filter(
      (item) => Boolean(item.src)
    );
}

async function downloadViewerItem(
  item: ViewerItem
): Promise<void> {
  const anchor =
    document.createElement("a");

  try {
    const response = await fetch(
      item.src,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        "Image download failed."
      );
    }

    const blob =
      await response.blob();

    if (!blob.size) {
      throw new Error(
        "The image was empty."
      );
    }

    const objectUrl =
      URL.createObjectURL(blob);

    anchor.href = objectUrl;
    anchor.download =
      safeFileName(item.name);
    anchor.rel =
      "noopener noreferrer";
    anchor.style.display = "none";

    document.body.appendChild(
      anchor
    );
    anchor.click();
    anchor.remove();

    window.setTimeout(
      () =>
        URL.revokeObjectURL(
          objectUrl
        ),
      1500
    );
  } catch {
    anchor.href = item.src;
    anchor.download =
      safeFileName(item.name);
    anchor.rel =
      "noopener noreferrer";
    anchor.target = "_blank";
    anchor.style.display = "none";

    document.body.appendChild(
      anchor
    );
    anchor.click();
    anchor.remove();
  }
}

export default function AttachmentPreviewButton({
  src,
  name,
  groupId,
  variant = "message",
  className = "",
}: Props) {
  const [items, setItems] =
    useState<ViewerItem[]>([]);
  const [activeIndex, setActiveIndex] =
    useState(0);
  const [open, setOpen] =
    useState(false);
  const pushedHistoryRef =
    useRef(false);

  const touchStartRef =
    useRef<{
      x: number;
      y: number;
    } | null>(null);

  const activeItem =
    items[activeIndex] || null;

  function closeViewer(
    useBrowserHistory = true
  ) {
    if (
      useBrowserHistory &&
      pushedHistoryRef.current
    ) {
      pushedHistoryRef.current =
        false;
      window.history.back();
      return;
    }

    pushedHistoryRef.current =
      false;
    setOpen(false);
  }

  function move(
    direction: -1 | 1
  ) {
    setActiveIndex(
      (current) => {
        if (items.length <= 1) {
          return current;
        }

        return (
          current +
          direction +
          items.length
        ) % items.length;
      }
    );
  }

  function handleViewerTouchStart(
    event:
      ReactTouchEvent<HTMLDivElement>
  ) {
    const touch =
      event.changedTouches[0];

    if (!touch) {
      return;
    }

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function handleViewerTouchEnd(
    event:
      ReactTouchEvent<HTMLDivElement>
  ) {
    const start =
      touchStartRef.current;

    const touch =
      event.changedTouches[0];

    touchStartRef.current = null;

    if (
      !start ||
      !touch ||
      items.length <= 1
    ) {
      return;
    }

    const deltaX =
      touch.clientX - start.x;

    const deltaY =
      touch.clientY - start.y;

    if (
      Math.abs(deltaX) < 48 ||
      Math.abs(deltaX) <=
        Math.abs(deltaY)
    ) {
      return;
    }

    move(
      deltaX < 0 ? 1 : -1
    );
  }


  function openViewer() {
    const nextItems =
      collectViewerItems(
        groupId
      );

    const fallback: ViewerItem = {
      src,
      name,
      key: `${groupId}:${src}`,
    };

    const usableItems =
      nextItems.length
        ? nextItems
        : [fallback];

    const index =
      usableItems.findIndex(
        (item) =>
          item.src === src &&
          item.name === name
      );

    setItems(usableItems);
    setActiveIndex(
      index >= 0 ? index : 0
    );
    setOpen(true);

    window.history.pushState(
      {
        studysnapAttachmentViewer:
          true,
      },
      "",
      window.location.href
    );

    pushedHistoryRef.current =
      true;
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function shift(
      direction: -1 | 1
    ) {
      setActiveIndex(
        (current) => {
          if (items.length <= 1) {
            return current;
          }

          return (
            current +
            direction +
            items.length
          ) % items.length;
        }
      );
    }

    function onKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        event.preventDefault();

        if (
          pushedHistoryRef.current
        ) {
          pushedHistoryRef.current =
            false;
          window.history.back();
        } else {
          setOpen(false);
        }

        return;
      }

      if (
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        shift(-1);
        return;
      }

      if (
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        shift(1);
      }
    }

    function onPopState() {
      pushedHistoryRef.current =
        false;
      setOpen(false);
    }

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    window.addEventListener(
      "popstate",
      onPopState
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        onKeyDown
      );

      window.removeEventListener(
        "popstate",
        onPopState
      );
    };
  }, [
    items.length,
    open,
  ]);

  const shellClass =
    variant === "composer"
      ? (
          "relative h-9 w-9 shrink-0 "
          + "overflow-hidden rounded-lg "
          + "border border-white/[0.10] "
          + "bg-black/30"
        )
      : variant === "generated"
        ? (
            "relative mb-3 block "
            + "aspect-[4/3] w-full "
            + "max-w-[32rem] "
            + "overflow-hidden "
            + "rounded-2xl border "
            + "border-white/[0.10] "
            + "bg-black/35"
          )
        : (
            "relative block "
            + "aspect-[4/3] w-full "
            + "max-w-[13rem] "
            + "overflow-hidden "
            + "rounded-xl border "
            + "border-white/[0.10] "
            + "bg-black/35 "
            + "sm:max-w-[16rem]"
          );

  const previewSizes =
    variant === "composer"
      ? "36px"
      : variant === "generated"
        ? (
            "(max-width: 640px) "
            + "92vw, 32rem"
          )
        : (
            "(max-width: 640px) "
            + "13rem, 16rem"
          );

  const viewer = (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/[0.96] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${activeItem?.name || name}`}
    >
      <header className="flex min-h-14 items-center gap-2 border-b border-white/[0.10] px-3 py-2 sm:px-5">
        <p
          className="min-w-0 flex-1 truncate text-sm font-bold"
          title={
            activeItem?.name || name
          }
        >
          {activeItem?.name || name}
        </p>

        {items.length > 1 ? (
          <span className="shrink-0 text-xs text-zinc-400">
            {activeIndex + 1} /{" "}
            {items.length}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (activeItem) {
              void downloadViewerItem(
                activeItem
              );
            }
          }}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-lg transition hover:bg-white/[0.12]"
          aria-label="Download image"
          title="Download"
        >
          ↓
        </button>

        <button
          type="button"
          onClick={() =>
            closeViewer()
          }
          className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-xl transition hover:bg-white/[0.12]"
          aria-label="Close image viewer"
          title="Close"
        >
          ×
        </button>
      </header>

      <div
        className="relative min-h-0 flex-1 touch-pan-y"
        onTouchStart={
          handleViewerTouchStart
        }
        onTouchEnd={
          handleViewerTouchEnd
        }
      >
        {activeItem ? (
          <Image
            src={activeItem.src}
            alt={activeItem.name}
            fill
            unoptimized
            priority
            sizes="100vw"
            className="select-none object-contain p-3 sm:p-6"
          />
        ) : null}

        {items.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/[0.14] bg-black/65 text-2xl backdrop-blur transition hover:bg-black/85 sm:left-5"
              aria-label="Previous attachment"
              title="Previous"
            >
              ‹
            </button>

            <button
              type="button"
              onClick={() => move(1)}
              className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/[0.14] bg-black/65 text-2xl backdrop-blur transition hover:bg-black/85 sm:right-5"
              aria-label="Next attachment"
              title="Next"
            >
              ›
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openViewer}
        className={`${shellClass} ${className}`.trim()}
        data-studysnap-attachment-group={
          groupId
        }
        data-studysnap-attachment-src={
          src
        }
        data-studysnap-attachment-name={
          name
        }
        data-studysnap-attachment-key={
          `${groupId}:${name}:${src}`
        }
        aria-label={`Open ${name}`}
        title={name}
      >
        <Image
          src={src}
          alt={name}
          fill
          unoptimized
          sizes={previewSizes}
          className="object-contain"
        />

        <span className="sr-only">
          Open attachment
        </span>
      </button>

      {open && activeItem
        ? createPortal(
            viewer,
            document.body
          )
        : null}
    </>
  );
}
