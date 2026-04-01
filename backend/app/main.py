from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.database import Base, engine

import backend.app.models

from backend.app.routes.auth import router as auth_router
from backend.app.routes.study_rooms import router as study_rooms_router
from backend.app.routes.notes import router as notes_router
from backend.app.routes.flashcards import router as flashcards_router
from backend.app.routes.ai import router as ai_router
from backend.app.routes.quizzes import router as quizzes_router
from backend.app.routes.dashboard import router as dashboard_router
from backend.app.routes.room_overview import router as room_overview_router
from backend.app.routes.progress import router as progress_router
from backend.app.routes.planner import router as planner_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(study_rooms_router, prefix="/api/study-rooms")
app.include_router(notes_router, prefix="/api/notes")
app.include_router(flashcards_router, prefix="/api/flashcards")
app.include_router(ai_router, prefix="/api/ai")
app.include_router(quizzes_router, prefix="/api/quizzes")
app.include_router(dashboard_router, prefix="/api/dashboard")
app.include_router(room_overview_router, prefix="/api/room-overview")
app.include_router(progress_router, prefix="/api/progress")
app.include_router(planner_router, prefix="/api/planner")


@app.get("/")
def root():
    return {"message": "StudySnap API backend is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
