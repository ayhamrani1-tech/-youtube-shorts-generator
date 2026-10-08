"""Get a finished video into Discord within the attachment limit.

* File fits → send it as is.
* Too big → make a smaller *preview* copy (lower bitrate, 720p) sized to fit, and say that the full-quality
  file stays on the studio PC. The original is never modified.
* Even the preview cannot fit (very long video) → send nothing, just the message.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import ROOT

FFMPEG = ROOT / "tools" / "ffmpeg-9.0.2-essentials_build" / "bin" / "ffmpeg.exe"
FFPROBE = FFMPEG.with_name("ffprobe.exe")


@dataclass
class Delivery:
    file: Path | None      # what to attach (None = nothing)
    note: str              # message for Discord (never contains local paths)
    is_preview: bool = False


def probe_duration(video: Path) -> float:
    out = subprocess.run([str(FFPROBE), "-v", "error", "-show_entries", "format=duration", "-of", "json", str(video)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def preview_bitrate_kbps(limit_mb: float, seconds: float, audio_kbps: int = 96) -> int:
    """Video bitrate that keeps the whole file under the limit (8 % safety margin for container overhead)."""
    total_kbps = limit_mb * 8 * 1024 * 0.92 / max(seconds, 1)
    return int(total_kbps - audio_kbps)


def plan_delivery(video: Path, limit_mb: float, make_preview=None) -> Delivery:
    size_mb = video.stat().st_size / (1024 * 1024)
    if size_mb <= limit_mb:
        return Delivery(video, f"Video ready ({size_mb:.1f} MB).")
    seconds = probe_duration(video)
    kbps = preview_bitrate_kbps(limit_mb, seconds)
    if kbps < 250:  # too long for a watchable preview under this limit
        return Delivery(None, f"The video is {size_mb:.0f} MB and {seconds / 60:.0f} min long, too large for Discord. "
                              "It is saved on the studio PC (out/ folder).")
    preview = video.with_name(video.stem + ".discord-preview.mp4")
    (make_preview or make_preview_file)(video, preview, kbps)
    return Delivery(preview, f"Full video is {size_mb:.0f} MB (over the {limit_mb:g} MB limit). "
                             "Here is a smaller preview; the full-quality file is saved on the studio PC.", True)


def make_preview_file(src: Path, dst: Path, video_kbps: int) -> None:
    scale = "scale='if(gt(iw,ih),1280,720)':-2"
    subprocess.run([str(FFMPEG), "-y", "-v", "error", "-i", str(src), "-vf", scale, "-c:v", "libx264", "-preset", "medium",
                    "-b:v", f"{video_kbps}k", "-maxrate", f"{int(video_kbps * 1.2)}k", "-bufsize", f"{video_kbps * 2}k",
                    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dst)], check=True)
