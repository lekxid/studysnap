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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8"
    )


settings = Settings()
