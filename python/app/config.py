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
    # ws-server webhook target (HTTP server of the WS process)
    ws_server_url: str = "http://localhost:4000"
    ws_webhook_secret: str = ""
    # Optional explicit CloudFront domain; falls back to assets(-dev).aicoalesce.com
    cf_domain: str = "assets-dev.aicoalesce.com"
    # env toggle for CloudFront default selection
    is_prod: bool = False
    # Provider call toggles (default off; enable to call real SDKs)
    enable_provider_calls: bool = False
    enable_openai: bool = False
    enable_gemini: bool = False
    enable_xai: bool = False
    class Config:
        env_file = ".env"


settings = Settings()
