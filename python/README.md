## Python Generative Asset Service

FastAPI microservice for generative asset tasks (image generation and uploads). Deployed to AWS Fargate behind an ALB, consumed by the WS server via `FASTAPI_URL`.

### Endpoints

- `GET /`: Health check → `{ "status": "ok" }`.
- `POST /generate` (JSON): `{ "prompt": string }` → `{ "url": string }`.
  - Generates a PNG (placeholder via PIL here), uploads to S3, returns a presigned download URL.
- `POST /upload` (multipart/form-data): `file` → `{ "filename": string | null, "url": string }`.
  - Streams the file to S3 and returns a presigned download URL.
- `POST /assets/generate` (JSON):
  - v1 Request `{ prompt, userId, conversationId, draftId, batchId, filename, contentType }`.
  - v2 Request (preferred) uses discriminated union with BYOK:
    `{ auth: { kind: "server"|"user", provider: "openai"|"gemini"|"grok", apiKey: string }, jobId, userId, conversationId, draftId?, batchId?, provider, model, prompt, filename?, contentType?, width?, height?, seed?, negativePrompt?, steps?, guidanceScale? }`.
  - Uploads directly to the `pyGenAssets` bucket with aligned metadata, returns `{ bucket, key, versionId, s3ObjectId, publicUrl, cdnUrl, etag?, size?, width?, height? }`.
  - Best-effort posts a webhook to the ws-server at `/webhooks/python/asset-generated` so the server can finalize and emit `asset_ready`.
  - Security: requires headers
    - `x-timestamp`: Unix epoch seconds (server time)
    - `x-signature-sha256`: hex(HMAC_SHA256(ws_webhook_secret, `${x-timestamp}.${raw_body}`))
    - Replay protection: timestamps older than 60s are rejected. If `ws_webhook_secret` is empty, verification is skipped (dev only).

### Configuration

- `app/config.py` uses Pydantic Settings; `.env` supported in dev.
- Important env vars (names reflect `Settings` fields):
  - `s3_bucket`: destination bucket (e.g., `py-gen-assets-dev`/`py-gen-assets-prod`).
  - `s3_region`: AWS region for S3 client (e.g., `us-east-1`).
  - `s3_presign_ttl_seconds`: presigned URL TTL (default `3600`).
  - `ws_server_url`: base URL to the ws-server HTTP (e.g., `http://localhost:4000`).
  - `cf_domain` (optional): override CloudFront domain. Default resolves to `assets(-dev).aicoalesce.com` based on `is_prod`.
  - `is_prod`: toggles default CloudFront domain selection.
  - Provider call toggles (default false):
    - `enable_provider_calls`: master switch to allow calling provider SDKs.
    - `enable_openai`: enable OpenAI image generation path.
    - `enable_gemini`: enable Gemini/Imagen image generation path.
    - `enable_xai`: enable Grok (xai_sdk) image generation path.
  - Optional: `xai_api_key` for local experiments; in production BYOK/server keys should be passed per-request via `auth.apiKey`.
  - AWS credentials: use IAM Task Role in Fargate; for local, standard AWS env/credentials chain.

### Local Development

- With PDM:
  - `pdm sync` (or `pdm install`) to install deps.
  - Run: `pdm run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.

- With Docker Compose (root compose):
  - From repo root: `docker compose up -d python-image-service`.
  - Health check available at `http://localhost:8000/health` (see compose file).

### Deployment (Fargate)

- Container image built from `python/Dockerfile` and pushed to ECR.
- Runs in the same ECS cluster/ALB as `ws-server`, but with its own security group and task definition.
- Task definitions and AWS “describe” metadata JSONs are not committed:
  - `remote/describe/**` is populated by `aws-remote.sh` and gitignored.
  - Keep task definition JSON (with any secrets) out of VCS; prefer IAM roles and secret stores for sensitive values.

### Implementation Notes

- Image generation is a placeholder (`Pillow`) in `app/inference.py`; replace with your actual model/provider.
- S3 uploads and presign are handled in `app/storage.py` using `boto3` and Pydantic settings.
- API surface is defined in `app/api.py`, wired in `app/main.py`.
