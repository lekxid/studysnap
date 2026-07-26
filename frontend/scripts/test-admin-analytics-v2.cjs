const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pagePath = path.join(
  root,
  "src/app/admin/analytics/page.tsx"
);

const source = fs.readFileSync(
  pagePath,
  "utf8"
);

const required = [
  'className="group relative flex h-full min-w-0 flex-1 items-end"',
  "item.events === 0",
  "? 0",
  "maxDailyEvents",
  "Daily product actions",
];

for (const marker of required) {
  if (!source.includes(marker)) {
    throw new Error(
      `Missing Analytics V2 chart marker: ${marker}`
    );
  }
}

if (
  source.includes(
    'className="group relative flex min-w-0 flex-1 items-end"'
  )
) {
  throw new Error(
    "Old chart parent without h-full still exists."
  );
}

console.log(
  "PASS: Analytics V2 chart contract verified."
);
