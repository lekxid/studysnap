const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const pagePath = path.join(
  root,
  "src",
  "app",
  "admin",
  "analytics",
  "page.tsx"
);

const source = fs.readFileSync(
  pagePath,
  "utf8"
);

const required = [
  "function formatUsd",
  "minimumFractionDigits: 6",
  "maximumFractionDigits: 6",
  "function formatBudgetPercent",
  "function formatTrackingStart",
  "Tracking since",
  "Earlier AI product actions remain counted separately",
  '.replace(/\\bAi\\b/g, "AI")',
  "summary.daily_activity.every(",
  "No tracked actions in this window yet.",
  "backgroundImage:",
  "No OpenAI model usage is recorded",
  "No feature-level OpenAI usage is recorded",
];

for (const contract of required) {
  if (!source.includes(contract)) {
    throw new Error(
      `Missing analytics polish contract: ${contract}`
    );
  }
}

if (
  source.includes(
    "minimumFractionDigits: 4"
  )
) {
  throw new Error(
    "Old four-decimal cost formatting remains."
  );
}

if (
  source.includes(
    "maxActivity"
  )
) {
  throw new Error(
    "Undefined maxActivity reference remains."
  );
}

console.log(
  "PASS: Founder analytics polish contract verified."
);
