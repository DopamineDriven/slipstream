from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.models import (
    GenRequest,
    GenResponse,
    UploadResponse,
    GenJobRequest,
    GenJobResult,
    GenJobDispatch,
)
from app.inference import generate_image, generate_image_with_dims, generate_image_for_dispatch
from app.storage import upload_fileobj, upload_generated
from app.config import settings
from app.security import verify_request_signature
import asyncio
import os

try:
    import httpx  # type: ignore
except Exception:  # pragma: no cover - runtime only
    httpx = None  # type: ignore

router = APIRouter()


@router.post("/generate", response_model=GenResponse)
async def generate(req: GenRequest):
    image_path = generate_image(req.prompt)
    try:
        with open(image_path, "rb") as f:
            url = upload_fileobj(f, os.path.basename(image_path), "image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"upload failed: {e}")
    finally:
        os.remove(image_path)
    return {"url": url}


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    url = upload_fileobj(file.file, file.filename, file.content_type)
    return UploadResponse(filename=file.filename, url=url)


from typing import Union


@router.post("/assets/generate", response_model=GenJobResult)
async def generate_asset(
    req: Union[GenJobDispatch, GenJobRequest],
    _: None = Depends(verify_request_signature),
) -> GenJobResult:
    """
    Generate an image, upload to S3 (pyGenAssets bucket), and notify ws-server via webhook.
    Returns authoritative S3/CDN identifiers for reconciliation.
    """
    # derive dims (v2 carries width/height, v1 does not)
    if isinstance(req, GenJobDispatch):
        image_path, w, h = generate_image_for_dispatch(req)
    else:
        try:
            width = getattr(req, "width", None) or 256
            height = getattr(req, "height", None) or 256
        except Exception:
            width, height = 256, 256
        image_path, w, h = generate_image_with_dims(req.prompt, width=width, height=height)
    try:
        with open(image_path, "rb") as f:
            uploaded = upload_generated(
                f,
                user_id=req.userId,
                conversation_id=req.conversationId,
                draft_id=getattr(req, "draftId", None) or "",
                batch_id=getattr(req, "batchId", None) or "",
                filename=getattr(req, "filename", None) or "generated.png",
                content_type=getattr(req, "contentType", None) or "image/png",
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"upload failed: {e}")
    finally:
        try:
            os.remove(image_path)
        except Exception:
            pass

    # Best-effort notify ws-server webhook; do not fail generation on webhook failure
    webhook_url = settings.ws_server_url.rstrip("/") + "/webhooks/python/asset-generated"
    payload = {
        "userId": req.userId,
        "conversationId": req.conversationId,
        "draftId": getattr(req, "draftId", None),
        "batchId": getattr(req, "batchId", None),
        "filename": getattr(req, "filename", None),
        "mime": getattr(req, "contentType", None),
        "size": uploaded.get("size", 0),
        "bucket": uploaded.get("bucket", "py-gen-assets-dev"),
        "key": uploaded.get("key"),
        "versionId": uploaded.get("versionId"),
        "width": w,
        "height": h,
        "origin": "GENERATED",
    }

    # best-effort zeroize api key reference if present (stateless BYOK)
    if isinstance(req, GenJobDispatch) and req.auth.apiKey:
        try:
            # drop reference; python strings are immutable but this removes pointer
            req.auth.apiKey = ""
        except Exception:
            pass

    async def post_webhook() -> None:
        if httpx is None:
            return
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:  # type: ignore
                headers = (
                    {"x-python-gen-hook": settings.ws_webhook_secret}
                    if settings.ws_webhook_secret
                    else None
                )
                await client.post(webhook_url, json=payload, headers=headers)
        except Exception:
            # swallow errors; logging optional
            return

    # Fire and forget
    asyncio.create_task(post_webhook())
    return GenJobResult(
        bucket=uploaded.get("bucket", "py-gen-assets-dev"),
        key=uploaded["key"],
        versionId=uploaded["versionId"],
        s3ObjectId=uploaded["s3ObjectId"],
        publicUrl=uploaded["publicUrl"],
        cdnUrl=uploaded["cdnUrl"],
        etag=uploaded.get("etag"),
        size=uploaded.get("size"),
        width=w,
        height=h,
    )
