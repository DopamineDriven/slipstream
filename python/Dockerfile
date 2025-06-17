FROM python:3.12-slim AS base

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

# Install PDM globally
RUN pip install --no-cache-dir pdm

# Copy only metadata & lock for dependency resolution
COPY pyproject.toml pdm.lock /app/

# Sync production dependencies only
RUN pdm sync --prod

# Copy your actual application code
COPY . /app/

ENV PORT=8000
EXPOSE 8000
CMD ["pdm", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
