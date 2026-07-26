const fs = require("fs");
const path = require("path");

const root = path.resolve(
  __dirname,
  ".."
);

const dashboard =
  fs.readFileSync(
    path.join(
      root,
      "src/app/dashboard/page.tsx"
    ),
    "utf8"
  );

const center =
  fs.readFileSync(
    path.join(
      root,
      "src/components/dashboard/SmartDashboardCenter.tsx"
    ),
    "utf8"
  );

const planner =
  fs.readFileSync(
    path.join(
      root,
      "src/app/planner/page.tsx"
    ),
    "utf8"
  );

function expect(
  value,
  message
) {
  if (!value) {
    throw new Error(message);
  }
}

expect(
  dashboard.includes(
    "Your study command center"
  ),
  "Welcome command center is missing."
);

expect(
  dashboard.includes(
    "Ask StudySnap anything..."
  ),
  "Main StudySnap composer is missing."
);

expect(
  !dashboard.includes(
    ">Ask Question<"
  ),
  "Duplicate Ask Question action remains."
);

expect(
  dashboard.includes(
    "Create Note"
  ) &&
  dashboard.includes(
    "Start Quiz"
  ) &&
  dashboard.includes(
    "Add to Planner"
  ),
  "Required quick actions are incomplete."
);

expect(
  dashboard.includes(
    '"/api/planner"'
  ),
  "Real planner data is not loaded."
);

expect(
  dashboard.includes(
    '"/api/users/me/settings"'
  ),
  "Real daily-goal setting is not loaded."
);

expect(
  dashboard.includes(
    "cards_reviewed_today"
  ),
  "Daily progress is not tied to real review activity."
);

expect(
  dashboard.includes(
    "{nextSession ? ("
  ),
  "Next Session is not conditional."
);

expect(
  dashboard.includes(
    "handleSnoozeNextSession"
  ),
  "Connected Snooze action is missing."
);

expect(
  dashboard.includes(
    "getPlannerActionHref"
  ) &&
  dashboard.includes(
    '"roomId"'
  ),
  "Planner actions do not preserve room context."
);

expect(
  dashboard.includes(
    "void dashboardRightPanel"
  ),
  "Hidden previous panel calculations are not handled safely."
);

expect(
  center.includes(
    "if (pinnedItems.length === 0)"
  ) &&
  center.includes(
    "return null;"
  ),
  "Pinned Materials does not hide when empty."
);

expect(
  center.includes(
    "Make Note"
  ) &&
  center.includes(
    "Quiz Me"
  ),
  "Pinned-material actions are incomplete."
);

expect(
  center.includes(
    "ProtectedFeedImage"
  ),
  "Protected previews were not preserved."
);

expect(
  center.includes(
    "commandCenterOnly = false"
  ),
  "Compact dashboard mode is missing."
);

expect(
  center.includes(
    "!pinnedIds.has("
  ),
  "Pinned items are not excluded from Learning Feed."
);

expect(
  planner.includes(
    "window.location.search"
  ),
  "Planner URL actions are not read safely."
);

expect(
  planner.includes(
    '"startPlanId"'
  ) &&
  planner.includes(
    '"editPlanId"'
  ),
  "Planner Start or Edit connection is missing."
);

expect(
  !planner.includes(
    "useSearchParams"
  ),
  "Planner added an unnecessary search-param rendering dependency."
);

expect(
  planner.includes(
    "Save changes"
  ),
  "Planner edit saving is missing."
);

console.log(
  "PASS: Connected dashboard command-center contract verified."
);
