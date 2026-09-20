import json
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional
import requests
import webview

from .db import Database
from .media import (
    command_exists,
    extract_audio,
    generate_srt,
    build_drawtext_filters,
    probe_media,
    render_flat_clip,
    render_compilation_video,
)
from .transcription import transcribe_local, transcribe_deepgram, whisper_available
from .llm import detect_candidates_pipeline, unload_all_ollama_models


class Api:
    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        os.makedirs(self.data_dir, exist_ok=True)
        self.db = Database(str(self.data_dir / "autoshorts.db"))
        self._window = None
        self._cancel_candidates_flag = False

    def set_window(self, window):
        self._window = window

    def emit(self, event_name: str, payload: Any):
        if self._window:
            payload_json = json.dumps(payload)
            js = f"""
            window.dispatchEvent(new CustomEvent('{event_name}', {{ detail: {payload_json} }}));
            """
            try:
                self._window.evaluate_js(js)
            except Exception as e:
                print(f"Error emitting event {event_name}: {e}")

    def invoke(self, command: str, args: Optional[Dict[str, Any]] = None) -> Any:
        args = args or {}
        if not hasattr(self, command):
            raise AttributeError(f"Unknown command: {command}")
        method = getattr(self, command)
        return method(args)

    def open_file_dialog(self, _args: Optional[Dict[str, Any]] = None) -> Optional[str]:
        """Opens native Windows file dialog and returns selected path."""
        if not self._window:
            return None
        file_types = (
            "Media Files (*.mp4;*.mov;*.mkv;*.mp3;*.wav;*.m4a)",
            "All Files (*.*)"
        )
        dialog_type = getattr(webview, "FileDialog", None)
        open_mode = dialog_type.OPEN if dialog_type else getattr(webview, "OPEN_DIALOG", 10)
        result = self._window.create_file_dialog(
            open_mode,
            allow_multiple=False,
            file_types=file_types
        )
        if result and len(result) > 0:
            return result[0]
        return None

    def get_app_config(self, _args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        config_path = self.data_dir / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def save_app_config(self, args: Any) -> Dict[str, Any]:
        config = args if isinstance(args, dict) else {}
        config_path = self.data_dir / "config.json"
        existing = self.get_app_config()
        existing.update(config)
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving config.json: {e}")
        return existing

    def environment_status(self, _args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        has_ollama = False
        installed_models = []
        try:
            r = requests.get("http://127.0.0.1:11434/api/tags", timeout=1.5)
            if r.ok:
                has_ollama = True
                data = r.json()
                installed_models = [m["name"] for m in data.get("models", []) if "name" in m]
        except Exception:
            pass

        has_ytdlp = False
        try:
            import yt_dlp
            has_ytdlp = True
        except ImportError:
            has_ytdlp = command_exists("yt-dlp")

        return {
            "dataDir": str(self.data_dir),
            "hasFfmpeg": command_exists("ffmpeg"),
            "hasFfprobe": command_exists("ffprobe"),
            "hasDeepgramKey": bool(os.getenv("DEEPGRAM_API_KEY")),
            "hasAnthropicKey": bool(os.getenv("ANTHROPIC_API_KEY")),
            "hasDeepseekKey": bool(os.getenv("DEEPSEEK_API_KEY")),
            "hasGeminiKey": bool(os.getenv("GEMINI_API_KEY")),
            "hasOpenaiKey": bool(os.getenv("OPENAI_API_KEY")),
            "hasOpenrouterKey": bool(os.getenv("OPENROUTER_API_KEY")),
            "hasGroqKey": bool(os.getenv("GROQ_API_KEY")),
            "llmProvider": os.getenv("LLM_PROVIDER", "local"),
            "hasLocalWhisperModel": whisper_available(),
            "hasOllama": has_ollama,
            "hasYtdlp": has_ytdlp,
            "installedOllamaModels": installed_models
        }

    def list_projects(self, _args: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        return self.db.list_projects()

    def get_project_detail(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        return self.db.get_project_detail(project_id)

    def create_project_from_path(self, args: Any) -> Dict[str, Any]:
        if isinstance(args, dict):
            source_path = args.get("sourcePath") or args.get("path")
            transcription_mode = args.get("transcriptionMode", "local")
            caption_style = args.get("captionStyle", "modern-box")
        else:
            source_path = args
            transcription_mode = "local"
            caption_style = "modern-box"

        if not os.path.exists(source_path):
            raise FileNotFoundError(f"File not found: {source_path}")

        duration = None
        try:
            probe = probe_media(source_path)
            duration = probe.get("durationSec")
        except Exception:
            pass

        return self.db.create_project(
            source_path=source_path,
            transcription_mode=transcription_mode,
            caption_style=caption_style,
            source_duration=duration
        )

    def probe_project(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        project = self.db.get_project(project_id)
        probe = probe_media(project["sourcePath"])
        self.db.update_project_status(project_id, "ingest", probe.get("durationSec"))
        return probe

    def extract_project_audio(self, args: Any) -> str:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        project = self.db.get_project(project_id)
        proj_dir = self.data_dir / "projects" / project_id
        audio_path = extract_audio(project["sourcePath"], proj_dir)
        return str(audio_path)

    def transcribe_project(self, args: Any) -> Dict[str, Any]:
        if isinstance(args, dict):
            project_id = args.get("projectId")
            provider = args.get("provider", "local")
            api_key = args.get("apiKey")
        else:
            project_id = args
            provider = "local"
            api_key = None

        project = self.db.get_project(project_id)
        self.db.update_project_status(project_id, "transcribing")
        proj_name = project.get("name") or project_id
        proj_dir = self.data_dir / "projects" / proj_name
        audio_path = extract_audio(project["sourcePath"], proj_dir)

        if provider == "deepgram":
            key = api_key or os.getenv("DEEPGRAM_API_KEY")
            if not key:
                raise ValueError("Deepgram API Key is required")
            transcript = transcribe_deepgram(str(audio_path), key)
        else:
            transcript = transcribe_local(str(audio_path), model_name="base")

        raw_json = json.dumps(transcript, ensure_ascii=False, indent=2)
        saved = self.db.save_transcript(
            project_id=project_id,
            engine=provider,
            raw_json=raw_json,
            language=transcript.get("language", "es")
        )
        self.db.update_project_status(project_id, "analyzing", transcript.get("duration"))
        return saved

    def save_demo_transcript(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        demo = {
            "language": "es",
            "duration": 180.0,
            "speakers": ["S1"],
            "words": [
                {"text": "Bienvenidos", "start": 0.5, "end": 1.2, "speaker": "S1"},
                {"text": "a", "start": 1.2, "end": 1.4, "speaker": "S1"},
                {"text": "AutoShorts", "start": 1.4, "end": 2.0, "speaker": "S1"},
            ],
            "segments": [
                {"start": 0.0, "end": 60.0, "speaker": "S1", "text": "Este es un momento épico en la partida..."},
                {"start": 60.0, "end": 120.0, "speaker": "S1", "text": "¡No me puedo creer lo que acaba de pasar!"}
            ]
        }
        raw_json = json.dumps(demo, ensure_ascii=False, indent=2)
        saved = self.db.save_transcript(project_id, "demo", raw_json, "es")
        self.db.update_project_status(project_id, "analyzing", 180.0)
        return saved

    def cancel_candidate_generation(self, _args: Any = None) -> bool:
        self._cancel_candidates_flag = True
        try:
            unload_all_ollama_models()
        except Exception:
            pass
        return True

    def generate_candidates(self, args: Any) -> List[Dict[str, Any]]:
        if isinstance(args, dict):
            project_id = args.get("projectId")
            api_key = args.get("apiKey")
            provider = args.get("provider", "local")
            model_name = args.get("modelName")
            content_type = args.get("contentType", "gaming")
            target_duration = args.get("targetDuration", "60s")
        else:
            project_id = args
            api_key = None
            provider = "local"
            model_name = None
            content_type = "gaming"
            target_duration = "60s"

        self._cancel_candidates_flag = False

        transcript_record = self.db.latest_transcript(project_id)
        if not transcript_record:
            raise ValueError("Transcribe the project before detecting moments.")

        normalized = json.loads(transcript_record["rawJson"])
        active_provider = provider or "local"

        def on_chunk_progress(status_msg, chunk_idx, total_chunks):
            self.emit("candidate-progress", {
                "message": status_msg,
                "current": chunk_idx,
                "total": total_chunks,
                "percentage": int((chunk_idx / total_chunks) * 100)
            })

        chosen_model = model_name
        if not chosen_model and active_provider in ["local", "ollama"]:
            env = self.environment_status()
            installed = env.get("installedOllamaModels", [])
            if installed:
                chosen_model = installed[0]
            else:
                chosen_model = "qwen2.5:7b"

        # Pipeline de detección de momentos destacados
        drafts = detect_candidates_pipeline(
            transcript=normalized,
            provider=active_provider,
            api_key=api_key,
            model_name=chosen_model or "qwen2.5:7b",
            content_type=content_type,
            target_duration=target_duration,
            on_progress=on_chunk_progress,
            is_cancelled=lambda: self._cancel_candidates_flag
        )

        if self._cancel_candidates_flag:
            if drafts:
                candidates = self.db.replace_candidates(project_id, drafts)
                self.db.update_project_status(project_id, "ready")
                return candidates
            self.db.update_project_status(project_id, "ready")
            return self.db.get_candidates(project_id)

        if not drafts:
            raise RuntimeError("No se detectaron momentos en la transcripción.")

        candidates = self.db.replace_candidates(project_id, drafts)
        self.db.update_project_status(project_id, "ready")
        return candidates

    def set_selected_clip_count(self, args: Any) -> List[Dict[str, Any]]:
        project_id = args.get("projectId")
        count = int(args.get("count", 3))
        return self.db.set_selected_clip_count(project_id, count)

    def select_output_directory(self, _args: Any = None) -> Optional[str]:
        if not self._window:
            return None
        dialog_type = getattr(webview, "FileDialog", None)
        folder_mode = dialog_type.FOLDER if dialog_type else getattr(webview, "FOLDER_DIALOG", 20)
        result = self._window.create_file_dialog(folder_mode)
        if result and len(result) > 0:
            return result[0]
        return None

    def render_flat_clip_for_candidate(self, args: Any) -> str:
        candidate_id = args.get("candidateId") if isinstance(args, dict) else args
        custom_dir = args.get("outputDir") if isinstance(args, dict) else None

        candidate, project = self.db.get_candidate_with_project(candidate_id)
        self.db.update_clip_for_candidate(candidate_id, "cutting")

        proj_name = project.get("name") or Path(project["sourcePath"]).stem or project["id"]
        if custom_dir:
            out_dir = Path(custom_dir)
        else:
            out_dir = Path.home() / "Documents" / "AutoShorts" / proj_name
        os.makedirs(out_dir, exist_ok=True)

        # Sanitize hook for filename: strip all emojis and invalid symbols
        raw_hook = candidate.get("hook", "").strip()
        no_emoji = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', raw_hook)
        safe_hook = re.sub(r'[\\/*?:"<>|#]', "", no_emoji)
        safe_hook = re.sub(r'\s+', ' ', safe_hook).strip()[:50]
        base_name = f"Clip {candidate['rank']:02d} - {safe_hook}" if safe_hook else f"Clip {candidate['rank']:02d}"
        output_path = out_dir / f"{base_name}.mp4"
        exported_srt_path = out_dir / f"{base_name}.srt"

        style = project.get("captionStyle") or "modern-box"
        drawtext_filters = None
        srt_path = None
        transcript_record = self.db.latest_transcript(project["id"])
        if transcript_record:
            try:
                normalized = json.loads(transcript_record["rawJson"])
                words = normalized.get("words", [])
                srt_content = generate_srt(words, candidate["startSec"], candidate["endSec"])

                # Always export the .srt alongside the .mp4 in the user's export folder!
                with open(exported_srt_path, "w", encoding="utf-8") as f:
                    f.write(srt_content)
                srt_path = str(exported_srt_path)

                # Only burn subtitles if style is not "none"
                if style != "none":
                    probe = probe_media(project["sourcePath"])
                    iw = probe.get("width") or 1920
                    ih = probe.get("height") or 1080
                    cropped_width = int(round(min(iw, ih * 9 / 16)))
                    drawtext_filters = build_drawtext_filters(
                        words=words,
                        start_sec=candidate["startSec"],
                        end_sec=candidate["endSec"],
                        cropped_width=cropped_width,
                        caption_style=style
                    )
            except Exception as e:
                print(f"Warning building captions: {e}")

        rendered_path = render_flat_clip(
            source_path=project["sourcePath"],
            start_sec=candidate["startSec"],
            end_sec=candidate["endSec"],
            output_path=output_path,
            drawtext_filters=drawtext_filters
        )

        self.db.update_clip_for_candidate(
            candidate_id=candidate_id,
            status="done",
            output_path=str(rendered_path),
            caption_path=srt_path
        )
        return str(rendered_path)

    def render_auto_summary(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId")
        target_minutes = float(args.get("targetDurationMinutes", 8.0))
        target_seconds = target_minutes * 60.0
        aspect_ratio = args.get("aspectRatio", "original")
        custom_dir = args.get("outputDir")
        specific_candidate_ids = args.get("candidateIds")

        project = self.db.get_project(project_id)
        all_candidates = self.db.get_candidates(project_id)
        if not all_candidates:
            raise ValueError("El proyecto no tiene momentos candidatos detectados para compilar un resumen.")

        # If specific candidate IDs are provided, use them; otherwise, perform intelligent greedy selection
        if specific_candidate_ids and isinstance(specific_candidate_ids, list) and len(specific_candidate_ids) > 0:
            selected_candidates = [c for c in all_candidates if c["id"] in specific_candidate_ids]
            selected_candidates.sort(key=lambda c: c["startSec"])
        else:
            candidates_by_score = sorted(all_candidates, key=lambda c: c["score"], reverse=True)
            chosen = []
            current_total_dur = 0.0

            # 1. Best hook for intro teaser
            intro = candidates_by_score[0]
            chosen.append(intro)
            current_total_dur += (intro["endSec"] - intro["startSec"])

            # 2. Add remaining high-scoring clips chronologically
            remaining = [c for c in all_candidates if c["id"] != intro["id"]]
            remaining.sort(key=lambda c: c["startSec"])

            for c in remaining:
                dur = c["endSec"] - c["startSec"]
                if (current_total_dur + dur) <= (target_seconds + 30.0):
                    chosen.append(c)
                    current_total_dur += dur
                if current_total_dur >= target_seconds:
                    break

            selected_candidates = chosen

        if not selected_candidates:
            raise ValueError("No se pudieron seleccionar fragmentos para el video resumen.")

        segments = [
            {"start": c["startSec"], "end": c["endSec"]}
            for c in selected_candidates
        ]
        total_duration = sum(s["end"] - s["start"] for s in segments)

        proj_name = project.get("name") or Path(project["sourcePath"]).stem or project["id"]
        if custom_dir:
            out_dir = Path(custom_dir)
        else:
            out_dir = Path.home() / "Documents" / "AutoShorts" / proj_name
        os.makedirs(out_dir, exist_ok=True)

        ratio_tag = "16x9" if aspect_ratio == "original" else "9x16"
        mins_tag = f"{int(round(target_minutes))}min"
        clean_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', proj_name)
        clean_name = re.sub(r'[\\/*?:"<>|#]', "", clean_name).strip()[:40]
        output_filename = f"Resumen Stream - {clean_name} - {mins_tag} - {ratio_tag}.mp4"
        output_path = out_dir / output_filename

        self.emit("summary-progress", {
            "status": "rendering",
            "message": f"Compilando {len(segments)} momentos ({int(total_duration // 60)}m {int(total_duration % 60)}s) en FFmpeg...",
            "percentage": 50
        })

        rendered_path = render_compilation_video(
            source_path=project["sourcePath"],
            segments=segments,
            output_path=output_path,
            aspect_ratio=aspect_ratio
        )

        self.emit("summary-progress", {
            "status": "done",
            "message": "Video resumen generado exitosamente.",
            "percentage": 100
        })

        return {
            "outputPath": str(rendered_path),
            "clipCount": len(segments),
            "duration": round(total_duration, 1),
            "filename": output_filename,
            "aspectRatio": aspect_ratio
        }

    def delete_project(self, args: Any):
        project_id = args.get("projectId") if isinstance(args, dict) else args
        self.db.delete_project(project_id)

    def rename_project(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId")
        name = args.get("name")
        return self.db.rename_project(project_id, name)

    def update_transcript_segment(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId")
        index = int(args.get("index", 0))
        new_text = args.get("text", "").strip()
        record = self.db.latest_transcript(project_id)
        if not record:
            raise ValueError("No transcript found")
        data = json.loads(record["rawJson"])
        segs = data.get("segments", [])
        if 0 <= index < len(segs):
            segs[index]["text"] = new_text
            raw_json = json.dumps(data, ensure_ascii=False, indent=2)
            self.db.save_transcript(project_id, record["engine"], raw_json, record["language"])
        return {"success": True}

    def check_youtube_copyright(self, args: Any) -> Dict[str, Any]:
        url = args.get("url") if isinstance(args, dict) else args
        try:
            import yt_dlp
            ydl_opts = {"quiet": True, "no_warnings": True}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                license_str = info.get("license", "Standard YouTube License")
                is_safe = "creative commons" in str(license_str).lower()
                return {
                    "isSafe": is_safe,
                    "license": license_str
                }
        except Exception as e:
            return {"isSafe": True, "license": str(e)}

    def download_youtube_video(self, args: Any) -> str:
        url = args.get("url") if isinstance(args, dict) else args
        import yt_dlp
        download_dir = Path.home() / "Downloads" / "AutoShorts"
        os.makedirs(download_dir, exist_ok=True)
        out_template = str(download_dir / "%(title)s.%(ext)s")
        ydl_opts = {
            "outtmpl": out_template,
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "quiet": False
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            return str(filename)

    def pull_ollama_model(self, args: Any):
        model_name = args.get("modelName") if isinstance(args, dict) else args
        url = "http://127.0.0.1:11434/api/pull"
        with requests.post(url, json={"name": model_name, "stream": True}, stream=True, timeout=600) as resp:
            if not resp.ok:
                raise RuntimeError(f"Ollama pull failed ({resp.status_code}): {resp.text}")
            for line in resp.iter_lines():
                if line:
                    data = json.loads(line.decode("utf-8"))
                    completed = data.get("completed", 0)
                    total = data.get("total", 1)
                    pct = int((completed / total) * 100) if total else 0
                    self.emit("ollama-pull-progress", {
                        "status": data.get("status", "Downloading..."),
                        "completed": completed,
                        "total": total,
                        "percentage": pct
                    })
        return True

    def install_ollama(self, _args: Any = None):
        raise RuntimeError("Descarga e instala Ollama desde https://ollama.com")

    def open_folder(self, args: Any):
        path = args.get("path") if isinstance(args, dict) else args
        if path:
            p = Path(path)
            folder = p.parent if p.is_file() else p
            if folder.exists():
                try:
                    os.startfile(str(folder))
                except Exception as e:
                    print(f"Error opening folder: {e}")
        return True
