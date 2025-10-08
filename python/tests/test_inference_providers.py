import base64
import io
import types
from types import SimpleNamespace
from PIL import Image
import pytest

from app.inference import generate_image_for_dispatch
from app.models import (
    GenJobDispatch,
    AuthServer,
    ImageGenProviders,
    OpenAIModels,
    GeminiModels,
)
from app.config import settings


def _make_png_bytes(w: int = 8, h: int = 8) -> bytes:
    img = Image.new("RGB", (w, h), color=(10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _dispatch_openai(prompt: str = "hi", w: int | None = 16, h: int | None = 16) -> GenJobDispatch:
    return GenJobDispatch(
        auth=AuthServer(kind="server", provider=ImageGenProviders.openai, apiKey="k"),
        jobId="j1",
        userId="u1",
        conversationId="c1",
        provider=ImageGenProviders.openai,
        model=OpenAIModels.gpt_image_1,
        prompt=prompt,
        width=w,
        height=h,
        contentType="image/png",
    )


def _dispatch_gemini(prompt: str = "hi", w: int | None = 12, h: int | None = 12) -> GenJobDispatch:
    return GenJobDispatch(
        auth=AuthServer(kind="server", provider=ImageGenProviders.gemini, apiKey="k"),
        jobId="j2",
        userId="u2",
        conversationId="c2",
        provider=ImageGenProviders.gemini,
        model=GeminiModels.gemini_flash_image,
        prompt=prompt,
        width=w,
        height=h,
        contentType="image/png",
    )


def _dispatch_grok(prompt: str = "hi", w: int | None = 14, h: int | None = 14) -> GenJobDispatch:
    from app.models import GrokModels

    return GenJobDispatch(
        auth=AuthServer(kind="server", provider=ImageGenProviders.grok, apiKey="k"),
        jobId="j3",
        userId="u3",
        conversationId="c3",
        provider=ImageGenProviders.grok,
        model=GrokModels.grok_2_image_1212,
        prompt=prompt,
        width=w,
        height=h,
        contentType="image/png",
    )


@pytest.mark.parametrize("enable_calls, enable_openai", [(True, True), (True, False), (False, True)])
def test_openai_provider_path(monkeypatch, enable_calls, enable_openai):
    # toggles
    settings.enable_provider_calls = enable_calls
    settings.enable_openai = enable_openai

    # fake openai module
    png = _make_png_bytes(10, 10)
    b64 = base64.b64encode(png).decode("utf-8")

    class _Images:
        def generate(self, **kwargs):  # pragma: no cover - simple stub
            return SimpleNamespace(data=[SimpleNamespace(b64_json=b64)])

    class _OpenAI:
        def __init__(self, api_key):
            self.images = _Images()

    fake_mod = types.ModuleType("openai")
    setattr(fake_mod, "OpenAI", _OpenAI)
    monkeypatch.setitem(__import__("sys").modules, "openai", fake_mod)

    req = _dispatch_openai()
    path, w, h = generate_image_for_dispatch(req)

    # When calls are enabled for openai, width/height come from PNG (10x10);
    # otherwise from preview (requested 16x16)
    if enable_calls and enable_openai:
        assert (w, h) == (10, 10)
    else:
        assert (w, h) == (req.width or 256, req.height or 256)


@pytest.mark.parametrize("enable_calls, enable_gemini", [(True, True), (True, False), (False, True)])
def test_gemini_provider_path(monkeypatch, enable_calls, enable_gemini):
    # toggles
    settings.enable_provider_calls = enable_calls
    settings.enable_gemini = enable_gemini

    # fake google.genai module
    png = _make_png_bytes(12, 12)

    class _Resp:
        def __init__(self, data: bytes):
            self.images = [SimpleNamespace(bytes=data)]

    class _Model:
        def __init__(self, name):
            self.name = name

        def generate_images(self, **kwargs):  # pragma: no cover - simple stub
            return _Resp(png)

    fake_genai = types.ModuleType("genai")
    def _configure(api_key):  # pragma: no cover
        return None
    setattr(fake_genai, "configure", _configure)
    setattr(fake_genai, "GenerativeModel", _Model)

    fake_google = types.ModuleType("google")
    monkeypatch.setattr(fake_google, "genai", fake_genai)

    # install both packages in sys.modules
    monkeypatch.setitem(__import__("sys").modules, "google", fake_google)
    monkeypatch.setitem(__import__("sys").modules, "google.genai", fake_genai)

    req = _dispatch_gemini()
    path, w, h = generate_image_for_dispatch(req)

    if enable_calls and enable_gemini:
        assert (w, h) == (12, 12)
    else:
        assert (w, h) == (req.width or 256, req.height or 256)


@pytest.mark.parametrize("enable_calls, enable_xai", [(True, True), (True, False), (False, True)])
def test_grok_provider_path(monkeypatch, enable_calls, enable_xai):
    # toggles
    settings.enable_provider_calls = enable_calls
    settings.enable_xai = enable_xai

    # fake xai_sdk module
    png = _make_png_bytes(14, 14)

    class _Resp:
        def __init__(self, data: bytes):
            self.image = data

    class _Image:
        def sample(self, **kwargs):  # pragma: no cover - simple stub
            return _Resp(png)

    class _Client:
        def __init__(self, api_key):
            self.image = _Image()

    fake_mod = types.ModuleType("xai_sdk")
    setattr(fake_mod, "Client", _Client)
    monkeypatch.setitem(__import__("sys").modules, "xai_sdk", fake_mod)

    req = _dispatch_grok()
    path, w, h = generate_image_for_dispatch(req)

    if enable_calls and enable_xai:
        assert (w, h) == (14, 14)
    else:
        assert (w, h) == (req.width or 256, req.height or 256)
