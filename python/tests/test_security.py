import json
import hmac
import hashlib
import time
import pytest
from fastapi import FastAPI, Depends
from httpx import AsyncClient

from app.security import verify_request_signature
from app.config import settings


def _sign(secret: str, body: bytes, ts: int) -> str:
    message = f"{ts}.".encode("utf-8") + body
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


@pytest.mark.asyncio
async def test_signature_verification_success():
    app = FastAPI()

    @app.post("/check", dependencies=[Depends(verify_request_signature)])
    async def check():  # pragma: no cover - simple passthrough
        return {"ok": True}

    secret = "supersecret"
    settings.ws_webhook_secret = secret

    body = json.dumps({"hello": "world"}).encode()
    ts = int(time.time())
    sig = _sign(secret, body, ts)

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/check", content=body, headers={
            "x-signature-sha256": sig,
            "x-timestamp": str(ts),
            "content-type": "application/json",
        })
    assert res.status_code == 200
    assert res.json() == {"ok": True}


@pytest.mark.asyncio
async def test_signature_verification_missing_headers():
    app = FastAPI()

    @app.post("/check", dependencies=[Depends(verify_request_signature)])
    async def check():
        return {"ok": True}

    settings.ws_webhook_secret = "secret"
    body = b"{}"
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/check", content=body)
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_signature_verification_stale_timestamp():
    app = FastAPI()

    @app.post("/check", dependencies=[Depends(verify_request_signature)])
    async def check():
        return {"ok": True}

    secret = "another"
    settings.ws_webhook_secret = secret
    body = b"{}"
    ts = int(time.time()) - 120  # stale
    sig = _sign(secret, body, ts)

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/check", content=body, headers={
            "x-signature-sha256": sig,
            "x-timestamp": str(ts),
            "content-type": "application/json",
        })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_signature_verification_no_secret_skips_check():
    app = FastAPI()

    @app.post("/check", dependencies=[Depends(verify_request_signature)])
    async def check():
        return {"ok": True}

    # No secret => skip verification (dev)
    settings.ws_webhook_secret = ""

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/check", content=b"{}")
    assert res.status_code == 200
    assert res.json() == {"ok": True}

