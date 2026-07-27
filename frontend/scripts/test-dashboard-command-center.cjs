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
    "StudySnap AI"
  ) &&
  dashboard.includes(
    "What are we studying?"
  ) &&
  dashboard.includes(
    "studysnap:dashboard-welcome"
  ) &&
  dashboard.includes(
    "getDashboardLoginFingerprint"
  ),
  "Login-aware StudySnap welcome behavior is missing."
);

expect(
  !dashboard.includes(
    "Your study command center"
  ),
  "The rejected command-center wording remains."
);

expect(
  dashboard.includes(
    "title=\"Current room\""
  ) &&
  dashboard.includes(
    "activeRoomName"
  ),
  "The active room name is not shown naturally."
);

expect(
  !dashboard.includes(
    "Daily Goal"
  ) &&
  !dashboard.includes(
    "getDailyGoalProgress"
  ) &&
  !dashboard.includes(
    '"/api/users/me/settings"'
  ),
  "Daily-goal UI or loading remains in the hero."
);

expect(
  dashboard.includes(
    "Ask StudySnap..."
  ),
  "Main StudySnap composer is missing."
);

expect(
  dashboard.includes(
    "Note"
  ) &&
  dashboard.includes(
    "Quiz"
  ) &&
  dashboard.includes(
    "Plan"
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
    "return future[0] || null;"
  ) &&
  !dashboard.includes(
    "return [...planned].sort"
  ),
  "Past planned items can still become Next Session."
);

expect(
  dashboard.includes(
    "SESSION_COUNTDOWN_WINDOW_MS"
  ) &&
  dashboard.includes(
    "plannerClock"
  ) &&
  dashboard.includes(
    "T− ${timing.label}"
  ) &&
  dashboard.includes(
    'aria-label="Snooze 10 minutes"'
  ),
  "Live 30-minute countdown controls are missing."
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
    "flex snap-x snap-mandatory"
  ) &&
  center.includes(
    "overflow-x-auto"
  ),
  "Pinned materials are not presented left to right."
);

expect(
  center.includes(
    'aria-label="Remove pinned material"'
  ) &&
  center.includes(
    "closePinnedItem"
  ) &&
  center.includes(
    "false"
  ),
  "Pinned materials do not have a persistent close/unpin action."
);

expect(
  center.includes(
    "▣ Note"
  ) &&
  center.includes(
    "? Quiz"
  ),
  "Pinned-material actions are incomplete."
);

expect(
  center.includes(
    "ProtectedFeedImage"
  ),
  "Protected previews were not preserved."
);

const compactStart =
  center.indexOf(
    "if (commandCenterOnly)"
  );

const compactEnd =
  center.indexOf(
    "\n  return (",
    compactStart
  );

const compact =
  center.slice(
    compactStart,
    compactEnd
  );

expect(
  compact.includes(
    "ContinueLearningSection"
  ),
  "Continue Learning is missing from compact dashboard mode."
);

expect(
  !compact.includes(
    "PinnedMaterialsSection"
  ),
  "Pinned Materials is still duplicated in the lower dashboard."
);

expect(
  compact.indexOf(
    "ContinueLearningSection"
  ) < compact.indexOf(
    "LearningFeedSection"
  ),
  "Continue Learning must remain above Learning Feed."
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
  "PASS: Polished connected dashboard contract verified."
);
