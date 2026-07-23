"use client";

import {
  Fragment,
  useState,
  type ReactNode,
} from "react";


type SimpleMarkdownProps = {
  content: string;
  className?: string;
};


function safeExternalUrl(
  value: string,
): string | null {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}


function splitTrailingPunctuation(
  value: string,
) {
  const match = value.match(
    /^(.*?)([.,;:!?\])}]+)?$/,
  );

  return {
    url: match?.[1] || value,
    trailing: match?.[2] || "",
  };
}


function renderInline(
  text: string,
  keyPrefix: string,
): ReactNode[] {
  const tokenPattern =
    /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+|`[^`\n]+`|\*\*[^*\n]+\*\*)/g;

  const output: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while (
    (
      match =
        tokenPattern.exec(text)
    ) !== null
  ) {
    if (match.index > cursor) {
      output.push(
        text.slice(
          cursor,
          match.index,
        ),
      );
    }

    const token = match[0];
    const key =
      `${keyPrefix}-${tokenIndex}`;

    tokenIndex += 1;

    const markdownLink =
      token.match(
        /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/,
      );

    if (markdownLink) {
      const href = safeExternalUrl(
        markdownLink[2],
      );

      if (href) {
        output.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words font-bold text-[#e0cf79] underline decoration-[#c9ad50]/45 underline-offset-4 transition hover:text-[#f3e7a7] hover:decoration-[#e0cf79]"
            title={`Open ${href}`}
          >
            {markdownLink[1]}
            <span
              aria-hidden="true"
              className="ml-1 text-[0.78em]"
            >
              ↗
            </span>
          </a>,
        );
      } else {
        output.push(token);
      }

      cursor =
        match.index + token.length;

      continue;
    }

    if (
      token.startsWith(
        "http://",
      ) ||
      token.startsWith(
        "https://",
      )
    ) {
      const {
        url,
        trailing,
      } = splitTrailingPunctuation(
        token,
      );

      const href =
        safeExternalUrl(url);

      if (href) {
        let label = href;

        try {
          label = new URL(
            href
          ).hostname.replace(
            /^www\./,
            "",
          );
        } catch {
          label = href;
        }

        output.push(
          <Fragment key={key}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-bold text-[#e0cf79] underline decoration-[#c9ad50]/45 underline-offset-4 transition hover:text-[#f3e7a7] hover:decoration-[#e0cf79]"
              title={`Open ${href}`}
            >
              {label}
              <span
                aria-hidden="true"
                className="ml-1 text-[0.78em]"
              >
                ↗
              </span>
            </a>
            {trailing}
          </Fragment>,
        );
      } else {
        output.push(token);
      }

      cursor =
        match.index + token.length;

      continue;
    }

    if (
      token.startsWith("`") &&
      token.endsWith("`")
    ) {
      output.push(
        <code
          key={key}
          className="rounded-md border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-200"
        >
          {token.slice(1, -1)}
        </code>,
      );

      cursor =
        match.index + token.length;

      continue;
    }

    if (
      token.startsWith("**") &&
      token.endsWith("**")
    ) {
      output.push(
        <strong
          key={key}
          className="font-black text-zinc-100"
        >
          {token.slice(2, -2)}
        </strong>,
      );

      cursor =
        match.index + token.length;

      continue;
    }

    output.push(token);

    cursor =
      match.index + token.length;
  }

  if (cursor < text.length) {
    output.push(
      text.slice(cursor),
    );
  }

  return output;
}



async function copyCodeText(
  text: string,
) {
  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(
      text,
    );

    return;
  }

  const textarea =
    document.createElement(
      "textarea",
    );

  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.setAttribute(
    "readonly",
    "",
  );

  document.body.appendChild(
    textarea,
  );

  textarea.select();

  const copied =
    document.execCommand(
      "copy",
    );

  document.body.removeChild(
    textarea,
  );

  if (!copied) {
    throw new Error(
      "Copy failed.",
    );
  }
}


function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [
    copyState,
    setCopyState,
  ] = useState<
    "idle" | "copied" | "failed"
  >("idle");

  async function handleCopy() {
    try {
      await copyCodeText(code);

      setCopyState(
        "copied",
      );

      window.setTimeout(
        () =>
          setCopyState(
            "idle",
          ),
        1500,
      );
    } catch {
      setCopyState(
        "failed",
      );

      window.setTimeout(
        () =>
          setCopyState(
            "idle",
          ),
        1800,
      );
    }
  }

  return (
    <div className="my-3 max-w-full overflow-hidden rounded-xl border border-white/[0.09] bg-[#0d0d0d]">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.07] bg-[#111111] px-3 py-2">
        <span className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
          {language || "Code"}
        </span>

        <button
          type="button"
          onClick={() =>
            void handleCopy()
          }
          className="min-h-9 shrink-0 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 text-xs font-bold text-zinc-200 transition hover:border-[#c9ad50]/35 hover:bg-[#c9ad50]/10 hover:text-[#eadf9f]"
          aria-live="polite"
          title="Copy this code block"
        >
          {copyState === "copied"
            ? "Copied ✓"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy code"}
        </button>
      </div>

      <pre className="max-w-full overflow-x-auto p-3 pt-4 text-xs leading-6 text-zinc-200">
        <code>
          {code}
        </code>
      </pre>
    </div>
  );
}


function isSpecialBlockStart(
  line: string,
) {
  return (
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^```/.test(line)
  );
}


function renderBlocks(
  content: string,
): ReactNode[] {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n");

  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const language =
        line.slice(3).trim();

      const codeLines: string[] = [];

      index += 1;

      while (
        index < lines.length &&
        !/^```/.test(
          lines[index]
        )
      ) {
        codeLines.push(
          lines[index],
        );

        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        <CodeBlock
          key={`code-${blockIndex}`}
          language={language}
          code={codeLines.join("\n")}
        />,
      );

      blockIndex += 1;
      continue;
    }

    const heading =
      line.match(
        /^(#{1,3})\s+(.+)$/,
      );

    if (heading) {
      const level =
        heading[1].length;

      if (level === 1) {
        blocks.push(
          <h2
            key={`heading-${blockIndex}`}
            className="mb-2 mt-5 text-xl font-black tracking-tight text-zinc-100"
          >
            {renderInline(
              heading[2],
              `heading-${blockIndex}`,
            )}
          </h2>,
        );
      } else if (level === 2) {
        blocks.push(
          <h3
            key={`heading-${blockIndex}`}
            className="mb-2 mt-4 text-lg font-black tracking-tight text-zinc-100"
          >
            {renderInline(
              heading[2],
              `heading-${blockIndex}`,
            )}
          </h3>,
        );
      } else {
        blocks.push(
          <h4
            key={`heading-${blockIndex}`}
            className="mb-1.5 mt-3 text-base font-black tracking-tight text-zinc-100"
          >
            {renderInline(
              heading[2],
              `heading-${blockIndex}`,
            )}
          </h4>,
        );
      }

      blockIndex += 1;
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch =
          lines[index].match(
            /^[-*]\s+(.+)$/,
          );

        if (!itemMatch) {
          break;
        }

        const itemLines = [
          itemMatch[1],
        ];

        index += 1;

        while (
          index < lines.length &&
          lines[index].trim() &&
          !isSpecialBlockStart(
            lines[index],
          )
        ) {
          itemLines.push(
            lines[index].trim(),
          );

          index += 1;
        }

        items.push(
          itemLines.join(" ").trim(),
        );

        let nextIndex = index;

        while (
          nextIndex < lines.length &&
          !lines[nextIndex].trim()
        ) {
          nextIndex += 1;
        }

        if (
          nextIndex < lines.length &&
          /^[-*]\s+/.test(
            lines[nextIndex],
          )
        ) {
          index = nextIndex;
          continue;
        }

        break;
      }

      blocks.push(
        <ul
          key={`list-${blockIndex}`}
          className="my-3 max-w-full space-y-2 pl-6 pr-1"
        >
          {items.map(
            (item, itemIndex) => (
              <li
                key={`list-${blockIndex}-${itemIndex}`}
                className="min-w-0 list-disc break-words pl-1 marker:text-[#c9ad50]"
              >
                {renderInline(
                  item,
                  `list-${blockIndex}-${itemIndex}`,
                )}
              </li>
            ),
          )}
        </ul>,
      );

      blockIndex += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];

      const firstNumberMatch =
        line.match(
          /^(\d+)\.\s+/,
        );

      const firstNumber =
        firstNumberMatch
          ? Number.parseInt(
              firstNumberMatch[1],
              10,
            )
          : 1;

      while (index < lines.length) {
        const itemMatch =
          lines[index].match(
            /^\d+\.\s+(.+)$/,
          );

        if (!itemMatch) {
          break;
        }

        const itemLines = [
          itemMatch[1],
        ];

        index += 1;

        while (
          index < lines.length &&
          lines[index].trim() &&
          !isSpecialBlockStart(
            lines[index],
          )
        ) {
          itemLines.push(
            lines[index].trim(),
          );

          index += 1;
        }

        items.push(
          itemLines.join(" ").trim(),
        );

        let nextIndex = index;

        while (
          nextIndex < lines.length &&
          !lines[nextIndex].trim()
        ) {
          nextIndex += 1;
        }

        if (
          nextIndex < lines.length &&
          /^\d+\.\s+/.test(
            lines[nextIndex],
          )
        ) {
          index = nextIndex;
          continue;
        }

        break;
      }

      blocks.push(
        <ol
          start={firstNumber}
          key={`ordered-${blockIndex}`}
          className="my-3 max-w-full space-y-2 pl-7 pr-1"
        >
          {items.map(
            (item, itemIndex) => (
              <li
                key={`ordered-${blockIndex}-${itemIndex}`}
                className="min-w-0 list-decimal break-words pl-1 marker:font-black marker:text-[#c9ad50]"
              >
                {renderInline(
                  item,
                  `ordered-${blockIndex}-${itemIndex}`,
                )}
              </li>
            ),
          )}
        </ol>,
      );

      blockIndex += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (
        index < lines.length &&
        /^>\s?/.test(
          lines[index]
        )
      ) {
        quoteLines.push(
          lines[index].replace(
            /^>\s?/,
            "",
          ),
        );

        index += 1;
      }

      blocks.push(
        <blockquote
          key={`quote-${blockIndex}`}
          className="my-3 max-w-full break-words border-l-2 border-[#c9ad50]/55 pl-3 text-zinc-400"
        >
          {renderInline(
            quoteLines.join("\n"),
            `quote-${blockIndex}`,
          )}
        </blockquote>,
      );

      blockIndex += 1;
      continue;
    }

    const paragraphLines = [
      line,
    ];

    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !isSpecialBlockStart(
        lines[index],
      )
    ) {
      paragraphLines.push(
        lines[index],
      );

      index += 1;
    }

    blocks.push(
      <p
        key={`paragraph-${blockIndex}`}
        className="my-2 whitespace-pre-wrap break-words"
      >
        {renderInline(
          paragraphLines.join("\n"),
          `paragraph-${blockIndex}`,
        )}
      </p>,
    );

    blockIndex += 1;
  }

  return blocks;
}


export default function SimpleMarkdown({
  content,
  className = "",
}: SimpleMarkdownProps) {
  return (
    <div
      className={`min-w-0 break-words text-zinc-200 ${className}`}
    >
      {renderBlocks(content)}
    </div>
  );
}
