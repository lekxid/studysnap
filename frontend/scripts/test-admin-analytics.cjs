const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const api = read("src/lib/api.ts");
const shell = read(
  "src/components/AppShell.tsx"
);
const page = read(
  "src/app/admin/analytics/page.tsx"
);

const checks = [
  [
    api.includes(
      "/api/analytics/events"
    ),
    "product event endpoint",
  ],
  [
    api.includes(
      "/api/admin/analytics/summary?days="
    ),
    "founder summary endpoint",
  ],
  [
    api.includes(
      "Analytics must never interrupt studying"
    ),
    "non-blocking analytics",
  ],
  [
    shell.includes(
      'href: "/admin/analytics"'
    ),
    "founder navigation",
  ],
  [
    shell.includes(
      "getAdminAnalyticsAccess"
    ),
    "founder access check",
  ],
  [
    shell.includes(
      'event_name: "page_view"'
    ),
    "page view tracking",
  ],
  [
    page.includes(
      "How people use StudySnap"
    ),
    "analytics dashboard",
  ],
  [
    page.includes(
      "does not show AI prompts"
    ),
    "privacy disclosure",
  ],
];

for (const [passed, label] of checks) {
  if (!passed) {
    throw new Error(
      `Missing analytics contract: ${label}`
    );
  }
}

console.log(
  "PASS: Founder analytics V1 contract verified."
);
