const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(
    path.resolve(
      __dirname,
      relativePath,
    ),
    "utf8",
  );
}

function expect(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

const dashboard = read(
  "../src/app/dashboard/page.tsx",
);

const center = read(
  "../src/components/dashboard/SmartDashboardCenter.tsx",
);

const rooms = read(
  "../src/app/study-rooms/page.tsx",
);

const api = read(
  "../src/lib/api.ts",
);

const backendPin = read(
  "../../backend/app/routes/ai.py",
);

const intelligence = read(
  "../../backend/app/services/dashboard/intelligence.py",
);

const dashboardComponent =
  dashboard.slice(
    dashboard.indexOf(
      "export default function DashboardPage()"
    ),
  );

expect(
  dashboardComponent.indexOf(
    "<GeneralAIStartCard"
  ) <
    dashboardComponent.indexOf(
      "<DashboardPinnedMaterials"
    ) &&
  dashboardComponent.indexOf(
    "<DashboardPinnedMaterials"
  ) <
    dashboardComponent.indexOf(
      "{nextSession ? ("
    ),
  "Pinned Materials is not above Upcoming.",
);

expect(
  center.includes(
    "export function DashboardPinnedMaterials"
  ),
  "Top-level pinned-material component is missing.",
);

const pinnedSectionStart =
  center.indexOf(
    "function PinnedMaterialsSection"
  );

const pinnedSectionEnd =
  center.indexOf(
    "\nfunction ",
    pinnedSectionStart + 1,
  );

const pinnedSection =
  center.slice(
    pinnedSectionStart,
    pinnedSectionEnd,
  );

expect(
  pinnedSectionStart >= 0 &&
  pinnedSectionEnd > pinnedSectionStart &&
  pinnedSection.includes(
    "{pinnedItems.length}"
  ) &&
  pinnedSection.includes(
    "/10"
  ) &&
  !pinnedSection.includes(
    "/3"
  ),
  "Pinned-material counter is not 10.",
);

const compact = center.slice(
  center.indexOf(
    "if (commandCenterOnly)"
  ),
  center.indexOf(
    "\n  return (",
    center.indexOf(
      "if (commandCenterOnly)"
    ),
  ),
);

expect(
  !compact.includes(
    "PinnedMaterialsSection"
  ),
  "Pinned Materials is duplicated below Upcoming.",
);

expect(
  backendPin.includes(
    "if pinned_count >= 10"
  ) &&
  backendPin.includes(
    "10 dashboard files."
  ),
  "Backend pin limit is not 10.",
);

expect(
  intelligence.includes(
    "pinned_attachment_items[:10]"
  ),
  "Dashboard API does not return 10 pinned items.",
);

expect(
  api.includes(
    "PLANNER_UPDATED_EVENT"
  ) &&
  api.includes(
    "announcePlannerUpdated"
  ),
  "Planner mutations do not announce refreshes.",
);

expect(
  dashboard.includes(
    '"studysnap:planner-updated"'
  ) &&
  dashboard.includes(
    'window.addEventListener(\n      "focus"'
  ) &&
  dashboard.includes(
    '"visibilitychange"'
  ) &&
  dashboard.includes(
    '"storage"'
  ),
  "Dashboard planner refresh listeners are incomplete.",
);

expect(
  rooms.includes(
    "handleDeleteSelectedRooms"
  ) &&
  rooms.includes(
    "toggleAllFilteredRooms"
  ) &&
  rooms.includes(
    "Delete selected"
  ) &&
  rooms.includes(
    "selectedRoomIds"
  ),
  "Multiple-room deletion controls are incomplete.",
);

console.log(
  "PASS: Final dashboard, pin, planner, and room controls verified."
);
