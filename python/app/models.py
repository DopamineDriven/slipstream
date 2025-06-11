from pydantic import BaseModel

class GenRequest(BaseModel):
    prompt: str

class GenResponse(BaseModel):
    url: str

class UploadResponse(BaseModel):
    filename: str | None
    url: str
