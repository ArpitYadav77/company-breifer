"""Central settings. All secrets come from env vars / a secret manager — never hard-coded."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database (Supabase/Neon in prod; local pgvector in docker-compose)
    database_url: str = "postgresql+asyncpg://recruitsage:recruitsage@db:5432/recruitsage"
    redis_url: str = "redis://redis:6379/0"

    # LLM routing (LiteLLM model strings). Cheap model for classify/extract, strong for synth/chat.
    llm_cheap_model: str = "gemini/gemini-2.5-flash"
    llm_strong_model: str = "gemini/gemini-2.5-pro"
    embedding_model: str = "gemini/text-embedding-004"
    gemini_api_key: str | None = None
    openai_api_key: str | None = None

    # Web research
    search_provider: str = "tavily"  # tavily | exa | serper
    tavily_api_key: str | None = None
    serper_api_key: str | None = None

    # Gmail (encrypted refresh tokens live in DB; these identify the OAuth app)
    google_client_id: str | None = None
    google_client_secret: str | None = None
    gmail_pubsub_topic: str | None = None  # projects/<proj>/topics/<topic>
    token_encryption_key: str = Field(default="", description="Fernet key for token-at-rest encryption")

    # Telegram (webhook mode)
    telegram_bot_token: str | None = None
    telegram_webhook_secret: str | None = None

    # Observability
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "https://cloud.langfuse.com"

    # Budgets (guardrails per research run)
    max_tokens_per_run: int = 60_000
    max_cost_inr_per_run: float = 5.0

    stale_after_days: int = 30
    public_base_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
