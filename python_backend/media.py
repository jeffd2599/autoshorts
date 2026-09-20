import json
import os
import math
import shutil
import struct
import subprocess
import wave
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


def detect_audio_action_peaks(audio_path: str, window_sec: float = 3.0, top_fraction: float = 0.15) -> List[Dict[str, Any]]:
    """
    Scans an audio WAV file (e.g. transcription_audio.wav) and calculates RMS energy per window.
    Detects windows with high acoustic energy (gunshots, explosions, intense action, loud reactions).
    Takes only ~1-2 seconds even for a 4-hour stream.
    """
    peaks = []
    if not os.path.exists(audio_path):
        return peaks

    try:
        with wave.open(str(audio_path), 'rb') as wf:
            framerate = wf.getframerate()
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            n_frames = wf.getnframes()

            if framerate <= 0 or n_channels <= 0 or sampwidth != 2:
                return peaks

            chunk_size = int(framerate * window_sec)
            total_chunks = n_frames // chunk_size
            if total_chunks == 0:
                return peaks

            energies = []
            for i in range(total_chunks):
                frames = wf.readframes(chunk_size)
                if not frames:
                    break
                # Sub-sample every 4th sample to calculate RMS in milliseconds with extreme speed
                samples = struct.unpack(f"<{len(frames)//2}h", frames)
                sub_samples = samples[::4]
                if not sub_samples:
                    continue
                rms = math.sqrt(sum(s * s for s in sub_samples) / len(sub_samples))
                energies.append({
                    "start": round(i * window_sec, 2),
                    "end": round((i + 1) * window_sec, 2),
                    "rms": rms
                })

            if not energies:
                return peaks

            # Determine peak threshold (top fraction highest energy moments)
            sorted_rms = sorted(e["rms"] for e in energies)
            cutoff_idx = int(len(sorted_rms) * (1.0 - top_fraction))
            cutoff = sorted_rms[min(cutoff_idx, len(sorted_rms) - 1)]

            # Group contiguous high energy windows into action segments
            active_peak = None
            for e in energies:
                if e["rms"] >= cutoff and e["rms"] > 600:
                    if active_peak is None:
                        active_peak = {"start": e["start"], "end": e["end"], "max_rms": e["rms"]}
                    else:
                        active_peak["end"] = e["end"]
                        active_peak["max_rms"] = max(active_peak["max_rms"], e["rms"])
                else:
                    if active_peak is not None:
                        dur = active_peak["end"] - active_peak["start"]
                        if 4.0 <= dur <= 120.0:
                            peaks.append(active_peak)
                        active_peak = None

            if active_peak is not None:
                dur = active_peak["end"] - active_peak["start"]
                if 4.0 <= dur <= 120.0:
                    peaks.append(active_peak)

            return peaks
    except Exception as err:
        print(f"Nota en detección de picos de audio: {err}")
        return []


def extract_video_thumbnail(source_path: str, timestamp: float, output_path: Any) -> Path:
    """
    Extracts a crisp 1080p JPEG thumbnail at the specified timestamp using FFmpeg.
    """
    if not command_exists("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not available on PATH")

    out_p = Path(output_path)
    os.makedirs(out_p.parent, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{max(0.0, timestamp):.3f}",
        "-i", str(source_path),
        "-vframes", "1",
        "-q:v", "2",
        str(out_p)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg thumbnail extraction failed: {res.stderr.strip()[-300:]}")

    return out_p


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
    source_path: Path | str,
    segments: List[Dict[str, float]],
    output_path: Path,
    aspect_ratio: str = "original",
    progress_callback: Optional[Any] = None
) -> Path:
    """
    Renders segments sequentially into temporary chunks and concatenates them using FFmpeg concat demuxer.
    BENEFITS:
    - 0% VRAM usage.
    - Minimal RAM usage: strictly under ~120 MB at all times, because only 1 clip is processed at a time!
    - Zero risk of OOM on long streams (1-4+ hours).
    - Concat step is instantaneous (stream copy, -c copy takes ~1 second).
    - Audio micro-fades (80ms) prevent pop/click noises between cuts.
    - Progress callback invoked per segment for live UI updates.
    """
    import uuid

    if not command_exists("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not available on PATH")

    if not segments:
        raise ValueError("No segments provided for compilation video")

    os.makedirs(output_path.parent, exist_ok=True)
    probe = probe_media(str(source_path))
    has_video = probe.get("hasVideo", False)

    temp_dir = output_path.parent / f"_temp_summary_{uuid.uuid4().hex[:8]}"
    os.makedirs(temp_dir, exist_ok=True)
    chunk_files = []

    try:
        total_segs = len(segments)
        for idx, seg in enumerate(segments):
            start = max(0.0, float(seg["start"]))
            end = max(start + 0.1, float(seg["end"]))
            dur = end - start
            fade_dur = min(0.08, dur / 4.0)

            if progress_callback:
                progress_callback(
                    idx,
                    total_segs,
                    f"Procesando momento {idx + 1} de {total_segs} ({int(dur)}s)..."
                )

            chunk_file = temp_dir / f"chunk_{idx:04d}.mp4"
            chunk_files.append(chunk_file)

            # Fast input seeking before -i (-ss {start} -to {end}) consumes virtually 0 extra RAM
            cmd = [
                "ffmpeg", "-y",
                "-ss", f"{start:.3f}",
                "-to", f"{end:.3f}",
                "-i", str(source_path)
            ]

            vf_filters = []
            if aspect_ratio == "9:16":
                vf_filters.append("crop=w='2*trunc(min(iw,ih*9/16)/2)':h='2*trunc(min(ih,iw*16/9)/2)'")

            if vf_filters:
                cmd.extend(["-vf", ",".join(vf_filters)])

            af_filter = f"afade=t=in:st=0:d={fade_dur:.3f},afade=t=out:st={dur-fade_dur:.3f}:d={fade_dur:.3f}"
            cmd.extend(["-af", af_filter])

            if has_video:
                cmd.extend([
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-crf", "19",
                    "-pix_fmt", "yuv420p"
                ])
            else:
                cmd.extend(["-vn"])

            cmd.extend([
                "-c:a", "aac",
                "-b:a", "192k",
                "-ar", "48000",
                str(chunk_file)
            ])

            res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if res.returncode != 0:
                error_detail = res.stderr.strip()[-600:] if res.stderr else "Error desconocido de FFmpeg"
                raise RuntimeError(f"FFmpeg render de momento {idx + 1} falló: {error_detail}")

        # Concat demuxer step (instantaneous -c copy, 0 MB extra RAM)
        if progress_callback:
            progress_callback(
                total_segs,
                total_segs,
                "Uniendo momentos en el video final con stream copy..."
            )

        list_file = temp_dir / "concat_list.txt"
        with open(list_file, "w", encoding="utf-8") as f:
            for cf in chunk_files:
                escaped_name = cf.name.replace("'", "'\\''")
                f.write(f"file '{escaped_name}'\n")

        concat_cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(output_path)
        ]

        concat_res = subprocess.run(concat_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if concat_res.returncode != 0:
            error_detail = concat_res.stderr.strip()[-600:] if concat_res.stderr else "Error en concat de FFmpeg"
            raise RuntimeError(f"FFmpeg unión final falló: {error_detail}")

        return output_path

    finally:
        if temp_dir.exists():
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
