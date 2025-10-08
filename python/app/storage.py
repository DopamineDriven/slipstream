from app.config import settings
from uuid import uuid4
from mypy_boto3_s3.client import S3Client
from mypy_boto3_s3.type_defs import FileobjTypeDef
import os, re, time
from typing import Optional, TypedDict, NotRequired

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


class UploadGeneratedResult(TypedDict):
    bucket: str
    key: str
    versionId: str
    s3ObjectId: str
    publicUrl: str
    cdnUrl: str
    etag: NotRequired[str]
    size: NotRequired[int]


def _object_key_generated(user_id: str, filename: str) -> str:
    ts = int(time.time() * 1000)
    name = _sanitize_filename(filename)
    # align with Node keying: generated/<userId>/<ts>-<name>
    return f"generated/{user_id}/{ts}-{name}"


def upload_generated(
    fileobj: FileobjTypeDef,
    *,
    user_id: str,
    conversation_id: str,
    draft_id: str,
    batch_id: str,
    filename: str,
    content_type: str = "image/png",
) -> UploadGeneratedResult:
    if not filename:
        raise ValueError("filename must be defined")

    s3 = get_s3()
    key = _object_key_generated(user_id, filename)

    # Upload with aligned metadata for audits and parity with Node
    s3.upload_fileobj(
        fileobj,
        settings.s3_bucket,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "ContentDisposition": f'inline; filename="{_sanitize_filename(filename)}"',
            "Metadata": {
                "userId": user_id,
                "filename": filename,
                "origin": "GENERATED",
                "conversationId": conversation_id,
                "draftId": draft_id,
                "batchId": batch_id,
            },
        },
    )

    # Head object to get authoritative versioning data
    head = s3.head_object(Bucket=settings.s3_bucket, Key=key)
    version_id = head.get("VersionId", "nov") or "nov"
    etag = (head.get("ETag") or "").replace('"', "")
    size = int(head.get("ContentLength") or 0)

    region = settings.s3_region
    public_url = f"https://{settings.s3_bucket}.s3.{region}.amazonaws.com/{key}"
    # compute cf domain: use config domain if provided, else env-based default
    cf_domain = (
        settings.cf_domain
        if settings.cf_domain
        else ("assets.aicoalesce.com" if settings.is_prod else "assets-dev.aicoalesce.com")
    )
    cdn_url = f"https://{cf_domain}/{key}"

    return {
        "bucket": settings.s3_bucket,
        "key": key,
        "versionId": version_id,
        "s3ObjectId": f"s3://{settings.s3_bucket}/{key}#{version_id}",
        "publicUrl": public_url,
        "cdnUrl": cdn_url,
        "etag": etag,
        "size": size,
    }
