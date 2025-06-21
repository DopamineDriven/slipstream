# syntax=docker/dockerfile:1.4
FROM python:3.13.5-slim AS base

RUN groupadd --system appgroup && useradd --system --gid appgroup --create-home appuser

WORKDIR /app

# Install system dependencies
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      gcc \
      libffi-dev \
      libjpeg-dev \
      libpng-dev \
 && rm -rf /var/lib/apt/lists/*

ARG PDM_VERSION=2.24.2

RUN --mount=type=cache,id=python-pip,target=/root/.cache/pip \
    --mount=type=cache,id=pdm,target=/root/.cache/pdm \
    pip install --no-cache-dir "pdm==${PDM_VERSION}"

COPY pyproject.toml pdm.lock ./
RUN --mount=type=cache,id=pdm,target=/root/.cache/pdm \
    pdm sync --prod
COPY . .

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

ENV PORT=8000
EXPOSE 8000
CMD ["pdm", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
