from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_public_url(value: str) -> str:
    normalized = (value or "").strip().rstrip("/")

    if not normalized:
        return ""

    if normalized.startswith(("http://", "https://")):
        return normalized

    return f"https://{normalized}"


class Settings(BaseSettings):
    app_name: str = "StudySnap AI"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    render_external_hostname: str = ""

    DATABASE_URL: str = "sqlite:///./test.db"

    secret_key: str = "supersecretkey"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    openai_api_key: str = ""
    openai_vision_model: str = "gpt-4o-mini"

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
            normalize_public_url(origin)
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @model_validator(mode="after")
    def validate_production_security(self):
        self.frontend_app_url = normalize_public_url(
            self.frontend_app_url
        )

        render_backend_url = normalize_public_url(
            self.render_external_hostname
        )

        if render_backend_url:
            self.google_redirect_uri = (
                f"{render_backend_url}/"
                "api/integrations/google/callback"
            )
        else:
            self.google_redirect_uri = normalize_public_url(
                self.google_redirect_uri
            )

        protected_environments = {
            "beta",
            "staging",
            "production",
        }

        if self.app_env.strip().lower() not in protected_environments:
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
                "CORS_ORIGINS must contain at least one frontend origin."
            )

        if "*" in origins:
            raise ValueError(
                "Wildcard CORS is not allowed outside development."
            )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
