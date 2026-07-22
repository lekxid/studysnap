# StudySnap Mobile Experience V1

## Product goal

StudySnap mobile should help a student understand three things quickly:

1. What was I doing?
2. What should I do next?
3. Did anything important happen?

The mobile experience must feel focused, useful, and calm—not crowded or repetitive.

---

## Core information rules

### Dashboard

The dashboard represents the student's current learning state.

It should contain:

1. StudySnap command center
2. One recommended next step
3. Continue Learning
4. Today's Focus
5. Compact Progress Overview
6. Recent Materials

The dashboard must not display the same information in multiple sections.

### Notifications

Notifications represent events that happened.

Valid notifications include:

- New Study Together messages
- Room invitations
- New shared materials
- File processing completed
- Quiz result available
- Planner reminder due
- Important account or system issue

Notifications must not include:

- Generic study advice
- Repeated weak-concept warnings
- Every unfinished note
- Every old conversation
- General “continue studying” prompts

Those belong in recommendations or Continue Learning.

### Recommendations

Recommendations are learning guidance, not alerts.

Examples:

- Continue an unfinished quiz
- Review a weak concept
- Finish a recent note
- Practice Concept Cards
- Resume a recent AI conversation

Only one recommendation should receive primary visual emphasis on the dashboard.

---

## Mobile dashboard order

### 1. Command center

- “What would you like to study today?”
- Ask StudySnap
- Attach material
- Create note
- Start quiz
- Open Concept Cards

### 2. Recommended next step

Show one item only.

Each recommendation must include:

- Clear title
- Short reason
- One direct action
- Correct destination

### 3. Continue Learning

Show a maximum of three recent meaningful items.

Do not include duplicate conversations or repeated activity records.

### 4. Today's Focus

Show three or four short tasks.

Each task should open the correct destination.

### 5. Progress Overview

Compact summary only.

Full analytics belong on the Progress page.

### 6. Recent Materials

Show a maximum of three items.

Older activity belongs inside the room or activity history.

---

## Notification center

The notification bell opens a mobile drawer or bottom sheet.

Each notification contains:

- Icon
- Clear title
- One-line explanation
- Timestamp
- Read/unread state
- Destination action

Required behavior:

- Open the exact room, message, note, material, quiz, or reminder
- Mark notification read after opening
- Support “Mark all as read”
- Display a useful empty state
- Prevent duplicate notification entries
- Cap the initial list and allow older items to load later

The unread badge counts events only.

Learning recommendations do not increase the unread badge.

---

## Mobile navigation

The menu must behave as a real drawer:

- Opens over the current page
- Prevents background scrolling
- Closes after navigation
- Keeps the current page visible behind an overlay
- Displays primary destinations first
- Places secondary tools under More
- Avoids an additional full-page scrollbar

Primary navigation:

- Home
- Study Rooms
- Study Together
- AI Tutor
- Progress

Study tools:

- Notes
- Concept Cards
- Quizzes
- Planner

More:

- Learning Setup
- AI Memory
- Groups
- Settings

---

## Study Rooms mobile experience

The Study Rooms page should prioritize:

1. Current room
2. Search or switch rooms
3. Open workspace
4. Create room

Editing and deleting a room should be placed inside a secondary settings action.

The page must not repeat the selected room in multiple large cards.

---

## Mobile visual rules

- Avoid oversized headings on narrow screens
- Use compact vertical spacing
- Use one page scrollbar
- Do not place scrollable cards inside scrollable pages
- Truncate long titles with enough supporting context
- Keep touch targets at least 44px high
- Keep the primary action visible and obvious
- Avoid more than one dominant gold action per section
- Preserve the desktop layout unless a mobile change explicitly requires otherwise

---

## Delivery stages

### Stage 1

Notification center using existing dashboard data.

No database migration.

### Stage 2

Simplify the mobile dashboard and remove duplicated sections.

### Stage 3

Convert the mobile menu into a proper drawer.

### Stage 4

Simplify Study Rooms on mobile.

### Stage 5

Add persistent notification read state only after the experience is proven.

---

## Acceptance criteria

A student should be able to:

- Understand the dashboard within five seconds
- Resume recent study work with one tap
- Identify the single recommended next step
- Find new messages from the bell
- Open the exact destination from a notification
- Navigate without nested scrolling
- Use the dashboard comfortably with one hand
- Complete the same actions available on desktop
