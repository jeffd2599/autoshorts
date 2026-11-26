import json
import os
import math
import re
import shutil
import struct
import subprocess
import tempfile
import threading
import time
import wave
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from .paths import get_ffmpeg_path, get_ffprobe_path, get_no_window_kwargs
from .logger import log_buffer


def make_even(val: Any) -> int:
    """Garantiza dimensiones pares estrictas >= 2 para compatibilidad yuv420p."""
    try:
        return max(2, (int(round(float(val))) // 2) * 2)
    except Exception:
        return 2


def make_even_coord(val: Any) -> int:
    """Garantiza coordenadas pares >= 0 para overlays yuv420p en FFmpeg."""
    try:
        return max(0, (int(round(float(val))) // 2) * 2)
    except Exception:
        return 0


def parse_progress_time_sec(line: str) -> Optional[float]:
    """Parsea líneas de telemetría de FFmpeg (-progress pipe:1) y retorna el tiempo actual en segundos."""
    line = line.strip()
    if not line or "=" not in line:
        return None
    k, v = line.split("=", 1)
    k = k.strip()
    v = v.strip()
    if k in ("out_time_us", "out_time_ms"):
        try:
            return max(0.0, float(v) / 1_000_000.0)
        except Exception:
            return None
    elif k == "out_time":
        try:
            parts = v.split(":")
            if len(parts) == 3:
                h = float(parts[0])
                m = float(parts[1])
                s = float(parts[2])
                return max(0.0, h * 3600.0 + m * 60.0 + s)
        except Exception:
            return None
    return None


_active_render_lock = threading.Lock()
_active_render_process: Optional[subprocess.Popen] = None
_active_render_cancelled: bool = False


def cancel_active_render() -> bool:
    """Cancela atómicamente el subproceso de renderizado activo de FFmpeg sin carreras de PIDs en Windows."""
    global _active_render_process, _active_render_cancelled
    with _active_render_lock:
        if _active_render_process is None:
            return False
        proc = _active_render_process
        _active_render_cancelled = True
        if proc.poll() is not None:
            _active_render_process = None
            return False
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    capture_output=True,
                    **get_no_window_kwargs()
                )
            proc.kill()
        except Exception as e:
            log_buffer.push(f"[Cancel Render] Advertencia al terminar proceso: {e}")
        finally:
            try:
                proc.wait(timeout=2.0)
            except Exception:
                pass
            _active_render_process = None
        return True


def _run_ffmpeg_monitored(
    cmd: List[str],
    dur_sec: float,
    progress_callback: Optional[Callable[[int, str], None]],
    base_pct: int,
    pct_weight: int,
    stage_name: str,
    output_path: Optional[Path] = None,
) -> None:
    """Ejecuta FFmpeg con -progress pipe:1, drenando continuamente stdout y stderr para evitar deadlocks en Windows."""
    global _active_render_process, _active_render_cancelled

    full_cmd = list(cmd)
    if "-progress" not in full_cmd:
        full_cmd.extend(["-progress", "pipe:1"])

    with _active_render_lock:
        _active_render_cancelled = False
        proc = subprocess.Popen(
            full_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            **get_no_window_kwargs()
        )
        _active_render_process = proc

    stderr_lines: List[str] = []

    def _drain_stderr(pipe):
        try:
            for l in pipe:
                stderr_lines.append(l)
                if len(stderr_lines) > 60:
                    stderr_lines.pop(0)
        except Exception:
            pass

    err_thread = threading.Thread(target=_drain_stderr, args=(proc.stderr,), daemon=True)
    err_thread.start()

    last_pct = base_pct
    try:
        while True:
            line = proc.stdout.readline()
            if not line:
                if proc.poll() is not None:
                    break
                time.sleep(0.01)
            if line:
                t_sec = parse_progress_time_sec(line)
                if t_sec is not None and dur_sec > 0:
                    pct = min(base_pct + pct_weight, base_pct + int((t_sec / dur_sec) * pct_weight))
                    if pct > last_pct:
                        last_pct = pct
                        if progress_callback:
                            try:
                                progress_callback(pct, stage_name)
                            except Exception:
                                pass
    finally:
        err_thread.join(timeout=1.0)
        with _active_render_lock:
            _active_render_process = None

    if _active_render_cancelled:
        if output_path and output_path.exists():
            try:
                output_path.unlink(missing_ok=True)
            except Exception:
                pass
        raise InterruptedError("Exportación cancelada por el usuario.")

    if proc.returncode != 0:
        err_msg = "".join(stderr_lines[-20:]).strip() or f"Código de error {proc.returncode}"
        log_buffer.push(f"[FFmpeg ERROR] Error en {stage_name}: {err_msg}")
        raise RuntimeError(f"Error renderizando clip en FFmpeg ({stage_name}): {err_msg}")



def command_exists(name: str) -> bool:
    if name == "ffmpeg":
        exe = get_ffmpeg_path()
        return shutil.which(exe) is not None or os.path.isfile(exe)
    if name == "ffprobe":
        exe = get_ffprobe_path()
        return shutil.which(exe) is not None or os.path.isfile(exe)
    return shutil.which(name) is not None


def probe_media(path: str) -> Dict[str, Any]:
    if not command_exists("ffprobe"):
        raise RuntimeError("ffprobe is not installed or not available on PATH")

    cmd = [
        get_ffprobe_path(),
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **get_no_window_kwargs())
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

    fps = None
    if video:
        rate_str = video.get("r_frame_rate") or video.get("avg_frame_rate")
        if rate_str and "/" in rate_str:
            try:
                num, den = rate_str.split("/")
                den_f = float(den)
                if den_f > 0:
                    val = float(num) / den_f
                    if 1.0 <= val <= 240.0:
                        fps = round(val, 2)
            except Exception:
                pass

    bit_rate_raw = None
    if "format" in data and "bit_rate" in data["format"]:
        try:
            bit_rate_raw = int(data["format"]["bit_rate"])
        except Exception:
            pass
    if bit_rate_raw is None and video and "bit_rate" in video:
        try:
            bit_rate_raw = int(video["bit_rate"])
        except Exception:
            pass
    bit_rate_mbps = round(float(bit_rate_raw) / 1_000_000, 2) if bit_rate_raw else None

    aspect_ratio = None
    if video and "width" in video and "height" in video and video["width"] and video["height"]:
        w = int(video["width"])
        h = int(video["height"])
        if h > 0:
            ratio = round(w / h, 2)
            if abs(ratio - 1.78) < 0.05 or abs(ratio - (16 / 9)) < 0.05:
                aspect_ratio = "16:9"
            elif abs(ratio - 0.56) < 0.05 or abs(ratio - (9 / 16)) < 0.05:
                aspect_ratio = "9:16"
            elif abs(ratio - 1.33) < 0.05 or abs(ratio - (4 / 3)) < 0.05:
                aspect_ratio = "4:3"
            elif abs(ratio - 1.0) < 0.05:
                aspect_ratio = "1:1"
            else:
                aspect_ratio = f"{w}:{h}"

    return {
        "durationSec": duration_sec,
        "hasVideo": video is not None,
        "width": int(video["width"]) if video and "width" in video else None,
        "height": int(video["height"]) if video and "height" in video else None,
        "videoCodec": video.get("codec_name") if video else None,
        "audioCodec": audio.get("codec_name") if audio else None,
        "fps": fps,
        "bitRate": bit_rate_raw,
        "bitRateMbps": bit_rate_mbps,
        "aspect_ratio": aspect_ratio,
    }


@lru_cache(maxsize=64)
def probe_media_cached(path: str) -> Dict[str, Any]:
    """
    Cached wrapper for probe_media to prevent repetitive and expensive ffprobe subprocess invocations.
    """
    return probe_media(path)



def extract_audio(
    source_path: str,
    project_dir: Path,
    is_cancelled: Optional[Callable[[], bool]] = None,
    force: bool = False
) -> Path:
    if not command_exists("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not available on PATH")

    os.makedirs(project_dir, exist_ok=True)
    output_path = project_dir / "transcription_audio.wav"

    # Reuse if already extracted, valid WAV, and not forced
    if not force and output_path.exists() and output_path.stat().st_size > 1024:
        try:
            with wave.open(str(output_path), "rb") as wf:
                if wf.getnchannels() > 0 and wf.getnframes() > 0 and wf.getframerate() > 0:
                    print(f"Pista de audio existente encontrada y verificada: {output_path} ({output_path.stat().st_size / (1024*1024):.1f} MB). Reutilizando.")
                    return output_path
        except Exception:
            pass

    cmd = [
        get_ffmpeg_path(),
        "-y",
        "-i", str(source_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        str(output_path)
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        **get_no_window_kwargs()
    )

    stderr_lines: List[str] = []

    def drain_stderr():
        try:
            if proc.stderr:
                for line in proc.stderr:
                    clean = line.strip()
                    if clean:
                        stderr_lines.append(clean)
                        if len(stderr_lines) > 50:
                            stderr_lines.pop(0)
                        if "size=" in clean or "time=" in clean or "speed=" in clean or "bitrate=" in clean:
                            log_buffer.push(f"[FFmpeg Audio] {clean}")
        except Exception:
            pass

    drain_thread = threading.Thread(target=drain_stderr, daemon=True)
    drain_thread.start()

    while proc.poll() is None:
        if is_cancelled and is_cancelled():
            try:
                proc.kill()
                proc.wait(timeout=2)
            except Exception:
                pass
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            raise InterruptedError("Extracción de audio cancelada por el usuario.")
        time.sleep(0.15)

    drain_thread.join(timeout=2.0)

    if proc.returncode != 0:
        stderr_output = "".join(stderr_lines).strip()[-400:]
        raise RuntimeError(f"ffmpeg audio extraction failed: {stderr_output}")

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


def inject_acoustic_cues_into_transcript(
    transcript_segments: List[Dict[str, Any]],
    transcript_words: Optional[List[Dict[str, Any]]],
    audio_path: str,
    window_sec: float = 1.0,
    is_cancelled: Optional[Callable[[], bool]] = None
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Scans the extracted audio track and injects acoustic cues directly into the transcript:
    1. Detects gunfire, combat SFX and explosions during silent gameplay -> (DISPAROS / ACCIÓN).
    2. Detects high-decibel volume spikes during speech (screams, ecstatic reactions) -> (GRITOS / EUFORIA).
    Strictly preserves audio synchronization and timestamp ordering. Idempotent.
    """
    if is_cancelled and is_cancelled():
        raise InterruptedError("Análisis acústico cancelado por el usuario.")

    words = list(transcript_words or [])
    if not os.path.exists(audio_path):
        return transcript_segments, words

    try:
        with wave.open(audio_path, "rb") as wf:
            framerate = wf.getframerate()
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            n_frames = wf.getnframes()

            if framerate <= 0 or n_channels <= 0 or sampwidth != 2:
                return transcript_segments, words

            total_duration = n_frames / framerate
            chunk_size = int(framerate * window_sec)
            total_chunks = n_frames // chunk_size
            if total_chunks == 0:
                return transcript_segments, words

            energies = []
            for i in range(total_chunks):
                if is_cancelled and i % 50 == 0 and is_cancelled():
                    raise InterruptedError("Análisis acústico cancelado por el usuario.")

                frames = wf.readframes(chunk_size)
                if not frames:
                    break
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
            return transcript_segments, words

        sorted_rms = sorted(e["rms"] for e in energies)
        num_w = len(sorted_rms)
        p15 = sorted_rms[int(num_w * 0.15)]
        median_rms = sorted_rms[int(num_w * 0.50)]
        p90 = sorted_rms[int(num_w * 0.90)]

        # Dynamic thresholds based on stream audio mastering
        action_threshold = max(450.0, p15 * 3.5, median_rms * 0.65)
        shout_threshold = max(1800.0, median_rms * 2.5, p90 * 0.95)

        # 1. Clean existing cues if re-running (idempotent)
        clean_segments = []
        for s in transcript_segments:
            if s.get("speaker") == "SFX" or str(s.get("text", "")).startswith("(DISPAROS"):
                continue
            seg_copy = dict(s)
            clean_text = re.sub(r"^\(GRITOS\s*/\s*EUFORIA\)\s*", "", str(seg_copy.get("text", ""))).strip()
            seg_copy["text"] = clean_text
            clean_segments.append(seg_copy)

        clean_words = [
            dict(w) for w in words
            if w.get("speaker") != "SFX" and not str(w.get("text", "")).startswith("(DISPAROS")
        ]

        sorted_segs = sorted(clean_segments, key=lambda s: float(s["start"]))

        # 2. Identify silence gaps (streamer quiet / focused)
        gaps = []
        if sorted_segs:
            if sorted_segs[0]["start"] > 1.8:
                gaps.append((0.0, sorted_segs[0]["start"]))
            for k in range(len(sorted_segs) - 1):
                gap_start = float(sorted_segs[k]["end"])
                gap_end = float(sorted_segs[k + 1]["start"])
                if gap_end - gap_start >= 1.8:
                    gaps.append((gap_start, gap_end))
            if total_duration - sorted_segs[-1]["end"] >= 1.8:
                gaps.append((float(sorted_segs[-1]["end"]), total_duration))
        else:
            gaps.append((0.0, total_duration))

        # 3. Detect gunfire / combat bursts in silence gaps
        sfx_segments = []
        sfx_words = []
        for g_start, g_end in gaps:
            gap_energies = [e for e in energies if e["start"] >= (g_start - 0.2) and e["end"] <= (g_end + 0.2)]
            active_burst = None
            for e in gap_energies:
                if e["rms"] >= action_threshold:
                    if active_burst is None:
                        active_burst = {"start": max(g_start, e["start"]), "end": min(g_end, e["end"]), "max_rms": e["rms"]}
                    else:
                        active_burst["end"] = min(g_end, e["end"])
                        active_burst["max_rms"] = max(active_burst["max_rms"], e["rms"])
                else:
                    if active_burst is not None:
                        dur = active_burst["end"] - active_burst["start"]
                        if dur >= 1.8:
                            sfx_segments.append({
                                "start": round(active_burst["start"], 2),
                                "end": round(active_burst["end"], 2),
                                "speaker": "SFX",
                                "text": "(DISPAROS / ACCIÓN)"
                            })
                            sfx_words.append({
                                "start": round(active_burst["start"], 2),
                                "end": round(active_burst["end"], 2),
                                "speaker": "SFX",
                                "text": "(DISPAROS)"
                            })
                        active_burst = None

            if active_burst is not None:
                dur = active_burst["end"] - active_burst["start"]
                if dur >= 1.8:
                    sfx_segments.append({
                        "start": round(active_burst["start"], 2),
                        "end": round(active_burst["end"], 2),
                        "speaker": "SFX",
                        "text": "(DISPAROS / ACCIÓN)"
                    })
                    sfx_words.append({
                        "start": round(active_burst["start"], 2),
                        "end": round(active_burst["end"], 2),
                        "speaker": "SFX",
                        "text": "(DISPAROS)"
                    })

        # 4. Annotate shouts / screaming peaks during speech
        updated_segments = []
        for s in sorted_segs:
            seg_copy = dict(s)
            s_start = float(seg_copy["start"])
            s_end = float(seg_copy["end"])
            seg_energies = [e["rms"] for e in energies if e["start"] >= (s_start - 0.5) and e["end"] <= (s_end + 0.5)]
            max_seg_rms = max(seg_energies) if seg_energies else 0.0

            if max_seg_rms >= shout_threshold:
                seg_copy["text"] = f"(GRITOS / EUFORIA) {seg_copy['text']}".strip()

            updated_segments.append(seg_copy)

        # 5. Merge and sort
        merged_segments = sorted(updated_segments + sfx_segments, key=lambda s: float(s["start"]))
        merged_words = sorted(clean_words + sfx_words, key=lambda w: float(w["start"]))

        return merged_segments, merged_words
    except Exception as err:
        print(f"Nota en inyección de pistas acústicas: {err}")
        return transcript_segments, words


def format_srt_time(secs: float) -> str:
    hours = int(secs // 3600)
    mins = int((secs % 3600) // 60)
    secs_only = int(secs % 60)
    ms = int((secs - int(secs)) * 1000)
    return f"{hours:02d}:{mins:02d}:{secs_only:02d},{ms:03d}"


def remap_words_for_sub_ranges(
    words: List[Dict[str, Any]],
    sub_ranges: Optional[List[Dict[str, float]]],
    default_start_sec: float,
    default_end_sec: float
) -> Tuple[List[Dict[str, Any]], float, float]:
    """
    Filters words inside valid sub_ranges and recalibrates their start and end
    times to align with the concatenated video output timeline.
    Returns (remapped_words, 0.0, total_duration).
    """
    if not sub_ranges or len(sub_ranges) <= 1:
        clip_words = [w for w in words if w.get("end", 0) > default_start_sec and w.get("start", 0) < default_end_sec]
        return clip_words, default_start_sec, default_end_sec

    sorted_ranges = sorted(sub_ranges, key=lambda r: float(r["start"]))
    remapped_words = []
    accumulated_offset = 0.0

    for r in sorted_ranges:
        r_start = float(r["start"])
        r_end = float(r["end"])
        r_dur = max(0.0, r_end - r_start)
        if r_dur <= 0:
            continue

        for w in words:
            w_start = float(w.get("start", 0))
            w_end = float(w.get("end", 0))
            w_mid = (w_start + w_end) / 2.0
            if r_start <= w_mid <= r_end:
                new_w_start = accumulated_offset + max(0.0, w_start - r_start)
                new_w_end = accumulated_offset + min(r_dur, max(0.05, w_end - r_start))
                w_copy = dict(w)
                w_copy["start"] = new_w_start
                w_copy["end"] = new_w_end
                remapped_words.append(w_copy)

        accumulated_offset += r_dur

    total_duration = max(0.1, accumulated_offset)
    return remapped_words, 0.0, total_duration


def chunk_words_remotion(
    words: List[Dict[str, Any]],
    max_words: int,
    max_chars: int,
    silence_break_sec: float = 0.35,
    prevent_orphans: bool = True
) -> List[List[Dict[str, Any]]]:
    """
    Implements Remotion's TikTok-style caption chunking:
    - breakOnSilenceAfterMilliseconds (forces break when gap between words >= silence_break_sec)
    - ensureMaxCharactersPerLine & max_words budget
    - preventOrphanWord: prevents awkward solitary words at sentence boundaries
    """
    if not words:
        return []

    chunks: List[List[Dict[str, Any]]] = []
    current_chunk: List[Dict[str, Any]] = []
    current_char_count = 0

    for w in words:
        raw = re.sub(r"[^\wáéíóúÁÉÍÓÚñÑüÜ]", "", w.get("text", "")).strip()
        if not raw:
            raw = w.get("text", "").strip()
        if not raw:
            continue
        w_len = len(raw)

        is_silence_break = False
        if current_chunk:
            prev_end = current_chunk[-1].get("end", 0.0)
            curr_start = w.get("start", 0.0)
            if (curr_start - prev_end) >= silence_break_sec:
                is_silence_break = True

        is_budget_exceeded = False
        if current_chunk:
            new_char_count = current_char_count + 1 + w_len
            if len(current_chunk) >= max_words or new_char_count > max_chars:
                is_budget_exceeded = True

        if (is_silence_break or is_budget_exceeded) and current_chunk:
            chunks.append(current_chunk)
            current_chunk = [w]
            current_char_count = w_len
        else:
            current_chunk.append(w)
            current_char_count += (1 if current_char_count > 0 else 0) + w_len

    if current_chunk:
        chunks.append(current_chunk)

    if prevent_orphans and len(chunks) > 1:
        optimized: List[List[Dict[str, Any]]] = []
        for ch in chunks:
            if len(ch) == 1 and optimized:
                prev_ch = optimized[-1]
                prev_len = sum(len(w.get("text", "")) for w in prev_ch) + len(prev_ch) - 1
                ch_len = len(ch[0].get("text", ""))
                gap = ch[0].get("start", 0.0) - prev_ch[-1].get("end", 0.0)
                if gap < silence_break_sec and (prev_len + 1 + ch_len) <= (max_chars + 4):
                    prev_ch.append(ch[0])
                    continue
            optimized.append(ch)
        chunks = optimized

    return chunks


def generate_srt(
    words: List[Dict[str, Any]],
    start_sec: float,
    end_sec: float,
    sub_ranges: Optional[List[Dict[str, float]]] = None
) -> str:
    candidate_words, eff_start, eff_end = remap_words_for_sub_ranges(words, sub_ranges, start_sec, end_sec)
    if not candidate_words:
        return ""

    chunks = chunk_words_remotion(
        words=candidate_words,
        max_words=3,
        max_chars=24,
        silence_break_sec=0.35,
        prevent_orphans=False
    )

    lines = []
    index = 1
    for chunk in chunks:
        if not chunk:
            continue
        first = chunk[0]
        last = chunk[-1]
        start_rel = max(0.0, first["start"] - eff_start)
        end_rel = max(0.0, min(eff_end - eff_start, last["end"] - eff_start))
        if end_rel <= start_rel:
            end_rel = start_rel + 0.3
        text = " ".join(w["text"].strip() for w in chunk)
        if not text:
            continue

        lines.append(f"{index}")
        lines.append(f"{format_srt_time(start_rel)} --> {format_srt_time(end_rel)}")
        lines.append(f"{text}\n")
        index += 1

    return "\n".join(lines)


def format_ass_time(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    cs = int(round((sec - int(sec)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def hex_to_ass_color(hex_str: Optional[str], default: str = "&H00FFFFFF&") -> str:
    if not hex_str:
        return default
    clean = hex_str.lstrip("#").strip()
    if len(clean) == 6:
        r = clean[0:2]
        g = clean[2:4]
        b = clean[4:6]
        return f"&H00{b}{g}{r}&".upper()
    return default


HERO_TRIGGER_WORDS = {
    "brutal", "locura", "epico", "épico", "increible", "increíble", "insano", "mató", "mato",
    "muerto", "ganamos", "boom", "headshot", "clutch", "dios", "nooo", "wow", "wtf", "omg",
    "hack", "pro", "gg", "rush", "record", "récord", "mira", "toma", "ojo", "cuidado",
    "final", "victoria", "derrota", "destruccion", "destrucción", "fuego", "bestia", "mítico",
    "mitico", "legendario", "vamos", "vamosss", "salvaje", "imposible"
}


def is_hero_word(raw_w: str) -> bool:
    clean = re.sub(r"[^\wáéíóúÁÉÍÓÚñÑüÜ]", "", raw_w).lower()
    return clean in HERO_TRIGGER_WORDS


def get_exact_emoji_bbox(emoji_text: str, font, ss_font_size: int):
    from PIL import Image, ImageDraw
    # Dynamically sized canvas based on font size - never clips
    side = int(ss_font_size * 3)
    offset = ss_font_size
    test_img = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    td = ImageDraw.Draw(test_img)
    try:
        td.text((offset, offset), emoji_text, font=font, embedded_color=True)
    except Exception:
        td.text((offset, offset), emoji_text, font=font, fill=(255, 255, 255, 255))
    bb = test_img.getbbox()
    if bb:
        return (bb[0] - offset, bb[1] - offset, bb[2] - offset, bb[3] - offset)
    return (0, 0, 0, 0)


def generate_cta_badge_image(
    text: str,
    output_path: str,
    is_vertical: bool = True,
    scale_factor: float = 1.0
) -> str:
    """
    Renders a stunning, ultra-crisp streamer pill badge with:
    - 2X supersampling with Lanczos downscaling for perfectly smooth curves and text
    - True color emojis (using Segoe UI Emoji)
    - Bold, modern typography (Segoe UI Bold / Arial Bold)
    - Subpixel centroid alignment between emoji and text
    - Motionmaxxing-inspired dark glass pill with glowing neon borders
    - Streamer platform badge highlights
    """
    from PIL import Image, ImageDraw, ImageFont

    text = text.strip()
    emoji_part = ""
    rest_text = text

    # Extract leading emoji if present (e.g. 🔥, ❤️, 🔔, 💬, ⭐)
    m = re.match(r"^([\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]+|\u2764\ufe0f|\u2764)\s*(.*)$", text)
    if m:
        emoji_part = m.group(1)
        rest_text = m.group(2)

    clamped_scale = max(0.5, min(2.0, float(scale_factor)))
    scale = (1.05 if is_vertical else 0.95) * clamped_scale
    font_size = int(32 * scale)

    # 2X supersampling factor for razor-sharp rendering
    ss = 2
    ss_font_size = font_size * ss

    emoji_font = None
    if os.path.exists("C:/Windows/Fonts/seguiemj.ttf"):
        try:
            emoji_font = ImageFont.truetype("C:/Windows/Fonts/seguiemj.ttf", int(ss_font_size * 1.12))
        except Exception:
            emoji_font = None

    text_font = None
    for fp in ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf"]:
        if os.path.exists(fp):
            try:
                text_font = ImageFont.truetype(fp, ss_font_size)
                break
            except Exception:
                continue
    if not text_font:
        text_font = ImageFont.load_default()
    if not emoji_font:
        emoji_font = text_font

    emoji_w = 0
    emoji_h = 0
    bbox_e = (0, 0, 0, 0)
    if emoji_part:
        bbox_e = get_exact_emoji_bbox(emoji_part, emoji_font, ss_font_size)
        emoji_w = bbox_e[2] - bbox_e[0]
        emoji_h = bbox_e[3] - bbox_e[1]

    dummy = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    draw_d = ImageDraw.Draw(dummy)
    bbox_t = draw_d.textbbox((0, 0), rest_text, font=text_font)
    text_w = bbox_t[2] - bbox_t[0]
    text_h = bbox_t[3] - bbox_t[1]

    pad_x = int(22 * scale * ss)
    pad_y = int(10 * scale * ss)
    gap_x = int(9 * scale * ss) if emoji_part else 0

    content_h = max(emoji_h, text_h)
    total_h = content_h + pad_y * 2
    total_w = pad_x * 2 + (emoji_w + gap_x if emoji_part else 0) + text_w

    # Draw at 2X resolution
    img_ss = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img_ss)

    radius = total_h // 2

    # Streamer neon accent border color:
    # If twitch-like: Purple. If heart/like: Rose. If fire: Orange.
    border_color = (244, 63, 94, 230)  # Rose neon default
    lower_text = text.lower()
    if "twitch" in lower_text:
        border_color = (145, 70, 255, 240)
    elif "🔥" in text or "fuego" in lower_text:
        border_color = (251, 146, 60, 240)
    elif "🔔" in text or "youtube" in lower_text:
        border_color = (239, 68, 68, 240)

    # Dark translucent glass pill with crisp glowing border
    draw.rounded_rectangle(
        [(2, 2), (total_w - 3, total_h - 3)],
        radius=radius,
        fill=(16, 16, 22, 235),
        outline=border_color,
        width=max(2, int(2.0 * scale * ss))
    )

    if emoji_part:
        emoji_target_top = (total_h - emoji_h) // 2
        emoji_draw_y = emoji_target_top - bbox_e[1]
        emoji_draw_x = pad_x - bbox_e[0]
        try:
            draw.text((emoji_draw_x, emoji_draw_y), emoji_part, font=emoji_font, embedded_color=True)
        except Exception:
            draw.text((emoji_draw_x, emoji_draw_y), emoji_part, font=emoji_font, fill=(255, 255, 255, 255))

    text_target_top = (total_h - text_h) // 2
    text_draw_y = text_target_top - bbox_t[1]
    text_draw_x = pad_x + (emoji_w + gap_x if emoji_part else 0) - bbox_t[0]

    draw.text((text_draw_x, text_draw_y), rest_text, font=text_font, fill=(255, 255, 255, 255))

    # Downscale smoothly to 1X with Lanczos for flawless anti-aliasing
    final_w = max(1, total_w // ss)
    final_h = max(1, total_h // ss)
    img_final = img_ss.resize((final_w, final_h), Image.Resampling.LANCZOS)

    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    img_final.save(output_path, "PNG")
    return output_path


def generate_ass_subtitles(
    words: List[Dict[str, Any]],
    start_sec: float,
    end_sec: float,
    caption_style: str = "tiktok-karaoke",
    position: str = "bottom",
    aspect_ratio: str = "9:16",
    primary_color_hex: Optional[str] = None,
    highlight_color_hex: Optional[str] = None,
    single_line: bool = True,
    sub_ranges: Optional[List[Dict[str, float]]] = None,
    pos_x: Optional[int] = None,
    pos_y: Optional[int] = None,
    font_size_override: Optional[int] = None,
    align_h: str = "center",
    source_width: Optional[int] = None,
    source_height: Optional[int] = None
) -> str:
    clip_words, start_sec, end_sec = remap_words_for_sub_ranges(words, sub_ranges, start_sec, end_sec)
    if not clip_words:
        return ""

    # Determine orientation and virtual canvas resolution.
    # In ASS specifications, PlayResX and PlayResY establish the virtual coordinate space.
    # Because all pos_x, pos_y, font sizes and offsets from the frontend are authored on
    # the canonical 1080x1920 (vertical) or 1920x1080 (horizontal) canvas, PlayResX and PlayResY
    # must match this reference space. libass automatically and losslessly scales this virtual
    # space onto whatever real video resolution FFmpeg encodes (720p, 1080p, 4K, etc.).
    if aspect_ratio == "9:16":
        is_vertical = True
    elif aspect_ratio == "16:9":
        is_vertical = False
    else:  # "original" / native
        if source_width and source_height and source_width > 0 and source_height > 0:
            is_vertical = (source_height > source_width)
        else:
            is_vertical = False

    if is_vertical:
        res_x = 1080
        res_y = 1920
    else:
        res_x = 1920
        res_y = 1080

    # Alignment and vertical margin
    # ASS alignments: 2 = Bottom Center, 5 = Middle Center, 8 = Top Center
    if pos_x is not None and pos_y is not None:
        if align_h == "left":
            alignment = 4
        elif align_h == "right":
            alignment = 6
        else:
            alignment = 5
        margin_v = 0
    elif position == "top":
        alignment = 8
        margin_v = 180 if is_vertical else 90
    elif position == "center":
        alignment = 5
        margin_v = 0
    else:  # bottom default
        alignment = 2
        margin_v = 180 if is_vertical else 90

    # Style defaults
    font_name = "Arial Black"
    font_size = 62 if is_vertical else 50
    bold = -1
    italic = 0
    spacing = 1
    border_style = 1  # 1 = outline + shadow, 3 = opaque box
    outline_size = 6 if is_vertical else 5
    shadow_size = 2
    outline_colour = "&H00000000&"
    back_colour = "&H80000000&"

    # Default colors (ABGR hex format)
    primary_color = hex_to_ass_color(primary_color_hex, "&H00FFFFFF&") if primary_color_hex else "&H00FFFFFF&"
    highlight_color = hex_to_ass_color(highlight_color_hex, "&H0015CCFA&") if highlight_color_hex else "&H0015CCFA&"  # Yellow pop
    hero_color = "&H003C92FB&"  # Fire orange for climax words

    # Preset configurations (HyperFrames + Remotion)
    if caption_style == "tiktok-karaoke":
        font_name = "Arial Black"
        font_size = 62 if is_vertical else 50
        outline_size = 6 if is_vertical else 5
        shadow_size = 2
    elif caption_style == "loud-viral":
        # HyperFrames Loud: Ultra-bold condensed, massive 3D stroke, neon yellow/lime highlight
        font_name = "Impact"
        font_size = 68 if is_vertical else 56
        spacing = 2
        outline_size = 7 if is_vertical else 6
        shadow_size = 3
        if not highlight_color_hex:
            highlight_color = "&H0015CCFA&"  # Neon yellow
        hero_color = "&H003CD4FB&"  # Bright flame
    elif caption_style == "arcade-retro":
        # HyperFrames Retro Gaming HUD: Tech cyan with hot pink / magenta glow
        font_name = "Trebuchet MS"
        font_size = 62 if is_vertical else 50
        outline_colour = "&H009948EC&"  # Hot pink outline
        outline_size = 5 if is_vertical else 4
        shadow_size = 0
        if not primary_color_hex:
            primary_color = "&H00FFFFFF&"
        if not highlight_color_hex:
            highlight_color = "&H00D4B606&"  # Neon cyan active
    elif caption_style == "cyber-terminal":
        # HyperFrames Terminal Hacker: Monospace phosphor matrix green with cyan active
        font_name = "Consolas"
        font_size = 62 if is_vertical else 50
        primary_color = "&H0081B910&"  # Phosphor green
        outline_colour = "&H00102008&"
        outline_size = 4
        shadow_size = 1
        if not highlight_color_hex:
            highlight_color = "&H00FAEE38&"  # Electric cyan active
    elif caption_style == "clean-editorial":
        # HyperFrames Clean Editorial: Modern sans-serif, clean white, soft multilayer shadow
        font_name = "Segoe UI"
        font_size = 58 if is_vertical else 48
        primary_color = "&H00FFFFFF&"
        outline_colour = "&H001E1E1E&"
        outline_size = 2
        shadow_size = 3
        back_colour = "&H90000000&"
        if not highlight_color_hex:
            highlight_color = "&H0047E0FD&"  # Warm gold accent
    elif caption_style == "modern-box":
        font_name = "Arial"
        font_size = 56 if is_vertical else 46
        border_style = 3
        outline_size = 2
        shadow_size = 0
        back_colour = "&H99000000&"
    elif caption_style == "classic-outline":
        font_name = "Arial Black"
        font_size = 62 if is_vertical else 50
        if not primary_color_hex:
            primary_color = "&H0015CCFA&"
        outline_size = 6 if is_vertical else 5
        shadow_size = 2
    elif caption_style == "minimal-shadow":
        font_name = "Segoe UI"
        font_size = 56 if is_vertical else 46
        outline_size = 2
        shadow_size = 3

    if font_size_override is not None:
        font_size = max(24, min(120, int(font_size_override)))

    pos_tag = f"{{\\an{alignment}\\pos({int(pos_x)},{int(pos_y)})}}" if (pos_x is not None and pos_y is not None) else ""

    # WrapStyle: 2 forces libass to NEVER wrap onto an uncontrolled second line
    # MarginL: 70, MarginR: 70 guarantees safety margins from 9:16 borders
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {res_x}
PlayResY: {res_y}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: AutoStyle,{font_name},{font_size},{primary_color},&H000000FF,{outline_colour},{back_colour},{bold},{italic},0,0,100,100,{spacing},0,{border_style},{outline_size},{shadow_size},{alignment},70,70,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    dialogue_lines = []

    if caption_style != "none":
        # Remotion smart chunking with silence detection and orphan prevention
        if single_line:
            max_words = 3 if is_vertical else 4
            max_chars = 18 if is_vertical else 26
        else:
            max_words = 5 if is_vertical else 7
            max_chars = 32 if is_vertical else 46

        chunks = chunk_words_remotion(
            words=clip_words,
            max_words=max_words,
            max_chars=max_chars,
            silence_break_sec=0.35,
            prevent_orphans=True
        )

        supports_karaoke = caption_style in ("tiktok-karaoke", "loud-viral", "arcade-retro", "cyber-terminal", "clean-editorial")

        for chunk in chunks:
            chunk_start = max(0.0, chunk[0]["start"] - start_sec)
            chunk_end = max(0.0, min(end_sec - start_sec, chunk[-1]["end"] - start_sec))
            if chunk_end <= chunk_start:
                continue

            plain_len = sum(len(w.get("text", "").strip()) for w in chunk) + max(0, len(chunk) - 1)
            max_safe_len = 22 if is_vertical else 28
            if plain_len > max_safe_len:
                line_fs = max(int(font_size * 0.75), int(font_size - (plain_len - max_safe_len) * 1.2))
                fs_tag = f"{{\\fs{line_fs}}}"
                inner_fs = f"\\fs{line_fs}"
            else:
                fs_tag = ""
                inner_fs = ""

            if supports_karaoke:
                for w_idx, active_w in enumerate(chunk):
                    w_start = max(chunk_start, active_w["start"] - start_sec)
                    w_end = min(chunk_end, active_w["end"] - start_sec)
                    if w_end <= w_start:
                        w_end = min(chunk_end, w_start + 0.3)

                    words_text = []
                    for idx, w in enumerate(chunk):
                        raw_w = re.sub(r"[^\wáéíóúÁÉÍÓÚñÑüÜ]", "", w.get("text", ""))
                        if not raw_w:
                            raw_w = w.get("text", "").strip()
                        if not raw_w:
                            continue

                        # Text case formatting
                        display_w = raw_w.upper() if caption_style in ("tiktok-karaoke", "loud-viral", "arcade-retro") else raw_w

                        if idx == w_idx:
                            # Active word pop
                            if is_hero_word(raw_w):
                                # Hero Word: extra pop (125%) with hero fire/accent color
                                words_text.append(f"{{\\fscx125\\fscy125\\c{hero_color}}}{display_w}{{\\rAutoStyle\\fscx100\\fscy100{inner_fs}}}")
                            elif caption_style == "cyber-terminal":
                                # Cyber terminal bracket prompt
                                words_text.append(f"{{\\c{highlight_color}}}[{display_w}]{{\\rAutoStyle{inner_fs}}}")
                            else:
                                pop_scale = 122 if caption_style == "loud-viral" else (108 if caption_style == "clean-editorial" else 118)
                                words_text.append(f"{{\\fscx{pop_scale}\\fscy{pop_scale}\\c{highlight_color}}}{display_w}{{\\rAutoStyle\\fscx100\\fscy100{inner_fs}}}")
                        else:
                            # Inactive word
                            if is_hero_word(raw_w) and caption_style == "loud-viral":
                                words_text.append(f"{{\\c{hero_color}}}{display_w}{{\\rAutoStyle{inner_fs}}}")
                            else:
                                words_text.append(display_w)

                    prefix = "> " if caption_style == "cyber-terminal" else ""
                    text_line = prefix + " ".join(words_text)
                    if text_line.strip():
                        dialogue_lines.append(
                            f"Dialogue: 0,{format_ass_time(w_start)},{format_ass_time(w_end)},AutoStyle,,0,0,0,,{pos_tag}{fs_tag}{text_line}"
                        )
            else:
                clean_chunk = []
                for w in chunk:
                    c = re.sub(r"[^\wáéíóúÁÉÍÓÚñÑüÜ]", "", w.get("text", ""))
                    txt = c if c else w.get("text", "").strip()
                    clean_chunk.append(txt.upper() if caption_style != "minimal-shadow" else txt)
                text_line = " ".join(clean_chunk)
                if text_line.strip():
                    dialogue_lines.append(
                        f"Dialogue: 0,{format_ass_time(chunk_start)},{format_ass_time(chunk_end)},AutoStyle,,0,0,0,,{pos_tag}{fs_tag}{text_line}"
                    )

    return header + "\n".join(dialogue_lines) + "\n"


def render_flat_clip(
    source_path: str,
    start_sec: float,
    end_sec: float,
    output_path: Path,
    aspect_ratio: str = "9:16",
    subtitle_filter: Optional[str] = None,
    cta_badge_path: Optional[str] = None,
    cta_position: str = "top",
    caption_position: str = "bottom",
    cta_animation: str = "bounce-land",
    sub_ranges: Optional[List[Dict[str, float]]] = None,
    transition: Optional[str] = None,
    target_fps: Optional[int] = None,
    cta_x: Optional[int] = None,
    cta_y: Optional[int] = None,
    layout: str = "crop",
    camera_crop: Optional[Dict[str, Any]] = None,
    gameplay_crop: Optional[Dict[str, Any]] = None,
    bgm_path: Optional[str] = None,
    bgm_volume: float = 0.15,
    bgm_start_sec: float = 0.0,
    target_bitrate_k: Optional[int] = None,
    min_bitrate_k: Optional[int] = None,
    max_bitrate_k: Optional[int] = None,
    two_pass: bool = False,
    progress_callback: Optional[Callable[[int, str], None]] = None
) -> Path:
    if not command_exists("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed or not available on PATH")

    os.makedirs(output_path.parent, exist_ok=True)
    has_multi_segment = bool(sub_ranges and len(sub_ranges) > 1)

    if has_multi_segment:
        sorted_ranges = sorted(sub_ranges, key=lambda r: float(r["start"]))
        first_start = float(sorted_ranges[0]["start"])
        dur_sec = max(0.1, sum(max(0.0, float(r["end"]) - float(r["start"])) for r in sorted_ranges))
    else:
        first_start = start_sec
        dur_sec = max(0.1, end_sec - start_sec)

    dur_str = f"{dur_sec:.3f}"
    start_str = f"{first_start:.3f}"

    probe = probe_media(source_path)
    has_video = probe.get("hasVideo", False)
    has_audio = probe.get("audioCodec") is not None
    vid_w = probe.get("width", 0) or 0
    vid_h = probe.get("height", 0) or 0

    if aspect_ratio == "9:16":
        is_vertical = True
    elif aspect_ratio == "16:9":
        is_vertical = False
    else:  # "original" / "native"
        is_vertical = (vid_h > vid_w > 0)

    has_cta = bool(cta_badge_path and os.path.exists(str(cta_badge_path)))
    valid_bgm = bool(bgm_path and os.path.isfile(str(bgm_path)))

    log_buffer.push(f"[FFmpeg] Iniciando renderizado de '{output_path.name}' ({dur_sec:.1f}s)...")
    if is_vertical:
        log_buffer.push(f"[FFmpeg] Salida vertical 9:16 (1080x1920) | Layout: {layout}")
    elif aspect_ratio == "16:9":
        log_buffer.push("[FFmpeg] Salida horizontal 16:9 (1920x1080)")
    else:
        log_buffer.push(f"[FFmpeg] Salida nativa/original ({vid_w}x{vid_h})")
    if has_multi_segment:
        log_buffer.push(f"[FFmpeg] Aplicando {len(sorted_ranges)} segmentos sincronizados (cortes internos)...")
    if valid_bgm:
        log_buffer.push(f"[FFmpeg] Mezclando música de fondo: {os.path.basename(str(bgm_path))} (volumen {bgm_volume*100:.0f}%, inicio {bgm_start_sec:.1f}s)")

    base_video_inputs = [
        get_ffmpeg_path(),
        "-y",
        "-threads", "0",
        "-ss", start_str,
        "-i", source_path
    ]

    curr_input_idx = 1
    cta_idx = None
    if has_cta:
        base_video_inputs.extend(["-loop", "1", "-i", str(cta_badge_path)])
        cta_idx = curr_input_idx
        curr_input_idx += 1

    base_inputs = list(base_video_inputs)
    bgm_idx = None
    if valid_bgm:
        base_inputs.extend(["-stream_loop", "-1", "-i", str(bgm_path)])
        bgm_idx = curr_input_idx
        curr_input_idx += 1

    # Helper to generate CTA badge animation filter chain
    def build_cta_anim_chain(t_st: float, t_en: float, b_y: str):
        fade = f"fade=in:st={t_st:.2f}:d=0.20:alpha=1,fade=out:st={t_en-0.3:.2f}:d=0.3:alpha=1"
        if cta_animation == "bounce-land":
            w_e = f"2*trunc((iw*if(between(t,{t_st:.2f},{t_st+0.35:.2f}),1.0+0.35*pow(1-(t-{t_st:.2f})/0.35,2),1.0))/2)"
            h_e = f"2*trunc((ih*if(between(t,{t_st:.2f},{t_st+0.35:.2f}),1.0+0.35*pow(1-(t-{t_st:.2f})/0.35,2),1.0))/2)"
            scale_part = f"scale=eval=frame:w='{w_e}':h='{h_e}'"
            y_part = b_y
        elif cta_animation == "pulse-glow":
            w_e = f"2*trunc((iw*(1.0+0.08*abs(sin(2*PI*(t-{t_st:.2f})/1.2))))/2)"
            h_e = f"2*trunc((ih*(1.0+0.08*abs(sin(2*PI*(t-{t_st:.2f})/1.2))))/2)"
            scale_part = f"scale=eval=frame:w='{w_e}':h='{h_e}'"
            y_part = b_y
        elif cta_animation == "slide-up":
            scale_part = "null"
            slide_delta = 60 if is_vertical else 40
            y_part = f"if(between(t,{t_st:.2f},{t_st+0.4:.2f}), ({b_y}) + {slide_delta}*pow(1-(t-{t_st:.2f})/0.4, 2), ({b_y}))"
        else:  # fade-smooth
            scale_part = "null"
            y_part = b_y

        filter_chain = f"{scale_part},{fade}"
        return filter_chain, y_part

    needs_crop = is_vertical and (vid_w >= vid_h > 0)
    needs_crop_to_16_9 = (aspect_ratio == "16:9") and (vid_h > vid_w > 0)
    ref_w = 1080 if is_vertical else 1920
    ref_h = 1920 if is_vertical else 1080
    target_w = 1080 if is_vertical else (1920 if aspect_ratio == "16:9" else (vid_w if vid_w > 0 else ref_w))
    target_h = 1920 if is_vertical else (1080 if aspect_ratio == "16:9" else (vid_h if vid_h > 0 else ref_h))

    scaled_cta_x = int(int(cta_x) * target_w / ref_w) if cta_x is not None else None
    scaled_cta_y = int(int(cta_y) * target_h / ref_h) if cta_y is not None else None

    has_sub_collision = bool(subtitle_filter and (cta_position == caption_position))
    overlay_x = f"max(0,min(W-w,{int(scaled_cta_x)}-w/2))" if scaled_cta_x is not None else "(W-w)/2"
    if scaled_cta_y is not None:
        base_y = f"max(0,min(H-h,{int(scaled_cta_y)}-h/2))"
    elif cta_position == "top":
        base_y = "280" if (has_sub_collision and is_vertical) else ("160" if has_sub_collision else ("130" if is_vertical else "65"))
    elif cta_position == "center":
        base_y = "(H-h)/2+90" if has_sub_collision else "(H-h)/2"
    else:  # bottom
        margin_b = 300 if is_vertical else 160
        normal_b = 140 if is_vertical else 70
        base_y = f"H-h-{margin_b}" if has_sub_collision else f"H-h-{normal_b}"

    if dur_sec >= 20.0:
        t1_start, t1_end = 1.0, 6.0
        t2_start = max(t1_end + 4.0, dur_sec - 5.0)
        t2_end = dur_sec - 0.5
    elif dur_sec >= 8.0:
        t1_start, t1_end = 1.0, 6.0
        t2_start = t2_end = None
    elif dur_sec >= 4.0:
        t1_start, t1_end = 0.8, min(dur_sec - 0.4, 4.5)
        t2_start = t2_end = None
    else:
        t1_start, t1_end = 0.4, max(1.0, dur_sec - 0.2)
        t2_start = t2_end = None

    video_filter_parts: List[str] = []
    audio_filter_parts: List[str] = []
    if has_video:
        if has_multi_segment:
            N = len(sorted_ranges)
            for i, r in enumerate(sorted_ranges):
                rs = max(0.0, float(r["start"]) - first_start)
                re_ = max(rs + 0.05, float(r["end"]) - first_start)
                video_filter_parts.append(f"[0:v]trim=start={rs:.3f}:end={re_:.3f},setpts=PTS-STARTPTS[vseg{i}]")
            vconcat_in = "".join(f"[vseg{i}]" for i in range(N))
            video_filter_parts.append(f"{vconcat_in}concat=n={N}:v=1:a=0[vjoined]")
            v_in = "[vjoined]"

            if has_audio:
                for i, r in enumerate(sorted_ranges):
                    rs = max(0.0, float(r["start"]) - first_start)
                    re_ = max(rs + 0.05, float(r["end"]) - first_start)
                    audio_filter_parts.append(f"[0:a]atrim=start={rs:.3f}:end={re_:.3f},asetpts=PTS-STARTPTS[aseg{i}]")
                aconcat_in = "".join(f"[aseg{i}]" for i in range(N))
                audio_filter_parts.append(f"{aconcat_in}concat=n={N}:v=0:a=1[ajoined]")
                a_in = "[ajoined]"
            else:
                a_in = None
        else:
            v_in = "[0:v]"
            a_in = None

        # Base layout processing
        if is_vertical and layout == "blur":
            video_filter_parts.append(f"{v_in}split=2[vbg_raw][vfg_raw]")
            video_filter_parts.append("[vbg_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear[vbg]")
            video_filter_parts.append("[vfg_raw]scale=w=1080:h=1920:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[vfg]")
            video_filter_parts.append("[vbg][vfg]overlay=x=(W-w)/2:y=(H-h)/2[vbase]")
        elif is_vertical and layout == "gaming_split":
            in_w = vid_w if vid_w > 0 else 1920
            in_h = vid_h if vid_h > 0 else 1080

            c_crop = camera_crop or {}
            g_crop = gameplay_crop or {}

            cw = make_even(min(c_crop.get("width", in_w), in_w))
            ch = make_even(min(c_crop.get("height", in_h), in_h))
            cx = make_even(max(0, min(c_crop.get("x", 0), in_w - cw)))
            cy = make_even(max(0, min(c_crop.get("y", 0), in_h - ch)))

            gw = make_even(min(g_crop.get("width", in_w), in_w))
            gh = make_even(min(g_crop.get("height", in_h), in_h))
            gx = make_even(max(0, min(g_crop.get("x", 0), in_w - gw)))
            gy = make_even(max(0, min(g_crop.get("y", 0), in_h - gh)))

            default_cam_h = min(make_even((ch / max(1, cw)) * 1080), 720)
            cam_out_w = make_even(min(1080, max(180, c_crop.get("outWidth", 1080))))
            cam_out_h = make_even(min(1920, max(180, c_crop.get("outHeight", default_cam_h))))
            cam_out_x = make_even_coord(max(0, min(1080 - cam_out_w, c_crop.get("outX", (1080 - cam_out_w) // 2))))
            cam_out_y = make_even_coord(max(0, min(1920 - cam_out_h, c_crop.get("outY", 0))))

            max_game_h = 1920 - cam_out_h
            default_game_h = min(make_even((gh / max(1, gw)) * 1080), max_game_h)
            game_out_w = make_even(min(1080, max(360, g_crop.get("outWidth", 1080))))
            game_out_h = make_even(min(1920, max(360, g_crop.get("outHeight", default_game_h))))
            default_game_y = max(cam_out_y + cam_out_h, (1920 - game_out_h) // 2)
            game_out_x = make_even_coord(max(0, min(1080 - game_out_w, g_crop.get("outX", 0))))
            game_out_y = make_even_coord(max(0, min(1920 - game_out_h, g_crop.get("outY", default_game_y))))

            video_filter_parts.append(f"{v_in}split=3[vbg_raw][vcam_raw][vgame_raw]")
            video_filter_parts.append("[vbg_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear[vbg]")
            video_filter_parts.append(f"[vcam_raw]crop=w={cw}:h={ch}:x={cx}:y={cy},scale={cam_out_w}:{cam_out_h}:flags=lanczos[vcam]")
            video_filter_parts.append(f"[vgame_raw]crop=w={gw}:h={gh}:x={gx}:y={gy},scale={game_out_w}:{game_out_h}:flags=lanczos[vgame]")
            # Facecam superpuesta al frente (sobre el gameplay)
            video_filter_parts.append(f"[vbg][vgame]overlay=x={game_out_x}:y={game_out_y}[vtmp]")
            video_filter_parts.append(f"[vtmp][vcam]overlay=x={cam_out_x}:y={cam_out_y}[vbase]")

            if cta_position == "top" and scaled_cta_y is None:
                base_y = f"{cam_out_y + cam_out_h + 30}"
        elif needs_crop:
            video_filter_parts.append(f"{v_in}crop=w='2*trunc(min(iw,ih*9/16)/2)':h='2*trunc(min(ih,iw*16/9)/2)',scale=1080:1920:flags=lanczos,setsar=1[vbase]")
        elif needs_crop_to_16_9:
            video_filter_parts.append(f"{v_in}crop=w='2*trunc(min(iw,ih*16/9)/2)':h='2*trunc(min(ih,iw*9/16)/2)',scale=1920:1080:flags=lanczos,setsar=1[vbase]")
        elif aspect_ratio == "9:16" and vid_w > 0 and vid_h > 0 and (vid_w != 1080 or vid_h != 1920):
            video_filter_parts.append(f"{v_in}scale=1080:1920:flags=lanczos,setsar=1[vbase]")
        elif aspect_ratio == "16:9" and vid_w > 0 and vid_h > 0 and (vid_w != 1920 or vid_h != 1080):
            video_filter_parts.append(f"{v_in}scale=1920:1080:flags=lanczos,setsar=1[vbase]")
        else:
            video_filter_parts.append(f"{v_in}scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1[vbase]")

        # CTA badge handling
        if has_cta:
            chain1, y1 = build_cta_anim_chain(t1_start, t1_end, base_y)
            if t2_start is not None and t2_end is not None:
                chain2, y2 = build_cta_anim_chain(t2_start, t2_end, base_y)
                video_filter_parts.append(f"[{cta_idx}:v]format=rgba,split=2[b1raw][b2raw]")
                video_filter_parts.append(f"[b1raw]{chain1}[b1f]")
                video_filter_parts.append(f"[b2raw]{chain2}[b2f]")
                video_filter_parts.append(f"[vbase][b1f]overlay=x='{overlay_x}':y='{y1}':shortest=1:enable='between(t,{t1_start:.2f},{t1_end:.2f})'[vmid]")
                video_filter_parts.append(f"[vmid][b2f]overlay=x='{overlay_x}':y='{y2}':shortest=1:enable='between(t,{t2_start:.2f},{t2_end:.2f})'[vpost_cta]")
            else:
                video_filter_parts.append(f"[{cta_idx}:v]format=rgba,{chain1}[b1f]")
                video_filter_parts.append(f"[vbase][b1f]overlay=x='{overlay_x}':y='{y1}':shortest=1:enable='between(t,{t1_start:.2f},{t1_end:.2f})'[vpost_cta]")
        else:
            video_filter_parts.append("[vbase]null[vpost_cta]")

        # Subtitles (libass)
        if subtitle_filter and subtitle_filter.strip():
            video_filter_parts.append(f"[vpost_cta]{subtitle_filter.strip()}[vout]")
        else:
            video_filter_parts.append("[vpost_cta]null[vout]")

    out_audio_map = None
    if valid_bgm:
        bgm_vol = max(0.0, min(float(bgm_volume), 1.0))
        bgm_trim = f"atrim=start={bgm_start_sec:.3f},asetpts=PTS-STARTPTS," if bgm_start_sec > 0 else ""
        if has_audio:
            vocal_track = a_in if a_in else "[0:a]"
            audio_filter_parts.append(
                f"{vocal_track}volume=1.0[vocal]; "
                f"[{bgm_idx}:a]{bgm_trim}volume={bgm_vol:.2f}[bgm]; "
                f"[vocal][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix_raw]; "
                f"[amix_raw]alimiter=limit=0.95:attack=5:release=50:asc=1[aout]"
            )
            out_audio_map = "[aout]"
        else:
            audio_filter_parts.append(f"[{bgm_idx}:a]{bgm_trim}atrim=0:{dur_sec:.3f},asetpts=PTS-STARTPTS,volume={bgm_vol:.2f}[aout]")
            out_audio_map = "[aout]"
    else:
        if has_audio:
            out_audio_map = a_in if a_in else "0:a?"

    h264_level = "5.2" if target_fps == 120 else "4.2"
    maxrate_str = "15M" if target_fps == 120 else "10M"
    bufsize_str = "24M" if target_fps == 120 else "16M"
    minrate_str = None

    if target_bitrate_k and target_bitrate_k > 0:
        eff_min_k = min(min_bitrate_k, target_bitrate_k) if (min_bitrate_k and min_bitrate_k > 0) else None
        eff_max_k = max(max_bitrate_k, target_bitrate_k) if (max_bitrate_k and max_bitrate_k > 0) else int(target_bitrate_k * 1.2)
        bufsize_k = max(int(eff_max_k * 1.5), int(target_bitrate_k * 2))
        if eff_min_k:
            minrate_str = f"{eff_min_k}k"
        maxrate_str = f"{eff_max_k}k"
        bufsize_str = f"{bufsize_k}k"

    rate_control_flags = []
    if target_bitrate_k and target_bitrate_k > 0:
        if minrate_str:
            rate_control_flags.extend(["-minrate", minrate_str])
        rate_control_flags.extend(["-b:v", f"{target_bitrate_k}k", "-maxrate", maxrate_str, "-bufsize", bufsize_str])

    enc_flags = [
        "-threads", "0",
        "-c:v", "libx264",
        "-preset", "medium",
        "-profile:v", "high",
        "-level:v", h264_level,
        "-pix_fmt", "yuv420p"
    ]

    if target_bitrate_k and not two_pass:
        enc_flags.extend(rate_control_flags)
    elif not target_bitrate_k:
        enc_flags.extend(["-crf", "19", "-maxrate", maxrate_str, "-bufsize", bufsize_str])

    if target_fps:
        enc_flags.extend(["-r", str(target_fps), "-fps_mode", "cfr"])

    v_fc = "; ".join(video_filter_parts) if video_filter_parts else None
    full_fc = "; ".join(video_filter_parts + audio_filter_parts) if (video_filter_parts or audio_filter_parts) else None

    # Two-pass mode
    if two_pass and target_bitrate_k and has_video:
        with tempfile.TemporaryDirectory() as temp_dir:
            pass_logfile = Path(temp_dir) / "ffmpeg2pass"

            # Pass 1
            cmd_pass1 = list(base_video_inputs)
            if v_fc:
                cmd_pass1.extend(["-filter_complex", v_fc, "-map", "[vout]"])
            else:
                cmd_pass1.extend(["-map", "0:v"])
            cmd_pass1.extend([
                "-threads", "0",
                "-c:v", "libx264",
                "-preset", "medium",
                *rate_control_flags,
                "-profile:v", "high",
                "-level:v", h264_level,
                "-pix_fmt", "yuv420p"
            ])
            if target_fps:
                cmd_pass1.extend(["-r", str(target_fps), "-fps_mode", "cfr"])
            cmd_pass1.extend([
                "-pass", "1",
                "-passlogfile", str(pass_logfile).replace("\\", "/"),
                "-an",
                "-t", dur_str,
                "-f", "null",
                os.devnull
            ])
            _run_ffmpeg_monitored(
                cmd=cmd_pass1,
                dur_sec=dur_sec,
                progress_callback=progress_callback,
                base_pct=0,
                pct_weight=45,
                stage_name="Pase 1 (Análisis VBR)",
                output_path=None
            )

            # Pass 2
            cmd_pass2 = list(base_inputs)
            if full_fc:
                cmd_pass2.extend(["-filter_complex", full_fc, "-map", "[vout]"])
            else:
                cmd_pass2.extend(["-map", "0:v"])
            if out_audio_map:
                cmd_pass2.extend(["-map", out_audio_map, "-c:a", "aac", "-b:a", "192k"])
            else:
                cmd_pass2.append("-an")
            cmd_pass2.extend([
                "-threads", "0",
                "-c:v", "libx264",
                "-preset", "medium",
                *rate_control_flags,
                "-profile:v", "high",
                "-level:v", h264_level,
                "-pix_fmt", "yuv420p"
            ])
            if target_fps:
                cmd_pass2.extend(["-r", str(target_fps), "-fps_mode", "cfr"])
            cmd_pass2.extend([
                "-pass", "2",
                "-passlogfile", str(pass_logfile).replace("\\", "/"),
                "-movflags", "+faststart",
                "-t", dur_str,
                str(output_path)
            ])
            _run_ffmpeg_monitored(
                cmd=cmd_pass2,
                dur_sec=dur_sec,
                progress_callback=progress_callback,
                base_pct=45,
                pct_weight=54,
                stage_name="Pase 2 (Codificación final)",
                output_path=output_path
            )

    else:
        # Single-pass
        cmd = list(base_inputs)
        if has_video:
            if full_fc:
                cmd.extend(["-filter_complex", full_fc, "-map", "[vout]"])
            else:
                cmd.extend(["-map", "0:v"])
            cmd.extend(enc_flags)
        else:
            cmd.append("-vn")

        if out_audio_map:
            cmd.extend(["-map", out_audio_map, "-c:a", "aac", "-b:a", "192k"])
        else:
            cmd.append("-an")

        cmd.extend([
            "-movflags", "+faststart",
            "-t", dur_str,
            str(output_path)
        ])

        _run_ffmpeg_monitored(
            cmd=cmd,
            dur_sec=dur_sec,
            progress_callback=progress_callback,
            base_pct=0,
            pct_weight=99,
            stage_name="Codificando clip",
            output_path=output_path
        )

    if progress_callback:
        try:
            progress_callback(100, "¡Clip exportado exitosamente!")
        except Exception:
            pass

    if output_path.exists():
        size_mb = output_path.stat().st_size / (1024 * 1024)
        log_buffer.push(f"[FFmpeg] ¡Clip exportado exitosamente! {output_path.name} ({size_mb:.2f} MB)")

    return output_path

