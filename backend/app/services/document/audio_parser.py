"""Audio Parser - Transcribe audio files using Fireworks whisper-v3-turbo (Batch API)."""

import os
import tempfile
import logging

import httpx

logger = logging.getLogger(__name__)

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY", "")
FIREWORKS_ACCOUNT_ID = os.getenv("FIREWORKS_ACCOUNT_ID", "")

# Sync (realtime) endpoint — kept as fallback
FIREWORKS_WHISPER_URL = "https://audio-turbo.api.fireworks.ai/v1/audio/transcriptions"
FIREWORKS_WHISPER_MODEL = "accounts/fireworks/models/whisper-v3-turbo"

# Batch endpoint (40% cheaper, async processing)
FIREWORKS_BATCH_URL = "https://audio-batch.api.fireworks.ai"


class AudioParser:
    """Parse audio files using Fireworks whisper-v3-turbo API."""

    SUPPORTED_TYPES = {
        "audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/x-m4a",
        "audio/mp3", "audio/x-wav", "audio/x-flac",
    }

    EXTENSION_MAP = {
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "audio/x-flac": ".flac",
        "audio/x-m4a": ".m4a",
    }

    def transcribe(self, content: bytes, mime_type: str) -> str:
        """Transcribe audio content via Fireworks sync API (fallback)."""
        ext = self.EXTENSION_MAP.get(mime_type, ".wav")

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as f:
                resp = httpx.post(
                    FIREWORKS_WHISPER_URL,
                    headers={"Authorization": f"Bearer {FIREWORKS_API_KEY}"},
                    files={"file": (f"audio{ext}", f, mime_type)},
                    data={
                        "model": FIREWORKS_WHISPER_MODEL,
                        "temperature": "0",
                        "vad_model": "silero",
                    },
                    timeout=120.0,
                )
            resp.raise_for_status()
            result = resp.json()
            return result.get("text", "").strip()
        except Exception as e:
            logger.error("Fireworks whisper transcription failed: %s", e)
            return ""
        finally:
            os.unlink(tmp_path)

    def submit_batch(self, content: bytes, mime_type: str, custom_id: str) -> str:
        """Submit audio to Fireworks Batch API. Returns batch_id."""
        ext = self.EXTENSION_MAP.get(mime_type, ".wav")

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as f:
                resp = httpx.post(
                    f"{FIREWORKS_BATCH_URL}/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {FIREWORKS_API_KEY}"},
                    files={"file": (f"audio{ext}", f, mime_type)},
                    data={
                        "model": FIREWORKS_WHISPER_MODEL,
                        "temperature": "0",
                        "vad_model": "silero",
                        "response_format": "json",
                        "custom_id": custom_id,
                    },
                    timeout=60.0,
                )
            resp.raise_for_status()
            result = resp.json()
            batch_id = result.get("batch_id", "")
            logger.info("Batch submitted: custom_id=%s, batch_id=%s", custom_id, batch_id)
            return batch_id
        except Exception as e:
            logger.error("Fireworks batch submit failed: %s", e)
            raise
        finally:
            os.unlink(tmp_path)

    def poll_batch(self, batch_id: str) -> tuple[str, str | None]:
        """Poll Fireworks Batch API for status.

        Returns (status, transcript_text_or_none).
        status is 'processing' or 'completed'.
        """
        account_id = FIREWORKS_ACCOUNT_ID
        url = f"{FIREWORKS_BATCH_URL}/v1/accounts/{account_id}/batch_job/{batch_id}"

        try:
            resp = httpx.get(
                url,
                headers={"Authorization": f"Bearer {FIREWORKS_API_KEY}"},
                timeout=30.0,
            )
            resp.raise_for_status()
            result = resp.json()
            status = result.get("status", "processing")

            if status == "completed":
                # Extract text from body
                body = result.get("body", {})
                if isinstance(body, str):
                    import json
                    try:
                        body = json.loads(body)
                    except Exception:
                        return "completed", body
                text = body.get("text", "") if isinstance(body, dict) else str(body)
                return "completed", text.strip()

            return status, None
        except Exception as e:
            logger.error("Fireworks batch poll failed for %s: %s", batch_id, e)
            return "error", None

    def parse(self, content: bytes, mime_type: str) -> str:
        """Parse audio file -> transcribed text (sync fallback)."""
        text = self.transcribe(content, mime_type)
        if text:
            return f"Audio Transcription:\n{text}"
        return "Audio file (no transcription available)"

    def is_supported(self, mime_type: str) -> bool:
        return mime_type in self.SUPPORTED_TYPES
