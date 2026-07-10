from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "StudySnap AI"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    DATABASE_URL: str = "sqlite:///./test.db"

    secret_key: str = "supersecretkey"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    openai_api_key: str = ""
    openai_vision_model: str = "gpt-4o-mini"

    frontend_app_url: str = "http://localhost:3000"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://127.0.0.1:8000/api/integrations/google/callback"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8"
    )


settings = Settings()
