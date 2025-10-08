import base64
import io
import tempfile
from typing import Optional, Any
from PIL import Image, ImageDraw
from app.models import GenJobDispatch, ImageGenProviders
from app.config import settings


def generate_image(prompt: str) -> str:
    """
    Backwards-compat helper for the legacy /generate route.
    Returns only the tempfile path string.
    """
    path, _w, _h = generate_image_with_dims(prompt)
    return path


def generate_image_with_dims(prompt: str, width: int = 256, height: int = 256) -> tuple[str, int, int]:
    """
    Generate a simple image preview and return (path, width, height).
    Replace this with real inference logic.
    """
    img = Image.new("RGB", (width, height), color=(73, 109, 137))
    d = ImageDraw.Draw(img)
    d.text((10, int(height / 2) - 8), prompt[:20], fill=(255, 255, 0))
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    img.save(tmp.name, format="PNG")
    tmp.close()
    return tmp.name, width, height


def _generate_preview_with_mime(
    prompt: str, width: int, height: int, mime: Optional[str]
) -> tuple[str, int, int]:
    """
    Local preview generator that respects requested MIME (png/jpeg).
    """
    img = Image.new("RGB", (width, height), color=(73, 109, 137))
    d = ImageDraw.Draw(img)
    d.text((10, int(height / 2) - 8), prompt[:20], fill=(255, 255, 0))
    if mime == "image/jpeg":
        suffix = ".jpg"
        fmt = "JPEG"
    else:
        suffix = ".png"
        fmt = "PNG"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    img.save(tmp.name, format=fmt)
    tmp.close()
    return tmp.name, width, height


def generate_image_for_dispatch(req: GenJobDispatch) -> tuple[str, int, int]:
    """
    Minimal provider switch stub. Uses the provided width/height if present.
    Currently calls the local preview generator for all providers.
    """
    w = req.width or 256
    h = req.height or 256

    # Only call real providers if explicitly enabled.
    if settings.enable_provider_calls:
        if req.provider == ImageGenProviders.openai and settings.enable_openai:
            try:
                return _generate_openai_image(req)
            except Exception:
                # fall back to local preview on any provider failure
                pass
        if req.provider == ImageGenProviders.gemini and settings.enable_gemini:
            try:
                return _generate_gemini_image(req)
            except Exception:
                pass
        if req.provider == ImageGenProviders.grok and settings.enable_xai:
            try:
                return _generate_grok_image(req)
            except Exception:
                pass
        # For grok or others (or if provider disable), fall back to preview

    return _generate_preview_with_mime(req.prompt, w, h, getattr(req, "contentType", None))


def _save_temp_image_bytes(data: bytes, suffix: str = ".png") -> tuple[str, int, int]:
    """
    Save raw image bytes to a temp file and return (path, width, height).
    """
    img = Image.open(io.BytesIO(data))
    width, height = img.size
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    # Ensure we re-encode to match suffix to avoid mismatched headers downstream
    fmt = "PNG" if suffix.lower().endswith(".png") else "JPEG"
    img.save(tmp.name, format=fmt)
    tmp.close()
    return tmp.name, width, height


def _maybe_square_size(w: Optional[int], h: Optional[int]) -> Optional[str]:
    if not w or not h:
        return None
    if w != h:
        return None
    if w in (256, 512, 1024):
        return f"{w}x{h}"
    return None


def _generate_openai_image(req: GenJobDispatch) -> tuple[str, int, int]:
    """
    Generate an image using OpenAI Images API and return temp path + dims.
    """
    # Lazy import to avoid import/typing costs when disabled
    from openai import OpenAI  # type: ignore

    client = OpenAI(api_key=req.auth.apiKey)  # type: ignore[attr-defined]
    size = _maybe_square_size(req.width, req.height)
    kwargs: dict[str, Any] = {
        "model": (req.model.value if hasattr(req.model, "value") else str(req.model)),
        "prompt": req.prompt,
        "response_format": "b64_json",
    }
    if size:
        kwargs["size"] = size

    resp = client.images.generate(**kwargs)  # type: ignore[call-arg]
    # Expect at least one image result
    b64 = resp.data[0].b64_json  # type: ignore[attr-defined]
    data = base64.b64decode(b64)
    suffix = ".jpg" if getattr(req, "contentType", None) == "image/jpeg" else ".png"
    return _save_temp_image_bytes(data, suffix=suffix)


def _generate_gemini_image(req: GenJobDispatch) -> tuple[str, int, int]:
    """
    Generate an image using Google Gemini/Imagen API and return temp path + dims.
    The SDK surface may vary; this uses the google-genai package.
    """
    import google.genai as genai  # type: ignore

    genai.configure(api_key=req.auth.apiKey)  # type: ignore[attr-defined]
    model_name = (req.model.value if hasattr(req.model, "value") else str(req.model))
    model = genai.GenerativeModel(model_name)  # type: ignore[attr-defined]

    # Some models support width/height; if not, omit to use defaults.
    # We attempt a best-effort usage and fall back if unsupported at runtime.
    if req.width and req.height:
        try:
            resp = model.generate_images(
                prompt=req.prompt,
                width=req.width,
                height=req.height,
            )  # type: ignore[call-arg]
        except Exception:
            resp = model.generate_images(prompt=req.prompt)  # type: ignore[call-arg]
    else:
        resp = model.generate_images(prompt=req.prompt)  # type: ignore[call-arg]

    # Extract first image bytes; attribute names can differ by SDK version,
    # so we try a few common fields with a conservative fallback.
    img0 = resp.images[0]  # type: ignore[attr-defined]
    data: Optional[bytes] = None
    for attr in ("image_bytes", "bytes", "data", "content"):
        val = getattr(img0, attr, None)
        if isinstance(val, (bytes, bytearray)):
            data = bytes(val)
            break
    if data is None:
        # Some SDKs expose base64 data
        for attr in ("base64_data", "b64_data", "b64_json"):
            val = getattr(img0, attr, None)
            if isinstance(val, str):
                try:
                    data = base64.b64decode(val)
                    break
                except Exception:
                    pass
    if data is None:
        # Last resort: render a local preview
        return generate_image_with_dims(req.prompt, width=req.width or 256, height=req.height or 256)

    suffix = ".jpg" if getattr(req, "contentType", None) == "image/jpeg" else ".png"
    return _save_temp_image_bytes(data, suffix=suffix)


def _generate_grok_image(req: GenJobDispatch) -> tuple[str, int, int]:
    """
    Generate an image using xai_sdk (Grok image) and return temp path + dims.
    Uses base64 format to avoid an extra fetch.
    """
    # Lazy import to avoid hard dependency unless enabled
    try:
        from xai_sdk import Client  # type: ignore
    except Exception as e:  # pragma: no cover - import error path
        raise e

    client = Client(api_key=req.auth.apiKey)  # type: ignore[attr-defined]
    model_name = (req.model.value if hasattr(req.model, "value") else str(req.model))

    # Prefer base64 to get raw bytes directly
    resp = client.image.sample(
        model=model_name,
        prompt=req.prompt,
        image_format="base64",
    )

    # Try direct bytes attribute
    data: Optional[bytes] = getattr(resp, "image", None)
    if isinstance(data, bytearray):
        data = bytes(data)

    # Alternative: OpenAI-like shape: { data: [ { b64_json: "data:image/png;base64,..." } ] }
    if data is None and hasattr(resp, "data"):
        try:
            first = resp.data[0]
            b64 = getattr(first, "b64_json", None) or first.get("b64_json")  # type: ignore[attr-defined]
            if isinstance(b64, str):
                # Strip data URI prefix if present
                if "," in b64 and b64.lower().startswith("data:image"):
                    b64 = b64.split(",", 1)[1]
                data = base64.b64decode(b64)
        except Exception:
            data = None

    if not data:
        # Fallback: use local preview
        return _generate_preview_with_mime(
            req.prompt, req.width or 256, req.height or 256, getattr(req, "contentType", None)
        )

    suffix = ".jpg" if getattr(req, "contentType", None) == "image/jpeg" else ".png"
    return _save_temp_image_bytes(data, suffix=suffix)
