import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def probe_media(path: str) -> Dict[str, Any]:
    if not command_exists("ffprobe"):
        raise RuntimeError("ffprobe is not installed or not available on PATH")

    cmd = [
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {res.stderr.strip()}")

    data = json.loads(res.stdout)
    streams = data.get("streams", [])

    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    duration_sec = None
    if "format" in data and "duration" in data["format"]:
        try:
            duration_sec = float(data["format"]["duration"])
        except (ValueError, TypeError):
            pass

    return {
        "durationSec": duration_sec,
        "hasVideo": video is not None,
        "width": int(video["width"]) if video and "width" in video else None,
        "height": int(video["height"]) if video and "height" in video else None,
        "videoCodec": video.get("codec_name") if video else None,
        "audioCodec": audio.get("codec_name") if audio else None,
    }


def extract_audio(source_path: str, project_dir: Path) -> Path:
    if not command_exists("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not available on PATH")

    os.makedirs(project_dir, exist_ok=True)
    output_path = project_dir / "transcription_audio.wav"

    cmd = [
        "ffmpeg",
        "-y",
        "-i", source_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        str(output_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed: {res.stderr.strip()}")

    return output_path


def format_srt_time(secs: float) -> str:
    hours = int(secs // 3600)
    mins = int((secs % 3600) // 60)
    secs_only = int(secs % 60)
    ms = int((secs - int(secs)) * 1000)
    return f"{hours:02d}:{mins:02d}:{secs_only:02d},{ms:03d}"


def generate_srt(words: List[Dict[str, Any]], start_sec: float, end_sec: float) -> str:
    candidate_words = [w for w in words if w["end"] > start_sec and w["start"] < end_sec]
    lines = []
    index = 1

    # Chunk into 3 words
    for i in range(0, len(candidate_words), 3):
        chunk = candidate_words[i:i+3]
        if not chunk:
            continue
        first = chunk[0]
        last = chunk[-1]
        start_rel = max(0.0, first["start"] - start_sec)
        end_rel = max(0.0, min(end_sec - start_sec, last["end"] - start_sec))
        text = " ".join(w["text"] for w in chunk)

        lines.append(f"{index}")
        lines.append(f"{format_srt_time(start_rel)} --> {format_srt_time(end_rel)}")
        lines.append(f"{text}\n")
        index += 1

    return "\n".join(lines)


def get_font_option() -> str:
    font_paths = [
        "C:/Windows/Fonts/SegoeUIb.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/SegoeUI.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Futura.ttc",
        "/System/Library/Fonts/Avenir Next.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for p in font_paths:
        if os.path.exists(p):
            escaped = p.replace("\\", "/").replace(":", "\\:").replace("'", "'\\''")
            return f"fontfile='{escaped}':"
    return ""


def build_drawtext_filters(
    words: List[Dict[str, Any]],
    start_sec: float,
    end_sec: float,
    cropped_width: int,
    caption_style: str = "modern-box"
) -> str:
    candidate_words = [w for w in words if w["end"] > start_sec and w["start"] < end_sec]
    if not candidate_words:
        return ""

    font_option = get_font_option()
    drawtext_filters = []

    fontsize = max(16, min(80, int(round(cropped_width * 0.075))))
    padding = max(4, min(24, int(round(fontsize * 0.3))))

    # Chunk into 2 words for fast-paced short captions
    for i in range(0, len(candidate_words), 2):
        chunk = candidate_words[i:i+2]
        if not chunk:
            continue
        first = chunk[0]
        last = chunk[-1]
        start_rel = max(0.0, first["start"] - start_sec)
        end_rel = max(0.0, min(end_sec - start_sec, last["end"] - start_sec))
        if end_rel <= start_rel:
            continue

        text = " ".join(w["text"].upper() for w in chunk)
        # Clean text
        clean_text = "".join(c for c in text if c.isalnum() or c in " !?")
        if not clean_text:
            continue

        if caption_style == "classic-outline":
            borderw = max(2, min(8, int(round(fontsize * 0.1))))
            dt = f"drawtext={font_option}text='{clean_text}':x=(w-text_w)/2:y=h*0.65:fontsize={fontsize}:fontcolor=yellow:borderw={borderw}:bordercolor=black:enable='between(t,{start_rel:.3f},{end_rel:.3f})'"
        elif caption_style == "minimal-shadow":
            dt = f"drawtext={font_option}text='{clean_text}':x=(w-text_w)/2:y=h*0.7:fontsize={fontsize}:fontcolor=white:shadowcolor=black@0.5:shadowx=2:shadowy=2:enable='between(t,{start_rel:.3f},{end_rel:.3f})'"
        elif caption_style == "vibrant-cyan":
            dt = f"drawtext={font_option}text='{clean_text}':x=(w-text_w)/2:y=h*0.7:fontsize={fontsize}:fontcolor=0x00FFFF:shadowcolor=black@0.6:shadowx=2:shadowy=2:enable='between(t,{start_rel:.3f},{end_rel:.3f})'"
        elif caption_style == "vibrant-yellow-box":
            dt = f"drawtext={font_option}text='{clean_text}':x=(w-text_w)/2:y=h*0.72:fontsize={fontsize}:fontcolor=black:box=1:boxcolor=0xffff00e0:boxborderw={padding}:enable='between(t,{start_rel:.3f},{end_rel:.3f})'"
        elif caption_style == "vibrant-green":
            borderw = max(2, min(6, int(round(fontsize * 0.08))))
            dt = f"drawtext={font_option}text='{clean_text}':x=(w-text_w)/2:y=h*0.7:fontsize={fontsize}:fontcolor=0x39FF14:borderw={borderw}:bordercolor=black:shadowcolor=black@0.6:shadowx=2:shadowy=2:enable='between(t,{start_rel:.3f},{end_rel:.3f})'"
        elif caption_style == "vibrant-red":
            borderw = max(2, min(6, int(round(fontsize * 0.08))))
            dt = f"drawtext={font_option}text='{clean_text}':x=(w-text_w)/2:y=h*0.7:fontsize={fontsize}:fontcolor=0xFF3B30:borderw={borderw}:bordercolor=black:shadowcolor=black@0.6:shadowx=2:shadowy=2:enable='between(t,{start_rel:.3f},{end_rel:.3f})'"
        else:
            # modern-box default
            dt = f"drawtext={font_option}text='{clean_text}':x=(w-text_w)/2:y=h*0.72:fontsize={fontsize}:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw={padding}:enable='between(t,{start_rel:.3f},{end_rel:.3f})'"

        drawtext_filters.append(dt)

    return ",".join(drawtext_filters)


def render_flat_clip(
    source_path: str,
    start_sec: float,
    end_sec: float,
    output_path: Path,
    drawtext_filters: Optional[str] = None,
    aspect_ratio: str = "9:16"
) -> Path:
    if not command_exists("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not available on PATH")

    os.makedirs(output_path.parent, exist_ok=True)
    start_str = f"{start_sec:.3f}"
    dur_sec = max(0.1, end_sec - start_sec)
    dur_str = f"{dur_sec:.3f}"

    probe = probe_media(source_path)
    has_video = probe.get("hasVideo", False)

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", start_str,
        "-i", source_path,
        "-t", dur_str
    ]

    if has_video:
        filters = []
        if aspect_ratio == "9:16":
            filters.append("crop=w='2*trunc(min(iw,ih*9/16)/2)':h='2*trunc(min(ih,iw*16/9)/2)'")

        if drawtext_filters and drawtext_filters.strip():
            filters.append(drawtext_filters.strip())

        vf = ",".join(filters) if filters else None

        if vf:
            cmd.extend(["-vf", vf])

        cmd.extend([
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p"
        ])
    else:
        cmd.append("-vn")

    cmd.extend([
        "-c:a", "aac",
        "-b:a", "192k",
        str(output_path)
    ])

    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        # Fallback without drawtext if filters caused error
        if drawtext_filters:
            return render_flat_clip(source_path, start_sec, end_sec, output_path, None, aspect_ratio)
        raise RuntimeError(f"ffmpeg clip render failed: {res.stderr.strip()}")

    return output_path


def render_compilation_video(
    source_path: str,
    segments: List[Dict[str, float]],
    output_path: Path,
    aspect_ratio: str = "original"
) -> Path:
    """
    Stitches multiple segments from a single source video into a cohesive summary video.
    Runs 100% in FFmpeg using native hardware or fast libx264 with audio micro-fades.
    Uses 0 VRAM and keeps the original 16:9 aspect ratio (or 9:16 if requested).
    """
    if not command_exists("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not available on PATH")

    if not segments:
        raise ValueError("No segments provided for compilation video")

    os.makedirs(output_path.parent, exist_ok=True)
    probe = probe_media(source_path)
    has_video = probe.get("hasVideo", False)

    script_lines = []
    video_labels = []
    audio_labels = []

    for idx, seg in enumerate(segments):
        start = max(0.0, float(seg["start"]))
        end = max(start + 0.1, float(seg["end"]))
        dur = end - start
        fade_dur = min(0.08, dur / 4.0)

        if has_video:
            script_lines.append(
                f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[v{idx}];"
            )
            video_labels.append(f"[v{idx}]")

        script_lines.append(
            f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:st=0:d={fade_dur:.3f},afade=t=out:st={dur-fade_dur:.3f}:d={fade_dur:.3f}[a{idx}];"
        )
        audio_labels.append(f"[a{idx}]")

    num_seg = len(segments)
    if has_video:
        concat_inputs = "".join(f"{video_labels[i]}{audio_labels[i]}" for i in range(num_seg))
        if aspect_ratio == "9:16":
            script_lines.append(
                f"{concat_inputs}concat=n={num_seg}:v=1:a=1[catv][outa];"
                f"[catv]crop=w='2*trunc(min(iw,ih*9/16)/2)':h='2*trunc(min(ih,iw*16/9)/2)'[outv]"
            )
        else:
            # Original aspect ratio (16:9 standard, zero crop)
            script_lines.append(
                f"{concat_inputs}concat=n={num_seg}:v=1:a=1[outv][outa]"
            )
    else:
        concat_inputs = "".join(audio_labels)
        script_lines.append(f"{concat_inputs}concat=n={num_seg}:v=0:a=1[outa]")

    script_content = "\n".join(script_lines)
    script_path = output_path.parent / f"_temp_filter_{output_path.stem}.txt"

    with open(script_path, "w", encoding="utf-8") as f:
        f.write(script_content)

    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-i", source_path,
            "-filter_complex_script", str(script_path)
        ]

        if has_video:
            cmd.extend([
                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "19",
                "-pix_fmt", "yuv420p"
            ])
        else:
            cmd.extend([
                "-map", "[outa]",
                "-vn"
            ])

        cmd.extend([
            "-c:a", "aac",
            "-b:a", "192k",
            str(output_path)
        ])

        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg compilation render failed: {res.stderr.strip()[:400]}")

        return output_path
    finally:
        if script_path.exists():
            try:
                os.remove(script_path)
            except Exception:
                pass
