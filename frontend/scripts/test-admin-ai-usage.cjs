const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const page = fs.readFileSync(
  path.join(
    root,
    "src/app/admin/analytics/page.tsx"
  ),
  "utf8"
);

const api = fs.readFileSync(
  path.join(
    root,
    "src/lib/api.ts"
  ),
  "utf8"
);

const requiredPageMarkers = [
  "OpenAI operations",
  "AI usage and estimated cost",
  "summary.ai_usage.requests",
  "summary.ai_usage.total_tokens",
  "summary.ai_usage.estimated_cost_usd",
  "summary.ai_usage.average_latency_ms",
  "summary.ai_usage.by_model",
  "summary.ai_usage.by_feature",
  "summary.ai_usage.unpriced_requests",
  "Monthly AI budget is not configured yet.",
  "Prompts, answers, notes, messages, and file contents are never stored here.",
];

for (const marker of requiredPageMarkers) {
  if (!page.includes(marker)) {
    throw new Error(
      `Missing founder AI usage marker: ${marker}`
    );
  }
}

const requiredTypeMarkers = [
  "ai_usage: {",
  "pricing_version: string;",
  "successful_requests: number;",
  "failed_requests: number;",
  "unpriced_requests: number;",
  "monthly_estimated_cost_usd: number;",
  "average_latency_ms: number;",
  "p95_latency_ms: number;",
  "monthly_budget_used_percent: number;",
  "by_model: Array<{",
  "by_feature: Array<{",
];

for (const marker of requiredTypeMarkers) {
  if (!api.includes(marker)) {
    throw new Error(
      `Missing AI usage response type marker: ${marker}`
    );
  }
}

console.log(
  "PASS: Founder OpenAI Analytics contract verified."
);
