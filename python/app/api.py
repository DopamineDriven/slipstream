from fastapi import APIRouter, UploadFile, File
from app.models import GenRequest, GenResponse, UploadResponse
from app.inference import generate_image
from app.storage import upload_fileobj
import os

router = APIRouter()


@router.post("/generate", response_model=GenResponse)
async def generate(req: GenRequest):
    # Generate image file (blocking for now)
    image_path = generate_image(req.prompt)
    with open(image_path, "rb") as f:
        url = upload_fileobj(f, os.path.basename(image_path), "image/png")
    os.remove(image_path)
    return {"url": url}


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    url = upload_fileobj(file.file, file.filename, file.content_type)
    return UploadResponse(filename=file.filename, url=url)
