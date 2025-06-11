from app.config import settings
from uuid import uuid4
from mypy_boto3_s3.client import S3Client
from mypy_boto3_s3.type_defs import FileobjTypeDef


def get_s3() -> S3Client:
    import boto3

    return boto3.client("s3", aws_access_key_id=settings.aws_access_key_id, aws_secret_access_key=settings.aws_secret_access_key, region_name=settings.s3_region, endpoint_url=settings.s3_endpoint_url)  # type: ignore


def upload_fileobj(
    fileobj: FileobjTypeDef, filename: str | None, content_type: str | None
) -> str:
    s3 = get_s3()
    if filename is None:
        raise ValueError("filename must be defined")
    key = f"uploads/{uuid4()}-{filename}"
    if content_type is None:
        content_type = "application/octet-stream"
    s3.upload_fileobj(
        fileobj,
        settings.s3_bucket,
        key,
        ExtraArgs={"ContentType": content_type},
    )
    url = f"https://{settings.s3_bucket}.s3.{settings.s3_region}.amazonaws.com/{key}"
    return url
