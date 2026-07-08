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

---

## Smart Upload Flow

Smart Upload Flow turns PDF upload into an intelligent onboarding experience for each project.

### Goal

When a student uploads one or more PDF files, StudySnap should not only store them. It should understand them.

StudySnap should automatically:

- detect the topic of the uploaded PDFs
- suggest a Project name
- ask if the student wants to create a new Project
- ask if the student wants to generate flashcards
- later ask if they want notes, quizzes, and a study plan
- connect the PDFs to the Project Brain

### Example

Student uploads:

- Cardiac Anatomy.pdf
- Heart Failure Lecture.pdf
- Blood Pressure Notes.pdf

StudySnap detects:

- Topic: Cardiovascular System
- Suggested Project: Cardiovascular System

StudySnap asks:

> These PDFs look like they are about Cardiovascular System.
> Do you want me to create a Project for this topic?
> I can also generate flashcards, notes, a quiz, and a study plan.

### Why this matters

This makes StudySnap feel intelligent immediately after upload.

Instead of uploading PDFs and manually organizing everything, the student gets an AI-powered learning setup automatically.

### Roadmap

Phase 1:
- detect topic from extracted PDF text
- show suggested topic after upload
- ask if user wants to generate flashcards

Phase 2:
- suggest creating a Project from uploaded PDFs
- move/group PDFs into that Project
- generate Project Brain summary

Phase 3:
- generate notes from PDFs
- generate quizzes from PDFs
- generate study plan from PDFs
- identify weak topics from generated practice

Phase 4:
- auto-group multiple PDFs by topic
- suggest multiple Projects if the PDFs are about different subjects
- connect Smart Upload Flow to Smart AI and Universal Search

