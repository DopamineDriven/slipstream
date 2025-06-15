from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_bucket: str = "t3-chat-clone-pg"
    s3_region: str = "us-east-1"
    s3_endpoint_url: str = ""  # For Minio/R2/other S3 clones
    r2_public_base: str = "https://t3-clone.asrosscloud.com"

    class Config:
        env_file = ".env"


settings = Settings()
