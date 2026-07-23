"use client";

import {
  extractSmartActionLinks,
  type SmartActionKind,
} from "@/lib/smartActionLinks";


function actionIcon(
  kind: SmartActionKind,
) {
  const icons: Record<
    SmartActionKind,
    string
  > = {
    app_store: "A",
    google_play: "▶",
    microsoft_store: "⊞",
    apple_music: "♫",
    spotify: "●",
    youtube: "▷",
    source: "↗",
  };

  return icons[kind];
}


function isPrimaryAction(
  kind: SmartActionKind,
) {
  return kind !== "source";
}


export default function SmartActionLinks({
  content,
}: {
  content: string;
}) {
  const links =
    extractSmartActionLinks(
      content
    );

  if (!links.length) {
    return null;
  }

  const actions =
    links.filter(
      (link) =>
        isPrimaryAction(
          link.kind
        ),
    );

  const sources =
    links.filter(
      (link) =>
        !isPrimaryAction(
          link.kind
        ),
    );

  return (
    <div className="mt-3 space-y-2">
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map(
            (action) => (
              <a
                key={action.href}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  "inline-flex min-h-9 "
                  + "items-center gap-2 "
                  + "rounded-xl border "
                  + "border-[#c9ad50]/22 "
                  + "bg-[#c9ad50]/[0.08] "
                  + "px-3 py-2 text-[11px] "
                  + "font-black text-[#e6da98] "
                  + "transition "
                  + "hover:border-[#c9ad50]/40 "
                  + "hover:bg-[#c9ad50]/[0.13] "
                  + "hover:text-[#f4eab4]"
                }
                title={
                  `Open ${action.href}`
                }
              >
                <span
                  className={
                    "grid h-5 w-5 "
                    + "place-items-center "
                    + "rounded-md "
                    + "bg-black/30 "
                    + "text-[9px]"
                  }
                  aria-hidden="true"
                >
                  {actionIcon(
                    action.kind
                  )}
                </span>

                <span>
                  {action.label}
                </span>

                {action.badge ? (
                  <span
                    className={
                      "rounded-full "
                      + "border border-white/[0.08] "
                      + "bg-white/[0.04] "
                      + "px-1.5 py-0.5 "
                      + "text-[8px] "
                      + "uppercase tracking-wide "
                      + "text-zinc-400"
                    }
                  >
                    {action.badge}
                  </span>
                ) : null}

                <span
                  aria-hidden="true"
                  className="text-[9px]"
                >
                  ↗
                </span>
              </a>
            ),
          )}
        </div>
      ) : null}

      {sources.length > 0 ? (
        <details
          className={
            "overflow-hidden rounded-xl "
            + "border border-white/[0.07] "
            + "bg-white/[0.025]"
          }
        >
          <summary
            className={
              "flex min-h-9 cursor-pointer "
              + "list-none items-center gap-2 "
              + "px-3 text-[10px] "
              + "font-black text-zinc-400 "
              + "[&::-webkit-details-marker]:hidden"
            }
          >
            <span
              aria-hidden="true"
              className="text-[#c9ad50]"
            >
              ◉
            </span>

            <span>
              Sources
            </span>

            <span
              className={
                "rounded-full "
                + "bg-white/[0.05] "
                + "px-1.5 py-0.5 "
                + "text-[8px] "
                + "text-zinc-500"
              }
            >
              {sources.length}
            </span>

            <span
              className={
                "ml-auto text-zinc-600"
              }
              aria-hidden="true"
            >
              ▾
            </span>
          </summary>

          <div
            className={
              "space-y-1 border-t "
              + "border-white/[0.06] "
              + "p-2"
            }
          >
            {sources.map(
              (source) => (
                <a
                  key={source.href}
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    "flex min-h-9 "
                    + "items-center gap-2 "
                    + "rounded-lg px-2.5 "
                    + "text-[10px] "
                    + "font-bold text-zinc-400 "
                    + "transition "
                    + "hover:bg-white/[0.05] "
                    + "hover:text-zinc-200"
                  }
                  title={
                    `Open ${source.href}`
                  }
                >
                  <span
                    className={
                      "grid h-5 w-5 "
                      + "shrink-0 place-items-center "
                      + "rounded-md "
                      + "bg-white/[0.05] "
                      + "text-[9px]"
                    }
                    aria-hidden="true"
                  >
                    ↗
                  </span>

                  <span
                    className={
                      "min-w-0 flex-1 truncate"
                    }
                  >
                    {source.label}
                  </span>

                  <span
                    className={
                      "max-w-32 truncate "
                      + "text-[8px] "
                      + "font-medium text-zinc-600"
                    }
                  >
                    {source.host}
                  </span>
                </a>
              ),
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
