"""Video Parser - Extract metadata from video files."""

import json
import subprocess
import tempfile
import os


class VideoParser:
    """Parse video files: extract metadata using ffprobe."""

    SUPPORTED_TYPES = {
        "video/mp4", "video/x-msvideo", "video/x-matroska", "video/webm",
        "video/avi", "video/mkv",
    }

    EXTENSION_MAP = {
        "video/mp4": ".mp4",
        "video/x-msvideo": ".avi",
        "video/avi": ".avi",
        "video/x-matroska": ".mkv",
        "video/mkv": ".mkv",
        "video/webm": ".webm",
    }

    def extract_metadata(self, content: bytes, mime_type: str) -> dict:
        """Extract video metadata using ffprobe."""
        ext = self.EXTENSION_MAP.get(mime_type, ".mp4")

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                [
                    "ffprobe", "-v", "quiet",
                    "-print_format", "json",
                    "-show_format", "-show_streams",
                    tmp_path,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                return json.loads(result.stdout)
            return {}
        except Exception:
            return {}
        finally:
            os.unlink(tmp_path)

    def parse(self, content: bytes, mime_type: str) -> str:
        """Parse video file → metadata text."""
        metadata = self.extract_metadata(content, mime_type)
        if not metadata:
            return "Video file (no metadata extracted)"

        parts = ["Video Metadata:"]

        # Format info
        fmt = metadata.get("format", {})
        if fmt:
            duration = fmt.get("duration")
            if duration:
                secs = float(duration)
                mins, secs = divmod(int(secs), 60)
                hrs, mins = divmod(mins, 60)
                parts.append(f"Duration: {hrs:02d}:{mins:02d}:{secs:02d}")
            if fmt.get("format_long_name"):
                parts.append(f"Format: {fmt['format_long_name']}")
            if fmt.get("bit_rate"):
                parts.append(f"Bitrate: {int(fmt['bit_rate']) // 1000} kbps")

        # Stream info
        for stream in metadata.get("streams", []):
            codec_type = stream.get("codec_type", "unknown")
            if codec_type == "video":
                w = stream.get("width", "?")
                h = stream.get("height", "?")
                fps = stream.get("r_frame_rate", "?")
                codec = stream.get("codec_name", "?")
                parts.append(f"Video: {w}x{h}, {codec}, {fps} fps")
            elif codec_type == "audio":
                codec = stream.get("codec_name", "?")
                sr = stream.get("sample_rate", "?")
                ch = stream.get("channels", "?")
                parts.append(f"Audio: {codec}, {sr} Hz, {ch} ch")

        return "\n".join(parts)

    def is_supported(self, mime_type: str) -> bool:
        return mime_type in self.SUPPORTED_TYPES
