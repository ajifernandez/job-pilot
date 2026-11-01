from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    gemini_api_key: str
    gemini_model_search: str = "gemini-3.8-flash"
    gemini_model_extract: str = "gemini-3.5-flash-lite"
    gemini_model_write: str = "gemini-3.8-flash"
    database_url: str = "postgresql+psycopg://jobpilot:jobpilot@localhost:5432/jobpilot"
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
