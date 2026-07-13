from app.routes import quizzes
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine
import app.models
from app.routes.auth import router as auth_router
from app.routes.study_rooms import router as study_rooms_router
from app.routes.notes import router as notes_router
from app.routes.flashcards import router as flashcards_router
from app.routes.learning_events import router as learning_events_router
from app.routes.learning_insights import router as learning_insights_router
from app.routes.ai import router as ai_router
from app.routes.quizzes import router as quizzes_router
from app.routes.dashboard import router as dashboard_router
from app.routes.room_overview import router as room_overview_router
from app.routes.progress import router as progress_router
from app.routes.planner import router as planner_router
from app.routes.pdf_documents import router as pdf_documents_router
from app.routes.search import router as search_router
from app.routes.brain import router as brain_router
from app.routes.smart_organizer import router as smart_organizer_router
from app.routes.users import router as users_router
from app.routes.sessions import router as sessions_router
from app.routes.integrations import router as integrations_router
from app.routes.room_foundation import router as room_foundation_router
from app.routes.materials import router as materials_router
from app.routes.room_invitations import router as room_invitations_router
from app.routes.room_messages import router as room_messages_router
from app.routes.room_members import router as room_members_router

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
app.include_router(learning_events_router, prefix="/api/learning-events")
app.include_router(learning_insights_router, prefix="/api/learning-insights")
app.include_router(ai_router, prefix="/api/ai")
app.include_router(quizzes_router, prefix="/api/quizzes")
app.include_router(dashboard_router, prefix="/api/dashboard")
app.include_router(room_overview_router, prefix="/api/room-overview")
app.include_router(progress_router, prefix="/api/progress")
app.include_router(planner_router, prefix="/api/planner")
app.include_router(pdf_documents_router, prefix="/api/pdfs")
app.include_router(search_router, prefix="/api/search")
app.include_router(brain_router, prefix="/api/brain")
app.include_router(smart_organizer_router, prefix="/api/smart-organizer")
app.include_router(users_router, prefix="/api/users")
app.include_router(sessions_router, prefix="/api/sessions")
app.include_router(integrations_router, prefix="/api/integrations")
app.include_router(room_foundation_router, prefix="/api/room-foundation")
app.include_router(room_members_router, prefix="/api/room-members")
app.include_router(materials_router, prefix="/api/materials")
app.include_router(
    room_invitations_router,
    prefix="/api/room-invitations",
)
app.include_router(
    room_messages_router,
    prefix="/api/room-messages",
)


@app.get("/")
def root():
    return {"message": "StudySnap API backend is running"}


@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(quizzes.router, prefix="/api")
