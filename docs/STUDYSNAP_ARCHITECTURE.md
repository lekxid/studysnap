# StudySnap AI — Master Architecture Map

## Vision

StudySnap is not just a study app.

StudySnap is an AI learning operating system that helps students understand, organize, remember, and improve.

Core principle:

> Every feature must make StudySnap smarter, not just bigger.

---

## Product Hierarchy

User
- Home
- Projects
- Vault
- General AI
- Planner
- Insights
- Community
- Settings

Future:
- Semester
- School year
- Career pathway

---

## Projects

Projects are the center of StudySnap.

A project can represent:
- Course
- Exam
- Subject
- Topic
- Certification
- Personal learning goal

Example:
- Nursing Fundamentals
- Anatomy
- Pharmacology
- Math Exam Prep

Backend note:
The current database table may still be called `study_rooms`.
The UI should call them `Projects`.

---

## Project Brain

Each project has its own AI brain.

Project Brain includes:
- Project name
- Subject
- Description
- Project instructions
- Goal
- PDFs
- Notes
- Flashcards
- Quizzes
- Planner
- AI conversations
- Learning activity
- Weak topics
- Strong topics
- Future memory

---

## AI Modes

### 1. Project AI

Uses only project knowledge:
- PDFs
- Notes
- Flashcards
- Quizzes
- AI history
- Learning memory

This mode affects project learning memory.

---

### 2. General AI

Works like a normal AI assistant.

Can answer anything:
- Writing
- Coding
- Life help
- Emails
- Research
- General questions

This mode does NOT affect project learning memory unless the user saves something.

---

### 3. Smart AI

Default future mode.

Flow:
1. Search current project first.
2. If enough context exists, answer from the project.
3. If not enough context exists, use General AI.
4. Offer to save answer into a project.

---

## Universal Search

Search or ask anything from one box.

Searches:
- Projects
- Notes
- PDFs
- Flashcards
- Quizzes
- AI chats
- Planner
- Vault
- General AI

Goal:
The student should not need to know where to click.
StudySnap should understand intent.

---

## Vault

The Vault is the student’s lifelong knowledge library.

Saved items:
- AI explanations
- Notes
- Flashcards
- Quizzes
- PDF summaries
- Image explanations
- Voice summaries
- Important answers

Vault is independent of any one project.

---

## Learning Memory

Future memory tracks:
- Questions asked
- Topics reviewed
- Quiz scores
- Flashcards missed
- Flashcards mastered
- Repeated mistakes
- Weak topics
- Strong topics
- Study habits
- Confidence
- Exam dates

Goal:
StudySnap should understand the student, not just the content.

---

## Brain Architecture

Current:
Student Question
→ Ranking Engine
→ Providers
→ Context Builder
→ OpenAI
→ Answer

Current providers:
- Conversation
- Notes
- PDFs
- Flashcards

Completed:
- Shared ranking utility
- Notes ranking
- PDF ranking
- Flashcards ranking

Future providers:
- Quizzes
- Learning Events
- Images
- Voice
- Video
- Recommendations
- Vault

---

## Frontend Architecture Direction

Pages should become workflow-based, not feature-based.

Main navigation:
- Home
- Projects
- Search
- AI
- Planner
- Insights
- Community
- Settings

Notes, PDFs, Flashcards, Quizzes should mainly live inside Projects.

---

## Design System

StudySnap UI should be:
- Premium
- Dark mode
- Yellow/gold accent
- Glass cards
- Rounded panels
- Smooth animations
- Fully clickable
- Beginner friendly

Reusable components needed:
- ProjectCard
- PremiumButton
- SmartSearchBar
- StatCard
- ContinueLearningCard
- AIQuickActions
- EmptyState
- ProgressRing
- CommandBar
- FloatingAIButton

---

## Development Rules

Every session:
1. Inspect current code.
2. Make one focused change.
3. Verify backend.
4. Verify frontend.
5. Browser test.
6. Commit.
7. Push.

Never skip verification.

---

## Near-Term Roadmap

### Phase 1 — Projects UI
- Rename Study Rooms to Projects in UI
- Projects dashboard
- Project workspace redesign
- Project search
- Better click actions

### Phase 2 — Design System
- Reusable UI components
- Consistent premium layout
- Smart search bar
- Command bar

### Phase 3 — AI Modes
- Project AI
- General AI
- Smart AI

### Phase 4 — Project Instructions
- Add project instructions
- Add project goals
- Use instructions in AI prompts

### Phase 5 — Learning Memory
- Track questions
- Track flashcards
- Track quizzes
- Track weak topics
- Track strong topics

### Phase 6 — Vault
- Save AI answers
- Save notes
- Save flashcards
- Save summaries
- Search saved knowledge

---

## North Star

StudySnap should never make students think about where to save, where to search, or which tool to use.

The AI should understand their intent, organize their knowledge automatically, and let them focus entirely on learning.
