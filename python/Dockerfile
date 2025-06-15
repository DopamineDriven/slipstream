# Use official Python slim image
FROM python:3.12-slim AS base

# Set working directory
WORKDIR /app

# Copy only requirements first (for Docker layer caching)
COPY python/requirements.txt ./

# Install system dependencies for science, image gen, etc.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential gcc libffi-dev libjpeg-dev libpng-dev && \
    pip install --upgrade pip && \
    pip install -r requirements.txt && \
    rm -rf /var/lib/apt/lists/*

# Copy the rest of your python service
COPY python/ .

# For production, run with uvicorn directly. Replace "app.api:app" with your actual module:app path
ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
