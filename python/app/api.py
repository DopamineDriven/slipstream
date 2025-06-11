# app/api.py

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

router = APIRouter()

class GenRequest(BaseModel):
    prompt: str

@router.post("/generate")
async def generate(req: GenRequest):
    # Insert model inference call (or fake for demo)
    url = "https://your-r2-bucket/path/to/generated.png"
    return {"url": url}

@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    # You could stream this to R2 using boto3
    return {"filename": file.filename}