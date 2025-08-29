## Python Generative Asset Service

FastAPI microservice for generative asset tasks (image generation and uploads). Deployed to AWS Fargate behind an ALB, consumed by the WS server via `FASTAPI_URL`.

### Endpoints

- `GET /`: Health check → `{ "status": "ok" }`.
- `POST /generate` (JSON): `{ "prompt": string }` → `{ "url": string }`.
  - Generates a PNG (placeholder via PIL here), uploads to S3, returns a presigned download URL.
- `POST /upload` (multipart/form-data): `file` → `{ "filename": string | null, "url": string }`.
  - Streams the file to S3 and returns a presigned download URL.

### Configuration

- `app/config.py` uses Pydantic Settings; `.env` supported in dev.
- Important env vars (names reflect `Settings` fields):
  - `s3_bucket`: destination bucket (e.g., `py-gen-assets-dev`/`py-gen-assets-prod`).
  - `s3_region`: AWS region for S3 client (e.g., `us-east-1`).
  - `s3_presign_ttl_seconds`: presigned URL TTL (default `3600`).
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
