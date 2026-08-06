from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "StudySnap AI"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    DATABASE_URL: str = "sqlite:///./test.db"

    INVITE_ONLY_SIGNUP: bool = False
    SIGNUP_INVITE_CODE: str = ""

    # Comma-separated platform founder/admin accounts.
    # This is separate from Study Room roles such as owner/admin.
    STUDYSNAP_ADMIN_EMAILS: str = ""

    # Local default: backend/uploads
    # Cloud example: /mnt/studysnap
    storage_root: str = "uploads"

    secret_key: str = "supersecretkey"
    algorithm: str = "HS256"

    # Private beta sessions remain active for two days.
    access_token_expire_minutes: int = 2880

    # Secure generated-file links expire quickly; artifacts persist unless
    # a caller explicitly requests an artifact expiration date.
    artifact_ticket_expire_minutes: int = 5

    password_reset_expire_minutes: int = 30

    azure_communication_connection_string: str = ""
    email_sender_address: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_vision_model: str = "gpt-4o-mini"

    # STUDYSNAP_BASE_AI_PROVIDER_V1
    studysnap_base_ai_policy: str = "local_first"
    studysnap_local_ai_enabled: bool = True
    studysnap_local_ai_url: str = "http://127.0.0.1:8081/v1"
    studysnap_local_ai_model: str = "studysnap-base-mini"
    studysnap_local_ai_timeout_seconds: float = 180.0
    studysnap_local_ai_max_input_chars: int = 12000

    # Current-awareness defaults for StudySnap AI.
    studysnap_timezone: str = "America/Toronto"
    web_search_enabled: bool = True

    # Isolated Smart Scan feature flag.
    smart_scan_enabled: bool = True

    frontend_app_url: str = "http://localhost:3000"
    cors_origins: str = (
        "http://localhost:3000,"
        "http://127.0.0.1:3000"
    )

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = (
        "http://127.0.0.1:8000/"
        "api/integrations/google/callback"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @model_validator(mode="after")
    def validate_production_security(self):
        protected_environments = {
            "beta",
            "staging",
            "production",
        }

        if (
            self.app_env.strip().lower()
            not in protected_environments
        ):
            return self

        insecure_secrets = {
            "supersecretkey",
            "change_this_secret_key",
        }

        if (
            self.secret_key in insecure_secrets
            or len(self.secret_key) < 32
        ):
            raise ValueError(
                "SECRET_KEY must be a unique value of at least "
                "32 characters outside development."
            )

        origins = self.cors_origin_list

        if not origins:
            raise ValueError(
                "CORS_ORIGINS must contain at least one "
                "frontend origin."
            )

        if "*" in origins:
            raise ValueError(
                "Wildcard CORS is not allowed outside "
                "development."
            )

        if (
            self.INVITE_ONLY_SIGNUP
            and len(
                self.SIGNUP_INVITE_CODE.strip()
            ) < 8
        ):
            raise ValueError(
                "SIGNUP_INVITE_CODE must contain at least "
                "8 characters when invite-only signup is "
                "enabled."
            )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
