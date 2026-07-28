"use client";

import {
  useState,
} from "react";

import {
  branchAIConversationFromMessage,
  editAndResendAIMessage,
  regenerateAIMessage,
  retryAIMessage,
  type AIMessageActionResponse,
} from "@/lib/api";


type MessageTarget = {
  id: number | string;
  role: string;
  content: string;
};

type ActionName =
  | "edit"
  | "retry"
  | "regenerate"
  | "branch";

function openBranch(
  result: AIMessageActionResponse,
) {
  const params = new URLSearchParams(
    window.location.search,
  );

  params.set(
    "conversationId",
    String(
      result.conversation.id,
    ),
  );

  window.location.assign(
    `/general-ai?${params.toString()}`,
  );
}

function ActionButton({
  label,
  symbol,
  active,
  disabled,
  onClick,
}: {
  label: string;
  symbol: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "grid h-8 w-8 place-items-center",
        "rounded-xl border text-sm",
        "transition",
        "disabled:cursor-wait",
        "disabled:opacity-45",
        active
          ? (
              "border-[#c9ad50]/45 "
              + "bg-[#c9ad50]/15 "
              + "text-[#eadf9f]"
            )
          : (
              "border-white/10 "
              + "bg-white/[0.025] "
              + "text-zinc-400 "
              + "hover:border-[#c9ad50]/35 "
              + "hover:text-[#eadf9f]"
            ),
      ].join(" ")}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-0.5"
        >
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={[
                "h-1 w-1 rounded-full",
                "bg-current animate-bounce",
              ].join(" ")}
              style={{
                animationDelay:
                  `${index * 120}ms`,
                animationDuration:
                  "720ms",
              }}
            />
          ))}
        </span>
      ) : (
        <span aria-hidden="true">
          {symbol}
        </span>
      )}
    </button>
  );
}

export default function GeneralAIMessageActions({
  message,
  conversationId,
}: {
  message: MessageTarget;
  conversationId: number | null;
}) {
  const [
    working,
    setWorking,
  ] = useState<ActionName | null>(
    null,
  );

  const [
    error,
    setError,
  ] = useState("");

  if (
    typeof message.id !== "number"
    || conversationId === null
  ) {
    return null;
  }

  const messageId = message.id;
  const disabled = working !== null;

  async function run(
    action: ActionName,
    request: () =>
      Promise<AIMessageActionResponse>,
  ) {
    if (working !== null) {
      return;
    }

    try {
      setWorking(action);
      setError("");

      const result = await request();

      openBranch(result);

    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : (
              "This action could not "
              + "be completed."
            ),
      );

      setWorking(null);
    }
  }

  function editAndResend() {
    const edited = window.prompt(
      "Edit your message",
      message.content,
    );

    if (edited === null) {
      return;
    }

    const clean = edited.trim();

    if (
      !clean
      || clean === message.content.trim()
    ) {
      return;
    }

    void run(
      "edit",
      () =>
        editAndResendAIMessage(
          messageId,
          clean,
        ),
    );
  }

  return (
    <div className="mt-3">
      <div
        className={[
          "flex items-center gap-1.5",
          message.role === "user"
            ? "justify-end"
            : "justify-start",
        ].join(" ")}
      >
        {message.role === "user" ? (
          <>
            <ActionButton
              label="Edit and resend"
              symbol="✎"
              active={working === "edit"}
              disabled={disabled}
              onClick={editAndResend}
            />

            <ActionButton
              label="Retry from this message"
              symbol="↻"
              active={working === "retry"}
              disabled={disabled}
              onClick={() => {
                void run(
                  "retry",
                  () =>
                    retryAIMessage(
                      messageId,
                    ),
                );
              }}
            />
          </>
        ) : (
          <ActionButton
            label="Regenerate answer"
            symbol="↻"
            active={
              working === "regenerate"
            }
            disabled={disabled}
            onClick={() => {
              void run(
                "regenerate",
                () =>
                  regenerateAIMessage(
                    messageId,
                  ),
              );
            }}
          />
        )}

        <ActionButton
          label="Branch conversation"
          symbol="🌿"
          active={working === "branch"}
          disabled={disabled}
          onClick={() => {
            void run(
              "branch",
              () =>
                branchAIConversationFromMessage(
                  messageId,
                ),
            );
          }}
        />
      </div>

      {error ? (
        <p
          role="status"
          className={[
            "mt-2 text-xs text-red-300",
            message.role === "user"
              ? "text-right"
              : "text-left",
          ].join(" ")}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
