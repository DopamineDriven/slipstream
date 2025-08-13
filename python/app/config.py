from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    s3_bucket: str = "py-gen-assets-dev"
    redis_url: str = ""
    fastapi_url: str = ""
    database_url: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    open_ai_key: str = ""
    s3_presign_ttl_seconds: int = 3600 
    s3_region: str = "us-east-1"
    class Config:
        env_file = ".env"


settings = Settings()
