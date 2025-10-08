from pydantic import BaseModel, Field, model_validator
from typing import Annotated, Literal, Optional, Union
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


# v2 models for generated asset integration with S3 + WS

class GenJobRequest(BaseModel):
    """
    Rich generation request that carries the context needed by the
    ws-server to reconcile the asset with the chat UI after upload.
    """
    prompt: str
    userId: str
    conversationId: str
    draftId: str
    batchId: str
    filename: str = "generated.png"
    contentType: str = "image/png"


class GenJobResult(BaseModel):
    bucket: str
    key: str
    versionId: str
    s3ObjectId: str
    publicUrl: str
    cdnUrl: str
    etag: Optional[str] = None
    size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None


# v2: strongly-typed provider/auth dispatch for stateless BYOK

class ImageGenProviders(str, Enum):
    openai = "openai"
    gemini = "gemini"
    grok = "grok"


class OpenAIModels(str, Enum):
    gpt_image_1 = "gpt-image-1"
    dall_e_2 = "dall-e-2"
    dall_e_3 = "dall-e-3"


class GeminiModels(str, Enum):
    gemini_flash_image = "gemini-2.0-flash-preview-image-generation"
    imagen_3_generate_002 = "imagen-3.0-generate-002"
    imagen_4_fast_generate_001 = "imagen-4.0-fast-generate-001"
    imagen_4_generate_001 = "imagen-4.0-generate-001"
    imagen_4_ultra_generate_001 = "imagen-4.0-ultra-generate-001"


class GrokModels(str, Enum):
    grok_2_image_1212 = "grok-2-image-1212"
    grok_2_image = "grok-2-image"


ImageGenModel = Union[OpenAIModels, GeminiModels, GrokModels]


class AuthServer(BaseModel):
    kind: Literal["server"]
    provider: ImageGenProviders
    apiKey: str


class AuthUser(BaseModel):
    kind: Literal["user"]
    provider: ImageGenProviders
    apiKey: str


Auth = Annotated[Union[AuthServer, AuthUser], Field(discriminator="kind")]


ImageMime = Literal["image/png", "image/jpeg"]


# Provider → allowed models map (mirrors ws-server)
PROVIDER_MODEL_IMAGE_GEN_API: dict[ImageGenProviders, set[str]] = {
    ImageGenProviders.openai: {
        OpenAIModels.gpt_image_1.value,
        OpenAIModels.dall_e_2.value,
        OpenAIModels.dall_e_3.value,
    },
    ImageGenProviders.gemini: {
        GeminiModels.gemini_flash_image.value,
        GeminiModels.imagen_3_generate_002.value,
        GeminiModels.imagen_4_fast_generate_001.value,
        GeminiModels.imagen_4_generate_001.value,
        GeminiModels.imagen_4_ultra_generate_001.value,
    },
    ImageGenProviders.grok: {
        GrokModels.grok_2_image_1212.value,
        GrokModels.grok_2_image.value,
    },
}


class GenJobDispatch(BaseModel):
    """
    Enhanced stateless generation request. Provider/model constrained; BYOK via 'auth'.
    """

    # auth is a discriminated union (server|user)
    auth: Auth

    # orchestration/traceability
    jobId: str
    correlationId: Optional[str] = None

    # identity + reconciliation context
    userId: str
    conversationId: str
    draftId: Optional[str] = None
    batchId: Optional[str] = None

    # provider routing + capability gating
    provider: ImageGenProviders
    model: ImageGenModel

    # generation params
    prompt: str
    filename: str = "generated.jpg"
    contentType: ImageMime = "image/jpeg"
    width: Optional[int] = None
    height: Optional[int] = None
    seed: Optional[int] = None
    negativePrompt: Optional[str] = None
    steps: Optional[int] = None
    guidanceScale: Optional[float] = None

    # enforce provider ↔ model consistency and auth.provider alignment
    @model_validator(mode="after")
    def _validate_provider_model(self) -> "GenJobDispatch":
        # auth provider must match top-level provider
        if self.auth.provider != self.provider:
            raise ValueError("auth.provider must match provider")
        # model must be in provider's allowed set
        allowed = PROVIDER_MODEL_IMAGE_GEN_API.get(self.provider, set())
        model_value = (
            self.model.value if isinstance(self.model, Enum) else str(self.model)
        )
        if model_value not in allowed:
            raise ValueError(
                f"model '{model_value}' is not valid for provider '{self.provider.value}'"
            )
        return self
