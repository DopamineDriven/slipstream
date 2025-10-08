import hmac
import hashlib
import time
from fastapi import Request, HTTPException
from app.config import settings


HEADER_NAME = "x-signature-sha256"
TIMESTAMP_HEADER = "x-timestamp"
ALLOWED_SKEW_SECS = 60


async def verify_request_signature(request: Request) -> None:
    """
    Verify HMAC-SHA256 of the raw request body using ws_webhook_secret.
    - Skips verification if no secret is configured (local/dev convenience).
    - Expects hex digest in header 'x-signature-sha256'.
    """
    secret = settings.ws_webhook_secret
    if not secret:
        # No secret configured => allow (dev mode); consider warning log in real app
        return

    signature = request.headers.get(HEADER_NAME)
    if not signature:
        raise HTTPException(status_code=401, detail="missing signature header")

    ts_value = request.headers.get(TIMESTAMP_HEADER)
    if not ts_value:
        raise HTTPException(status_code=401, detail="missing timestamp header")

    try:
        ts_int = int(ts_value)
    except Exception:
        raise HTTPException(status_code=401, detail="invalid timestamp header")

    now = int(time.time())
    if abs(now - ts_int) > ALLOWED_SKEW_SECS:
        raise HTTPException(status_code=401, detail="stale request")

    body = await request.body()
    message = f"{ts_value}.".encode("utf-8") + body
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="invalid signature")
