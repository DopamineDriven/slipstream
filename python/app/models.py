from pydantic import BaseModel
from typing import Literal, Optional, Union
from enum import Enum


class ModelType(str, Enum):
    OPENAI = "openai"
    GEMINI = "gemini"


class ImageStatus(str, Enum):
    ok = "ok"
    error = "error"
    progress = "progress"
    cancelled = "cancelled"


class GenRequest(BaseModel):
    prompt: str


class GenResponse(BaseModel):
    url: str


class UploadResponse(BaseModel):
    filename: Optional[str]
    url: str


class BaseImageResponse(BaseModel):
    status: ImageStatus = ImageStatus.ok

    track_id: Optional[str] = None
    url: Optional[str] = None


class AdvancedImageGenerationRequestOptions(BaseModel):
    negative_prompt: Union[str, None] = None
    sampler: Union[Literal["k_euler_ancestral"], None] = "k_euler_ancestral"


class ImageGenerationRequest(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg_scale: float = 7.0
    seed: Optional[int] = None
    model: Union[Literal["stable-diffusion-v1-4"], str] = "stable-diffusion-v1-4"
    webhook: Optional[str] = None
    track_id: Optional[str] = None
    options: AdvancedImageGenerationRequestOptions = (
        AdvancedImageGenerationRequestOptions()
    )


class ImageGenerationResponse(BaseImageResponse):
    status: ImageStatus = ImageStatus.ok
    url: Optional[str] = None
    message: Optional[str] = None


class ImageGenerationErrorResponse(BaseImageResponse):
    status: ImageStatus = ImageStatus.error
    message: str


class ImageGenerationProgressResponse(BaseImageResponse):
    status: ImageStatus = ImageStatus.progress
    progress: int
    message: Optional[str] = None


class CancelRequest(BaseModel):
    track_id: str


class CancelResponse(BaseImageResponse):
    status: ImageStatus = ImageStatus.cancelled
    message: Optional[str] = "Image generation cancelled successfully"
