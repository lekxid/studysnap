from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class UserSettingsBase(BaseModel):
    learning_mode: str = "Clear Explain"
    knowledge_level: str = "Medium"
    progress_sharing: str = "Private"
    favorite_subject: str = ""
    selected_subjects: list[str] = Field(default_factory=list)
    daily_goal: str = "Review 10 flashcards"
    notifications: str = "Important only"

    theme: str = "dark"

    ai_memory_enabled: bool = True
    save_notes_to_memory: bool = True
    save_flashcards_to_memory: bool = True
    save_quiz_results_to_memory: bool = True
    save_weak_strong_concepts: bool = True
    save_study_history: bool = True

    connected_apps: dict[str, Any] = Field(default_factory=dict)
    auto_import_rules: dict[str, Any] = Field(default_factory=dict)

    last_opened_subject: str | None = None
    last_opened_pdf_id: int | None = None
    last_ai_conversation_id: int | None = None


class UserSettingsUpdate(BaseModel):
    learning_mode: str | None = None
    knowledge_level: str | None = None
    progress_sharing: str | None = None
    favorite_subject: str | None = None
    selected_subjects: list[str] | None = None
    daily_goal: str | None = None
    notifications: str | None = None

    theme: str | None = None

    ai_memory_enabled: bool | None = None
    save_notes_to_memory: bool | None = None
    save_flashcards_to_memory: bool | None = None
    save_quiz_results_to_memory: bool | None = None
    save_weak_strong_concepts: bool | None = None
    save_study_history: bool | None = None

    connected_apps: dict[str, Any] | None = None
    auto_import_rules: dict[str, Any] | None = None

    last_opened_subject: str | None = None
    last_opened_pdf_id: int | None = None
    last_ai_conversation_id: int | None = None


class UserSettingsResponse(UserSettingsBase):
    id: int
    user_id: int

    model_config = ConfigDict(from_attributes=True)
