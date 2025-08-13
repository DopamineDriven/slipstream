from app.config import settings
from uuid import uuid4
from mypy_boto3_s3.client import S3Client
from mypy_boto3_s3.type_defs import FileobjTypeDef
import os, re
from typing import Optional

def get_s3() -> S3Client:
    import boto3
    
    return boto3.client("s3", region_name=settings.s3_region) # type: ignore

def _sanitize_filename(name: str) -> str:
    base = os.path.basename(name)
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return safe or "file"

def _object_key(filename: str) -> str:
    return f"generated-images/{uuid4()}-{_sanitize_filename(filename)}"

def upload_fileobj(
    fileobj: FileobjTypeDef, filename: Optional[str], content_type: Optional[str]
) -> str:

    if filename is None:
        raise ValueError("filename must be defined")
    
    s3 = get_s3()
    
    key = _object_key(filename)
    
    if content_type is None:
        content_type = "application/octet-stream"
        
    s3.upload_fileobj(
        fileobj,
        settings.s3_bucket,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "ContentDisposition": f'inline; filename="{_sanitize_filename(filename)}"'
        }
    )
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=settings.s3_presign_ttl_seconds
    )
    return url
