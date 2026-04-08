"""Image Parser - Extract metadata and generate descriptions from images."""

import io
import base64
import httpx
from PIL import Image
from PIL.ExifTags import TAGS

from app.core.config import get_settings
from app.core.settings_manager import DynamicSettings


class ImageParser:
    """Parse images: extract EXIF metadata + generate AI description via Vision API."""

    SUPPORTED_TYPES = {
        "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    }

    def __init__(self, settings: DynamicSettings | None = None):
        env = get_settings()
        # Use separate vision API key if configured, otherwise fall back to chat key
        vision_key = (settings.openrouter_vision_api_key if settings else env.openrouter_vision_api_key)
        chat_key = (settings.openrouter_api_key if settings else env.openrouter_api_key)
        self.api_key = vision_key if vision_key else chat_key
        self.vision_model = (settings.openrouter_vision_model if settings else env.openrouter_vision_model)
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        self.timeout = httpx.Timeout(120.0, connect=10.0)

    def extract_exif(self, content: bytes) -> dict[str, str]:
        """Extract EXIF metadata from image bytes."""
        metadata = {}
        try:
            img = Image.open(io.BytesIO(content))
            metadata["format"] = img.format or "Unknown"
            metadata["size"] = f"{img.width}x{img.height}"
            metadata["mode"] = img.mode

            exif_data = img.getexif()
            if exif_data:
                for tag_id, value in exif_data.items():
                    tag_name = TAGS.get(tag_id, str(tag_id))
                    try:
                        metadata[tag_name] = str(value)
                    except Exception:
                        pass
        except Exception:
            pass
        return metadata

    async def describe_image(self, content: bytes, mime_type: str, usage_out: list | None = None) -> str:
        """Generate image description using Vision API (OpenAI-compatible)."""
        b64_data = base64.b64encode(content).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64_data}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            response = await client.post(
                self.base_url,
                json={
                    "model": self.vision_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Describe this image in detail. Include all visual elements such as main objects, colors, background, text, etc. Respond in Korean.",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {"url": data_url},
                                },
                            ],
                        }
                    ],
                    "max_tokens": 1000,
                },
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            if usage_out is not None:
                usage = data.get("usage")
                if usage:
                    usage_out.append(usage)
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""

    async def parse(self, content: bytes, mime_type: str, usage_out: list | None = None) -> str:
        """Parse image: combine EXIF metadata + AI description."""
        parts = []

        # EXIF metadata
        exif = self.extract_exif(content)
        if exif:
            meta_lines = [f"{k}: {v}" for k, v in exif.items()]
            parts.append("Image Metadata:\n" + "\n".join(meta_lines))

        # AI vision description
        try:
            description = await self.describe_image(content, mime_type, usage_out=usage_out)
            if description:
                parts.append(f"Image Description:\n{description}")
        except Exception as e:
            parts.append(f"Image Description: Failed to generate ({e})")

        return "\n\n".join(parts) if parts else "Image file (no metadata extracted)"

    def is_supported(self, mime_type: str) -> bool:
        return mime_type in self.SUPPORTED_TYPES
