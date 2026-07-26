"use client";

import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import {
  getAdminAnalyticsSummary,
  type AdminAnalyticsSummary,
} from "@/lib/api";


function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}


function formatBytes(value: number) {
  if (!value) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(
      Math.log(value) / Math.log(1024)
    ),
    units.length - 1
  );

  return `${(
    value / 1024 ** index
  ).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}


function formatDate(value: string | null) {
  if (!value) return "No activity yet";

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(new Date(value));
}


function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}


function MetricCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>

      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-400">
        {detail}
      </p>
    </article>
  );
}


export default function FounderAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] =
    useState<AdminAnalyticsSummary | null>(
      null
    );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const result =
          await getAdminAnalyticsSummary(
            days
          );

        if (!cancelled) {
          setSummary(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setSummary(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Founder analytics could not be loaded."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [days]);

  const maxDailyEvents = useMemo(
    () =>
      Math.max(
        1,
        ...(summary?.daily_activity.map(
          (item) => item.events
        ) || [1])
      ),
    [summary]
  );

  return (
    <AppShell
      title="Founder Analytics"
      subtitle="See adoption, activity, feature usage, and return behaviour without opening private study content."
    >
      <div className="space-y-5">
        <section className="rounded-[1.75rem] border border-[#d6b84a]/20 bg-[radial-gradient(circle_at_top_left,rgba(214,184,74,0.12),transparent_38%),rgba(255,255,255,0.025)] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6b84a]">
                Private founder view
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                How people use StudySnap
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                This dashboard records actions and totals. It does not show AI prompts, answers, notes, messages, filenames, or uploaded-file contents.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-black text-slate-300">
              Window
              <select
                value={days}
                onChange={(event) =>
                  setDays(
                    Number(event.target.value)
                  )
                }
                className="rounded-xl border border-white/10 bg-[#090b0d] px-3 py-2 text-white outline-none"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </div>
        </section>

        {loading ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
            Loading founder analytics…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[1.5rem] border border-red-400/20 bg-red-500/[0.07] p-5 text-sm leading-6 text-red-100">
            {error}
          </div>
        ) : null}

        {summary ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Total users"
                value={formatNumber(
                  summary.totals.users
                )}
                detail={`${formatNumber(
                  summary.totals.new_users_7d
                )} joined in the last 7 days`}
              />

              <MetricCard
                title="Active today"
                value={formatNumber(
                  summary.totals.active_today
                )}
                detail={`${formatNumber(
                  summary.totals.active_7d
                )} active in 7 days`}
              />

              <MetricCard
                title="Monthly active"
                value={formatNumber(
                  summary.totals.active_30d
                )}
                detail={`${formatNumber(
                  summary.totals.events_in_window
                )} tracked actions in this window`}
              />

              <MetricCard
                title="Returning users"
                value={`${summary.totals.established_return_rate_7d.toFixed(
                  1
                )}%`}
                detail="Established accounts active again within the last 7 days"
              />
            </section>

            <section className="rounded-[1.75rem] border border-[#d6b84a]/20 bg-[radial-gradient(circle_at_top_right,rgba(214,184,74,0.09),transparent_36%),rgba(255,255,255,0.025)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d6b84a]">
                    OpenAI operations
                  </p>

                  <h3 className="mt-2 text-lg font-black text-white">
                    AI usage and estimated cost
                  </h3>

                  <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
                    Records model, tokens, latency, feature, status, and estimated cost. Prompts, answers, notes, messages, and file contents are never stored here.
                  </p>
                </div>

                <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold text-slate-400">
                  {summary.ai_usage.pricing_version}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="AI requests"
                  value={formatNumber(
                    summary.ai_usage.requests
                  )}
                  detail={`${formatNumber(
                    summary.ai_usage.failed_requests
                  )} failed requests`}
                />

                <MetricCard
                  title="AI tokens"
                  value={formatNumber(
                    summary.ai_usage.total_tokens
                  )}
                  detail={`${formatNumber(
                    summary.ai_usage.cached_input_tokens
                  )} cached input tokens`}
                />

                <MetricCard
                  title="Estimated cost"
                  value={summary.ai_usage.estimated_cost_usd.toLocaleString(
                    "en-US",
                    {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    }
                  )}
                  detail={`${summary.ai_usage.monthly_estimated_cost_usd.toLocaleString(
                    "en-US",
                    {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    }
                  )} this month`}
                />

                <MetricCard
                  title="AI latency"
                  value={`${formatNumber(
                    summary.ai_usage.average_latency_ms
                  )} ms`}
                  detail={`P95 ${formatNumber(
                    summary.ai_usage.p95_latency_ms
                  )} ms`}
                />
              </div>

              {summary.ai_usage.monthly_budget_usd > 0 ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="font-black text-slate-200">
                      Monthly AI budget
                    </span>

                    <span className="font-bold text-slate-400">
                      {summary.ai_usage.monthly_budget_used_percent.toFixed(
                        1
                      )}
                      % of{" "}
                      {summary.ai_usage.monthly_budget_usd.toLocaleString(
                        "en-US",
                        {
                          style: "currency",
                          currency: "USD",
                        }
                      )}
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-[#d6b84a]"
                      style={{
                        width: `${Math.min(
                          100,
                          summary.ai_usage.monthly_budget_used_percent
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-400">
                  Monthly AI budget is not configured yet.
                </div>
              )}

              {summary.ai_usage.unpriced_requests > 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-xs leading-5 text-amber-100">
                  {formatNumber(
                    summary.ai_usage.unpriced_requests
                  )}{" "}
                  request
                  {summary.ai_usage.unpriced_requests === 1
                    ? ""
                    : "s"}{" "}
                  used a model or configuration without a verified price. Those requests are counted but excluded from estimated cost.
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Usage by model
                  </p>

                  <div className="mt-3 space-y-2">
                    {summary.ai_usage.by_model.length ? (
                      summary.ai_usage.by_model.map(
                        (item) => (
                          <div
                            key={item.model}
                            className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-slate-200">
                                {item.model}
                              </p>

                              <p className="mt-1 text-[10px] text-slate-500">
                                {formatNumber(
                                  item.tokens
                                )}{" "}
                                tokens ·{" "}
                                {formatNumber(
                                  item.average_latency_ms
                                )}{" "}
                                ms average
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs font-black text-white">
                                {formatNumber(
                                  item.requests
                                )}
                              </p>

                              <p className="text-[10px] text-slate-500">
                                {item.estimated_cost_usd.toLocaleString(
                                  "en-US",
                                  {
                                    style: "currency",
                                    currency: "USD",
                                    minimumFractionDigits: 4,
                                    maximumFractionDigits: 4,
                                  }
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      )
                    ) : (
                      <p className="py-4 text-xs text-slate-500">
                        Real model usage will appear after the OpenAI call recorder is activated.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Usage by feature
                  </p>

                  <div className="mt-3 space-y-2">
                    {summary.ai_usage.by_feature.length ? (
                      summary.ai_usage.by_feature.map(
                        (item) => (
                          <div
                            key={item.feature}
                            className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black capitalize text-slate-200">
                                {item.feature.replace(
                                  /_/g,
                                  " "
                                )}
                              </p>

                              <p className="mt-1 text-[10px] text-slate-500">
                                {formatNumber(
                                  item.tokens
                                )}{" "}
                                tokens ·{" "}
                                {formatNumber(
                                  item.failures
                                )}{" "}
                                failures
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs font-black text-white">
                                {formatNumber(
                                  item.requests
                                )}
                              </p>

                              <p className="text-[10px] text-slate-500">
                                {item.estimated_cost_usd.toLocaleString(
                                  "en-US",
                                  {
                                    style: "currency",
                                    currency: "USD",
                                    minimumFractionDigits: 4,
                                    maximumFractionDigits: 4,
                                  }
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      )
                    ) : (
                      <p className="py-4 text-xs text-slate-500">
                        Feature-level AI usage will appear after the OpenAI call recorder is activated.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
              <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                      Activity trend
                    </p>

                    <h3 className="mt-2 text-lg font-black text-white">
                      Daily product actions
                    </h3>
                  </div>

                  <p className="text-xs text-slate-500">
                    Last {summary.window_days} days
                  </p>
                </div>

                <div className="mt-6 flex h-44 items-end gap-1 overflow-hidden">
                  {summary.daily_activity.map(
                    (item) => {
                      const height =
                        item.events === 0
                          ? 0
                          : Math.max(
                              6,
                              Math.round(
                                (item.events /
                                  maxDailyEvents) *
                                  100
                              )
                            );

                      return (
                        <div
                          key={item.date}
                          className="group relative flex h-full min-w-0 flex-1 items-end"
                          title={`${item.date}: ${item.events} actions, ${item.active_users} active users`}
                        >
                          <div
                            className="w-full rounded-t bg-[#d6b84a]/65 transition group-hover:bg-[#d6b84a]"
                            style={{
                              height: `${height}%`,
                            }}
                          />
                        </div>
                      );
                    }
                  )}
                </div>

                <div className="mt-3 flex justify-between text-[10px] font-bold text-slate-600">
                  <span>
                    {summary.daily_activity[0]?.date}
                  </span>
                  <span>
                    {
                      summary.daily_activity[
                        summary.daily_activity.length -
                          1
                      ]?.date
                    }
                  </span>
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Files and storage
                </p>

                <h3 className="mt-2 text-lg font-black text-white">
                  Current inventory
                </h3>

                <div className="mt-5 space-y-3">
                  {Object.entries(
                    summary.inventory
                  ).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-3 text-sm"
                    >
                      <span className="text-slate-400">
                        {label(key)}
                      </span>

                      <span className="font-black text-white">
                        {key === "stored_bytes"
                          ? formatBytes(value)
                          : formatNumber(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Feature adoption
                </p>

                <h3 className="mt-2 text-lg font-black text-white">
                  Most-used areas
                </h3>

                <div className="mt-5 space-y-3">
                  {summary.feature_usage.length ? (
                    summary.feature_usage.map(
                      (item) => (
                        <div
                          key={item.category}
                          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3"
                        >
                          <span className="text-sm font-bold text-slate-300">
                            {label(item.category)}
                          </span>

                          <span className="text-sm font-black text-[#d6b84a]">
                            {formatNumber(
                              item.events
                            )}
                          </span>
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">
                      New product actions will appear here as students use StudySnap.
                    </p>
                  )}
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Usage details
                </p>

                <h3 className="mt-2 text-lg font-black text-white">
                  Tracked actions
                </h3>

                <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {summary.event_usage.length ? (
                    summary.event_usage.map(
                      (item) => (
                        <div
                          key={item.event_name}
                          className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-bold text-slate-300">
                              {label(
                                item.event_name
                              )}
                            </span>

                            <span className="text-xs font-black text-white">
                              {formatNumber(
                                item.events
                              )}
                            </span>
                          </div>

                          {item.quantity !==
                          item.events ? (
                            <p className="mt-1 text-[11px] text-slate-500">
                              {formatNumber(
                                item.quantity
                              )} total items
                            </p>
                          ) : null}
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">
                      No actions recorded in this window yet.
                    </p>
                  )}
                </div>
              </article>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  User activity
                </p>

                <h3 className="mt-2 text-lg font-black text-white">
                  Accounts and return behaviour
                </h3>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-3 py-3">User</th>
                      <th className="px-3 py-3">Last active</th>
                      <th className="px-3 py-3">Actions</th>
                      <th className="px-3 py-3">Top area</th>
                    </tr>
                  </thead>

                  <tbody>
                    {summary.users.map(
                      (user) => (
                        <tr
                          key={user.id}
                          className="border-b border-white/[0.055]"
                        >
                          <td className="px-3 py-4">
                            <p className="font-black text-white">
                              {user.full_name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {user.email}
                            </p>
                          </td>

                          <td className="px-3 py-4 text-slate-300">
                            {formatDate(
                              user.last_active_at
                            )}
                          </td>

                          <td className="px-3 py-4 font-black text-white">
                            {formatNumber(
                              user.events_30d
                            )}
                          </td>

                          <td className="px-3 py-4 text-slate-300">
                            {user.top_feature
                              ? label(
                                  user.top_feature
                                )
                              : "No tracked action"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Recent activity
              </p>

              <h3 className="mt-2 text-lg font-black text-white">
                Privacy-safe event stream
              </h3>

              <div className="mt-5 space-y-3">
                {summary.recent_events.length ? (
                  summary.recent_events.map(
                    (event) => (
                      <div
                        key={event.id}
                        className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-black text-white">
                            {label(
                              event.event_name
                            )}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {event.user_email ||
                              `User ${event.user_id}`}
                            {event.surface
                              ? ` · ${event.surface}`
                              : ""}
                          </p>
                        </div>

                        <p className="text-xs font-bold text-slate-500">
                          {formatDate(
                            event.occurred_at
                          )}
                        </p>
                      </div>
                    )
                  )
                ) : (
                  <p className="text-sm leading-6 text-slate-500">
                    Recent actions will appear after students use the updated build.
                  </p>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
