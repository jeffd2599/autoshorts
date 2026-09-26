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
    extract_video_thumbnail,
    generate_srt,
    build_drawtext_filters,
    probe_media,
    render_flat_clip,
    render_compilation_video,
    render_autoedit_video,
    inject_acoustic_cues_into_transcript,
)
from .transcription import transcribe_local, transcribe_deepgram, whisper_available, get_installed_whisper_models
from .llm import (
    detect_candidates_pipeline,
    unload_all_ollama_models,
    plan_summary_narrative,
    plan_autoedit_narrative,
    refine_transcript_with_llm,
    DEFAULT_MOMENTS_PROMPT,
    generate_social_copy_with_llm
)
from .telemetry import get_hardware_telemetry


def rebuild_words_from_segments(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    words = []
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        seg_words = text.split()
        if not seg_words:
            continue
        start = float(seg.get("start", 0.0))
        end = float(seg.get("end", start + 1.0))
        seg_duration = max(0.05, end - start)
        step = seg_duration / len(seg_words)
        for idx, w in enumerate(seg_words):
            w_start = start + idx * step
            w_end = w_start + step
            words.append({
                "text": w,
                "start": round(w_start, 2),
                "end": round(w_end, 2),
                "speaker": seg.get("speaker", "S1")
            })
    return words


class Api:
    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = Path(data_dir) if data_dir else Path("data")
        os.makedirs(self.data_dir, exist_ok=True)
        self.db = Database(str(self.data_dir / "autoshorts.db"))
        self._window = None
        self._cancel_candidates_flag = False
        self._cancel_transcription_flag = False

    def get_project_dir(self, project: Dict[str, Any]) -> Path:
        proj_dir_val = project.get("projectDir")
        if proj_dir_val and str(proj_dir_val).strip():
            p = Path(str(proj_dir_val).strip())
        else:
            proj_name = project.get("name") or (Path(project["sourcePath"]).stem if project.get("sourcePath") else project["id"])
            clean_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', proj_name)
            clean_name = re.sub(r'[\\/*?:"<>|#]', "", clean_name).strip() or project["id"]
            p = Path.home() / "Documents" / "AutoShorts" / clean_name
            try:
                self.db.update_project_dir(project["id"], str(p))
            except Exception:
                pass

        os.makedirs(p, exist_ok=True)
        os.makedirs(p / "audio", exist_ok=True)
        os.makedirs(p / "clips", exist_ok=True)
        os.makedirs(p / "summary", exist_ok=True)
        return p

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
            "whisperModels": get_installed_whisper_models(),
            "hasOllama": has_ollama,
            "hasYtdlp": has_ytdlp,
            "installedOllamaModels": installed_models
        }

    def list_projects(self, _args: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        projs = self.db.list_projects()
        for p in projs:
            p["sourceExists"] = os.path.exists(p["sourcePath"]) if p.get("sourcePath") else False
        return projs

    def get_project_detail(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        detail = self.db.get_project_detail(project_id)
        if detail and "project" in detail:
            sp = detail["project"].get("sourcePath")
            detail["project"]["sourceExists"] = os.path.exists(sp) if sp else False
        return detail

    def get_default_project_dir(self, args: Any) -> str:
        source_path = args.get("sourcePath") if isinstance(args, dict) else args
        proj_name = Path(source_path).stem if source_path else "Proyecto"
        clean_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', proj_name)
        clean_name = re.sub(r'[\\/*?:"<>|#]', "", clean_name).strip() or "Proyecto"
        return str(Path.home() / "Documents" / "AutoShorts" / clean_name)

    def create_project_from_path(self, args: Any) -> Dict[str, Any]:
        if isinstance(args, dict):
            source_path = args.get("sourcePath") or args.get("path")
            transcription_mode = args.get("transcriptionMode", "local")
            caption_style = args.get("captionStyle", "modern-box")
            custom_project_dir = args.get("projectDir")
            move_source_video = bool(args.get("moveSourceVideo", False))
        else:
            source_path = args
            transcription_mode = "local"
            caption_style = "modern-box"
            custom_project_dir = None
            move_source_video = False

        if not os.path.exists(source_path):
            raise FileNotFoundError(f"File not found: {source_path}")

        if custom_project_dir and str(custom_project_dir).strip():
            target_dir = Path(str(custom_project_dir).strip())
        else:
            proj_name = Path(source_path).stem
            clean_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', proj_name)
            clean_name = re.sub(r'[\\/*?:"<>|#]', "", clean_name).strip() or "Proyecto"
            target_dir = Path.home() / "Documents" / "AutoShorts" / clean_name

        os.makedirs(target_dir, exist_ok=True)
        os.makedirs(target_dir / "audio", exist_ok=True)
        os.makedirs(target_dir / "clips", exist_ok=True)
        os.makedirs(target_dir / "summary", exist_ok=True)

        if move_source_video:
            target_file = target_dir / Path(source_path).name
            if target_file.resolve() != Path(source_path).resolve():
                try:
                    shutil.move(source_path, str(target_file))
                    source_path = str(target_file)
                except Exception as e:
                    print(f"Warning: could not move source video to project dir: {e}")
                    try:
                        shutil.copy2(source_path, str(target_file))
                        source_path = str(target_file)
                    except Exception:
                        pass

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
            source_duration=duration,
            project_dir=str(target_dir)
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
        proj_dir = self.get_project_dir(project)
        audio_path = extract_audio(project["sourcePath"], proj_dir / "audio")
        return str(audio_path)

    def transcribe_project(self, args: Any) -> Dict[str, Any]:
        if isinstance(args, dict):
            project_id = args.get("projectId")
            provider = args.get("provider", "local")
            api_key = args.get("apiKey")
            whisper_model = args.get("whisperModel") or "base"
            refine_with_llm = bool(args.get("refineWithLlm", False))
            llm_engine = args.get("llmEngine", "local")
            llm_model = args.get("llmModel")
            llm_api_key = args.get("llmApiKey")
            enable_thinking = bool(args.get("enableThinking", False))
        else:
            project_id = args
            provider = "local"
            api_key = None
            whisper_model = "base"
            refine_with_llm = False
            llm_engine = "local"
            llm_model = None
            llm_api_key = None
            enable_thinking = False

        self._cancel_transcription_flag = False
        project = self.db.get_project(project_id)
        self.db.update_project_status(project_id, "transcribing")
        proj_dir = self.get_project_dir(project)
        audio_path = extract_audio(project["sourcePath"], proj_dir / "audio")

        if self._cancel_transcription_flag:
            self.db.update_project_status(project_id, "created")
            return {}

        def on_whisper_progress(pct: int):
            msg = f"Transcribiendo con Whisper ({pct}%)"
            self.emit("transcription-progress", {"percentage": pct, "message": msg})

        if provider == "deepgram":
            key = api_key or os.getenv("DEEPGRAM_API_KEY")
            if not key:
                raise ValueError("Deepgram API Key is required")
            transcript = transcribe_deepgram(str(audio_path), key)
        else:
            transcript = transcribe_local(
                str(audio_path),
                model_name=whisper_model,
                progress_callback=on_whisper_progress
            )

        if self._cancel_transcription_flag:
            self.db.update_project_status(project_id, "created")
            return {}

        if refine_with_llm and transcript.get("segments"):
            try:
                def on_refine_progress(msg, cur, tot):
                    pct = int(round((cur / max(1, tot)) * 100))
                    self.emit("transcription-progress", {"percentage": pct, "message": msg})
                    self.emit("candidate-progress", {"message": msg, "current": cur, "total": tot})

                print(f"Perfeccionando transcripción con IA ({llm_engine}:{llm_model})...")
                refined_segments = refine_transcript_with_llm(
                    transcript.get("segments", []),
                    model_name=llm_model or "qwen2.5:7b",
                    provider=llm_engine or "local",
                    api_key=llm_api_key,
                    enable_thinking=enable_thinking,
                    on_progress=on_refine_progress,
                    is_cancelled=lambda: self._cancel_candidates_flag or self._cancel_transcription_flag
                )
                if self._cancel_transcription_flag:
                    self.db.update_project_status(project_id, "created")
                    return {}
                transcript["segments"] = refined_segments
                transcript["words"] = rebuild_words_from_segments(refined_segments)
            except Exception as e:
                print(f"Nota en perfeccionamiento automático: {e}")

        if self._cancel_transcription_flag:
            self.db.update_project_status(project_id, "created")
            return {}

        # 3. Detect gunfire/explosions during silence and streamer shouts/screams
        try:
            print("Analizando audio para detectar disparos en silencio y gritos de streamer...")
            segs, words = inject_acoustic_cues_into_transcript(
                transcript.get("segments", []),
                transcript.get("words", []),
                str(audio_path)
            )
            transcript["segments"] = segs
            transcript["words"] = words
        except Exception as e:
            print(f"Nota en detección acústica de disparos y gritos: {e}")

        raw_json = json.dumps(transcript, ensure_ascii=False, indent=2)
        saved = self.db.save_transcript(
            project_id=project_id,
            engine=provider,
            raw_json=raw_json,
            language=transcript.get("language", "es")
        )
        self.db.update_project_status(project_id, "analyzing", transcript.get("duration"))
        return saved

    def inject_acoustic_cues(self, args: Any) -> Dict[str, Any]:
        """
        Runs acoustic detection on the project's audio to find gunshots/combat during silence
        and shouting peaks, injecting (DISPAROS / ACCIÓN) and (GRITOS / EUFORIA) into the transcript.
        """
        project_id = args.get("projectId") if isinstance(args, dict) else args
        detail = self.db.get_project_detail(project_id)
        transcript_record = detail.get("transcript")
        if not transcript_record:
            raise ValueError("El proyecto aún no tiene transcripción generada.")

        transcript_data = json.loads(transcript_record["rawJson"])
        proj_dir = self.get_project_dir(detail["project"])
        audio_path = proj_dir / "audio" / "transcription_audio.wav"
        if not audio_path.exists():
            audio_path = extract_audio(detail["project"]["sourcePath"], proj_dir / "audio")

        segs, words = inject_acoustic_cues_into_transcript(
            transcript_data.get("segments", []),
            transcript_data.get("words", []),
            str(audio_path)
        )
        transcript_data["segments"] = segs
        transcript_data["words"] = words

        raw_json = json.dumps(transcript_data, ensure_ascii=False, indent=2)
        saved = self.db.save_transcript(
            project_id=project_id,
            engine=transcript_record.get("engine", "local"),
            raw_json=raw_json,
            language=transcript_data.get("language", "es")
        )
        return saved

    def cancel_transcription(self, _args: Any = None) -> bool:
        self._cancel_transcription_flag = True
        self._cancel_candidates_flag = True
        try:
            unload_all_ollama_models()
        except Exception:
            pass
        return True

    def refine_project_transcript(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        llm_engine = args.get("provider", "local") if isinstance(args, dict) else "local"
        llm_model = args.get("modelName") if isinstance(args, dict) else None
        llm_api_key = args.get("apiKey") if isinstance(args, dict) else None
        enable_thinking = bool(args.get("enableThinking", False)) if isinstance(args, dict) else False

        detail = self.db.get_project_detail(project_id)
        transcript_record = detail.get("transcript")
        if not transcript_record:
            raise ValueError("El proyecto aún no tiene transcripción generada.")

        parsed_transcript = json.loads(transcript_record["rawJson"])
        segments = parsed_transcript.get("segments", [])
        if not segments:
            raise ValueError("La transcripción no contiene segmentos de voz.")

        self._cancel_candidates_flag = False
        def on_refine_progress(msg, cur, tot):
            if self._window:
                self._window.evaluate_js(f"window.__emitEvent && window.__emitEvent('candidate-progress', {{ message: '{msg}', current: {cur}, total: {tot} }})")

        refined_segments = refine_transcript_with_llm(
            segments,
            model_name=llm_model or "qwen2.5:7b",
            provider=llm_engine,
            api_key=llm_api_key,
            enable_thinking=enable_thinking,
            on_progress=on_refine_progress,
            is_cancelled=lambda: self._cancel_candidates_flag
        )
        parsed_transcript["segments"] = refined_segments
        parsed_transcript["words"] = rebuild_words_from_segments(refined_segments)

        raw_json = json.dumps(parsed_transcript, ensure_ascii=False, indent=2)
        saved = self.db.save_transcript(
            project_id=project_id,
            engine=transcript_record.get("engine", "local"),
            raw_json=raw_json,
            language=parsed_transcript.get("language", "es")
        )
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

    def get_hardware_telemetry(self, _args: Any = None) -> Dict[str, Any]:
        return get_hardware_telemetry()

    def get_whisper_models(self, _args: Any = None) -> List[Dict[str, Any]]:
        return get_installed_whisper_models()

    def get_default_moments_prompt(self, _args: Any = None) -> str:
        return DEFAULT_MOMENTS_PROMPT

    def generate_project_copy(self, args: Any) -> Dict[str, Any]:
        if not isinstance(args, dict):
            raise ValueError("Invalid arguments")
        project_id = args.get("projectId")
        provider = args.get("provider", "local")
        model_name = args.get("modelName")
        api_key = args.get("apiKey")
        enable_thinking = bool(args.get("enableThinking", False))
        extra_context = args.get("extraContext")

        detail = self.db.get_project_detail(project_id)
        transcript_record = detail.get("transcript")
        if not transcript_record:
            raise ValueError("El proyecto aún no tiene transcripción generada.")

        parsed_transcript = json.loads(transcript_record["rawJson"])
        segments = parsed_transcript.get("segments", [])
        if not segments:
            raise ValueError("La transcripción no contiene segmentos de voz.")

        full_text = " ".join([s.get("text", "").strip() for s in segments if s.get("text")])

        print(f"Generando copy para redes con IA ({provider}:{model_name})...")
        copy_data = generate_social_copy_with_llm(
            transcript_text=full_text,
            model_name=model_name or "qwen2.5:7b",
            provider=provider,
            api_key=api_key,
            enable_thinking=enable_thinking,
            extra_context=extra_context
        )
        return copy_data

    def generate_candidates(self, args: Any) -> List[Dict[str, Any]]:
        if isinstance(args, dict):
            project_id = args.get("projectId")
            api_key = args.get("apiKey")
            provider = args.get("provider", "local")
            model_name = args.get("modelName")
            content_type = args.get("contentType", "gaming")
            target_duration = args.get("targetDuration", "60s")
            enable_thinking = bool(args.get("enableThinking", False))
            custom_prompt = args.get("customPrompt")
        else:
            project_id = args
            api_key = None
            provider = "local"
            model_name = None
            content_type = "gaming"
            target_duration = "60s"
            enable_thinking = False
            custom_prompt = None

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

        proj = self.db.get_project(project_id)
        proj_dir = self.get_project_dir(proj)
        new_audio_path = proj_dir / "audio" / "transcription_audio.wav"
        old_audio_path = self.data_dir / "projects" / project_id / "transcription_audio.wav"
        old_audio_path2 = self.data_dir / "projects" / (proj.get("name") or project_id) / "transcription_audio.wav"

        if new_audio_path.exists():
            audio_path = str(new_audio_path)
        elif old_audio_path.exists():
            audio_path = str(old_audio_path)
        elif old_audio_path2.exists():
            audio_path = str(old_audio_path2)
        else:
            audio_path = str(new_audio_path)

        # Pipeline de detección de momentos destacados
        drafts = detect_candidates_pipeline(
            transcript=normalized,
            provider=active_provider,
            api_key=api_key,
            model_name=chosen_model or "qwen2.5:7b",
            content_type=content_type,
            target_duration=target_duration,
            enable_thinking=enable_thinking,
            on_progress=on_chunk_progress,
            is_cancelled=lambda: self._cancel_candidates_flag,
            audio_path=audio_path if os.path.exists(audio_path) else None,
            custom_prompt=custom_prompt
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
        aspect_ratio = args.get("aspectRatio", "original") if isinstance(args, dict) else "original"

        candidate, project = self.db.get_candidate_with_project(candidate_id)
        self.db.update_clip_for_candidate(candidate_id, "cutting")

        if custom_dir:
            out_dir = Path(custom_dir)
        else:
            proj_dir = self.get_project_dir(project)
            out_dir = proj_dir / "clips"
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
                    if aspect_ratio == "9:16":
                        cropped_width = int(round(min(iw, ih * 9 / 16)))
                    else:
                        cropped_width = int(iw)
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
            drawtext_filters=drawtext_filters,
            aspect_ratio=aspect_ratio
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

        # Read active LLM config for narrative sequencing
        app_cfg = self.get_app_config()
        llm_engine = app_cfg.get("llmEngine", "local")
        model_name = app_cfg.get("localLlmModel") if llm_engine == "local" else (
            app_cfg.get("deepseekModel") if llm_engine == "deepseek" else (
                app_cfg.get("openrouterModel") if llm_engine == "openrouter" else None
            )
        )
        api_key = (
            app_cfg.get("anthropicKey") if llm_engine == "claude" else (
                app_cfg.get("deepseekKey") if llm_engine == "deepseek" else (
                    app_cfg.get("geminiKey") if llm_engine == "gemini" else (
                        app_cfg.get("openaiKey") if llm_engine == "openai" else (
                            app_cfg.get("openrouterKey") if llm_engine == "openrouter" else (
                                app_cfg.get("groqKey") if llm_engine == "groq" else None
                            )
                        )
                    )
                )
            )
        )

        summary_vibe = args.get("summaryVibe", "balanced")
        narrative_title = "Resumen del Stream"
        storyline = "Secuencia cronológica optimizada"
        thumbnail_ideas = ["¡MOMENTOS ÉPICOS!", "NO TE LO PIERDAS", "FINAL DEL STREAM"]

        # If specific candidate IDs are provided, use them; otherwise consult the AI for the narrative order!
        if specific_candidate_ids and isinstance(specific_candidate_ids, list) and len(specific_candidate_ids) > 0:
            candidate_map = {c["id"]: c for c in all_candidates}
            selected_candidates = [candidate_map[cid] for cid in specific_candidate_ids if cid in candidate_map]
        else:
            self.emit("summary-progress", {
                "status": "planning",
                "message": f"Consultando a la IA el mejor orden narrativo (estilo: {summary_vibe})...",
                "percentage": 5
            })

            plan = plan_summary_narrative(
                candidates=all_candidates,
                target_duration_minutes=target_minutes,
                provider=llm_engine,
                model_name=model_name,
                api_key=api_key,
                summary_vibe=summary_vibe
            )
            narrative_title = plan.get("narrative_title", narrative_title)
            storyline = plan.get("storyline", storyline)
            thumbnail_ideas = plan.get("thumbnail_ideas", thumbnail_ideas)
            ordered_ids = plan.get("ordered_clip_ids", [])

            candidate_map = {c["id"]: c for c in all_candidates}
            
            # Follow the AI's narrative order while strictly respecting the target duration budget!
            chosen = []
            accumulated_dur = 0.0
            source_ids = ordered_ids if ordered_ids else [c["id"] for c in sorted(all_candidates, key=lambda c: c["score"], reverse=True)]

            for cid in source_ids:
                if cid not in candidate_map:
                    continue
                c = candidate_map[cid]
                dur = max(1.0, float(c["endSec"]) - float(c["startSec"]))

                # Always keep at least 2 clips (hook + context)
                if len(chosen) < 2:
                    chosen.append(c)
                    accumulated_dur += dur
                    continue

                # If adding this clip exceeds target + 30s buffer, stop if we already have sufficient duration
                if (accumulated_dur + dur) > (target_seconds + 30.0):
                    if accumulated_dur >= (target_seconds * 0.80):
                        break

                chosen.append(c)
                accumulated_dur += dur

                # Once target duration is reached or slightly passed with complete clips, stop
                if accumulated_dur >= target_seconds:
                    break

            selected_candidates = chosen if chosen else [all_candidates[0]]

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
            proj_dir = self.get_project_dir(project)
            out_dir = proj_dir / "summary"
        os.makedirs(out_dir, exist_ok=True)

        ratio_tag = "16x9" if aspect_ratio == "original" else "9x16"
        mins_tag = f"{int(round(target_minutes))}min"
        clean_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', proj_name)
        clean_name = re.sub(r'[\\/*?:"<>|#]', "", clean_name).strip()[:40]
        output_filename = f"Resumen Stream - {clean_name} - {mins_tag} - {ratio_tag}.mp4"
        output_path = out_dir / output_filename

        def on_render_progress(current_idx: int, total_segs: int, msg: str):
            pct = 10 + int((current_idx / max(1, total_segs)) * 85)
            self.emit("summary-progress", {
                "status": "rendering",
                "message": msg,
                "percentage": min(95, pct)
            })

        rendered_path = render_compilation_video(
            source_path=project["sourcePath"],
            segments=segments,
            output_path=output_path,
            aspect_ratio=aspect_ratio,
            progress_callback=on_render_progress
        )

        # 1. Build YouTube chapters string
        timestamps = []
        current_time = 0.0
        for idx, c in enumerate(selected_candidates):
            mins = int(current_time // 60)
            secs = int(current_time % 60)
            hook_clean = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', c.get("hook", f"Momento {idx+1}")).strip()
            timestamps.append(f"{mins}:{secs:02d} {hook_clean}")
            current_time += (float(c["endSec"]) - float(c["startSec"]))

        youtube_chapters = "\n".join(timestamps)

        # 2. Extract 1080p thumbnail image from best candidate
        thumbnail_filename = f"Resumen Stream - {clean_name} - {mins_tag} - Miniatura.jpg"
        thumbnail_path = out_dir / thumbnail_filename
        best_cand = max(selected_candidates, key=lambda c: c.get("score", 0))
        thumb_time = float(best_cand["startSec"]) + min(5.0, max(0.5, (float(best_cand["endSec"]) - float(best_cand["startSec"])) / 3.0))
        thumb_str = None
        try:
            extract_video_thumbnail(project["sourcePath"], thumb_time, thumbnail_path)
            thumb_str = str(thumbnail_path)
        except Exception as e:
            print(f"Nota extrayendo miniatura: {e}")

        # 3. Save companion YouTube description file
        desc_filename = f"Resumen Stream - {clean_name} - {mins_tag} - Descripcion_YouTube.txt"
        desc_path = out_dir / desc_filename
        try:
            with open(desc_path, "w", encoding="utf-8") as f:
                f.write(f"TITULO RECOMENDADO:\n{narrative_title}\n\n")
                f.write(f"RESUMEN Y GUION:\n{storyline}\n\n")
                if thumbnail_ideas:
                    f.write("IDEAS PARA EL TEXTO DE LA MINIATURA:\n" + "\n".join(f"- {t}" for t in thumbnail_ideas) + "\n\n")
                f.write(f"CAPITULOS Y TIMESTAMPS PARA YOUTUBE:\n{youtube_chapters}\n")
        except Exception as e:
            print(f"Nota guardando descripcion de YouTube: {e}")

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
            "aspectRatio": aspect_ratio,
            "narrativeTitle": narrative_title,
            "storyline": storyline,
            "youtubeChapters": youtube_chapters,
            "thumbnailPath": thumb_str,
            "thumbnailIdeas": thumbnail_ideas,
            "descriptionPath": str(desc_path)
        }

    def cancel_auto_edit(self, _args: Any = None) -> bool:
        self._cancel_autoedit_flag = True
        return True

    def render_auto_edit(self, args: Any) -> Dict[str, Any]:
        self._cancel_autoedit_flag = False
        project_id = args.get("projectId")
        format_mode = args.get("formatMode", "youtube")  # "youtube" | "shorts"
        target_minutes = float(args.get("targetDurationMinutes", 12.0 if format_mode == "youtube" else 2.0))
        include_teaser = bool(args.get("includeTeaser", True))
        trim_silences = bool(args.get("trimSilences", True))
        custom_dir = args.get("outputDir")

        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Proyecto {project_id} no encontrado.")

        all_candidates = self.db.get_candidates(project_id)
        if not all_candidates:
            raise ValueError("El proyecto no tiene momentos candidatos detectados para autoeditar.")

        app_cfg = self.get_app_config()
        llm_engine = app_cfg.get("llmEngine", "local")
        model_name = app_cfg.get("localLlmModel") if llm_engine == "local" else (
            app_cfg.get("deepseekModel") if llm_engine == "deepseek" else (
                app_cfg.get("openrouterModel") if llm_engine == "openrouter" else None
            )
        )
        api_key = (
            app_cfg.get("anthropicKey") if llm_engine == "claude" else (
                app_cfg.get("deepseekKey") if llm_engine == "deepseek" else (
                    app_cfg.get("geminiKey") if llm_engine == "gemini" else (
                        app_cfg.get("openaiKey") if llm_engine == "openai" else (
                            app_cfg.get("openrouterKey") if llm_engine == "openrouter" else (
                                app_cfg.get("groqKey") if llm_engine == "groq" else None
                            )
                        )
                    )
                )
            )
        )

        self.emit("autoedit-progress", {
            "status": "planning",
            "message": "Estructurando guion narrativo y ubicando momentos con IA...",
            "percentage": 10
        })

        # Load project transcript segments to intelligently locate exact active moments/punchlines
        transcript_segments = []
        try:
            record = self.db.latest_transcript(project_id)
            if record and record.get("rawJson"):
                t_data = json.loads(record["rawJson"])
                transcript_segments = t_data.get("segments", [])
        except Exception as e:
            print(f"Aviso al cargar transcripción para autoedición: {e}")

        plan = plan_autoedit_narrative(
            candidates=all_candidates,
            target_duration_minutes=target_minutes,
            format_mode=format_mode,
            include_teaser=include_teaser,
            provider=llm_engine,
            model_name=model_name,
            api_key=api_key,
            transcript_segments=transcript_segments
        )

        if getattr(self, "_cancel_autoedit_flag", False):
            raise RuntimeError("Autoedición cancelada por el usuario.")

        proj_name = project.get("name") or Path(project["sourcePath"]).stem or project["id"]
        clean_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', proj_name)
        clean_name = re.sub(r'[\\/*?:"<>|#]', "", clean_name).strip()[:40]

        if custom_dir:
            out_dir = Path(custom_dir)
        else:
            proj_dir = self.get_project_dir(project)
            out_dir = proj_dir / "autoedit"
        os.makedirs(out_dir, exist_ok=True)

        mode_label = "YouTube" if format_mode == "youtube" else "Shorts"
        dur_label = f"{int(round(target_minutes))}m" if target_minutes >= 1.0 else f"{int(round(target_minutes*60))}s"
        output_filename = f"AutoEdit_{mode_label}_{dur_label}_{clean_name}.mp4"
        output_path = out_dir / output_filename

        aspect_ratio = "9:16" if format_mode == "shorts" else "original"

        def on_render_progress(current_idx: int, total_segs: int, msg: str):
            pct = 15 + int((current_idx / max(1, total_segs)) * 80)
            self.emit("autoedit-progress", {
                "status": "rendering",
                "message": msg,
                "percentage": min(95, pct)
            })

        def is_cancelled():
            return getattr(self, "_cancel_autoedit_flag", False)

        target_max_sec = target_minutes * 60.0

        render_res = render_autoedit_video(
            source_path=project["sourcePath"],
            plan=plan,
            aspect_ratio=aspect_ratio,
            trim_silences=trim_silences,
            output_path=output_path,
            max_duration_sec=target_max_sec,
            progress_callback=on_render_progress,
            is_cancelled=is_cancelled
        )

        # Generate initial social copy for this AutoEdit
        autoedit_title = f"{'TikTok' if format_mode == 'shorts' else 'YouTube'} - {clean_name}"
        autoedit_desc = f"Montaje dinámico de los mejores momentos del stream ({mode_label})."
        autoedit_hashtags = "#gaming #streamer #clips #viral"
        try:
            story_context = f"Video de gaming ({mode_label}). Momentos incluidos:\n" + "\n".join(
                f"- {s.get('hook', '')}" for s in plan.get("story_segments", [])
            )
            copy_res = generate_social_copy_with_llm(
                transcript_text=story_context,
                model_name=model_name or "qwen2.5:7b",
                provider=llm_engine,
                api_key=api_key
            )
            if copy_res.get("hooks"):
                autoedit_title = copy_res["hooks"][0]
            if copy_res.get("caption"):
                autoedit_desc = copy_res["caption"]
            if copy_res.get("hashtags"):
                autoedit_hashtags = " ".join(copy_res["hashtags"])
        except Exception as e:
            print(f"Nota: Copy generado con plantilla base ({e})")

        # Save to database
        saved_autoedit = self.db.save_autoedit(
            project_id=project_id,
            output_path=str(render_res["video_path"]),
            format_mode=format_mode,
            target_duration_sec=target_max_sec,
            actual_duration_sec=render_res["total_duration"],
            chapters_text=render_res["chapters_text"],
            title=autoedit_title,
            description=autoedit_desc,
            hashtags=autoedit_hashtags
        )

        self.emit("autoedit-progress", {
            "status": "done",
            "message": "Video ensamblado exitosamente.",
            "percentage": 100
        })

        return {
            "autoeditId": saved_autoedit["id"],
            "videoPath": render_res["video_path"],
            "chaptersPath": render_res["chapters_path"],
            "chaptersText": render_res["chapters_text"],
            "duration": render_res["total_duration"],
            "filename": output_filename,
            "formatMode": format_mode,
            "aspectRatio": aspect_ratio,
            "outputDir": str(out_dir),
            "title": autoedit_title,
            "description": autoedit_desc,
            "hashtags": autoedit_hashtags
        }

    def get_autoedits(self, args: Any) -> List[Dict[str, Any]]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        project = self.db.get_project(project_id)
        if not project:
            return []

        # 1. Fetch DB records
        records = self.db.list_autoedits(project_id)
        db_paths = {r["outputPath"] for r in records}

        # 2. Also scan project's autoedit/ folder to auto-register existing MP4 files
        proj_dir = self.get_project_dir(project)
        autoedit_dir = proj_dir / "autoedit"
        if autoedit_dir.exists():
            for mp4_file in autoedit_dir.glob("*.mp4"):
                str_path = str(mp4_file)
                if str_path not in db_paths:
                    fname = mp4_file.name
                    fmt = "shorts" if "Shorts" in fname or "9-16" in fname else "youtube"
                    chap_file = mp4_file.with_suffix(".txt")
                    chap_text = chap_file.read_text(encoding="utf-8", errors="replace") if chap_file.exists() else ""
                    new_rec = self.db.save_autoedit(
                        project_id=project_id,
                        output_path=str_path,
                        format_mode=fmt,
                        target_duration_sec=120.0 if fmt == "shorts" else 480.0,
                        actual_duration_sec=None,
                        chapters_text=chap_text,
                        title=mp4_file.stem.replace("_", " "),
                        description=f"Montaje {fmt.capitalize()} ensamblado con IA.",
                        hashtags="#gaming #streamer #clips #viral"
                    )
                    records.append(new_rec)
                    db_paths.add(str_path)

        # 3. Add file metadata (exists, fileSizeMb, filename)
        results = []
        for r in records:
            p = Path(r["outputPath"])
            exists = p.exists()
            size_mb = round(p.stat().st_size / (1024 * 1024), 1) if exists else 0.0
            r_copy = dict(r)
            r_copy["exists"] = exists
            r_copy["fileSizeMb"] = size_mb
            r_copy["filename"] = p.name
            results.append(r_copy)

        return results

    def delete_autoedit(self, args: Any) -> Dict[str, Any]:
        autoedit_id = args.get("autoeditId")
        delete_file = bool(args.get("deleteFile", True))
        rec = self.db.get_autoedit(autoedit_id)
        if rec:
            if delete_file:
                try:
                    p = Path(rec["outputPath"])
                    if p.exists():
                        p.unlink()
                    txt_p = p.with_suffix(".txt")
                    if txt_p.exists():
                        txt_p.unlink()
                except Exception as e:
                    print(f"Error borrando archivo de autoedit: {e}")
            self.db.delete_autoedit(autoedit_id)
        return {"success": True}

    def generate_autoedit_social_copy(self, args: Any) -> Dict[str, Any]:
        autoedit_id = args.get("autoeditId")
        project_id = args.get("projectId")
        rec = self.db.get_autoedit(autoedit_id)
        if not rec:
            raise ValueError("AutoEdit no encontrado.")

        context = f"Video: {rec.get('title', 'Montaje')}\nFormato: {rec.get('formatMode')}\n"
        if rec.get("chaptersText"):
            context += f"\nCapítulos y momentos incluidos:\n{rec['chaptersText']}"

        app_cfg = self.get_app_config()
        llm_engine = app_cfg.get("llmEngine", "local")
        model_name = app_cfg.get("localLlmModel") if llm_engine == "local" else (
            app_cfg.get("deepseekModel") if llm_engine == "deepseek" else (
                app_cfg.get("openrouterModel") if llm_engine == "openrouter" else None
            )
        )
        api_key = (
            app_cfg.get("anthropicKey") if llm_engine == "claude" else (
                app_cfg.get("deepseekKey") if llm_engine == "deepseek" else (
                    app_cfg.get("geminiKey") if llm_engine == "gemini" else (
                        app_cfg.get("openaiKey") if llm_engine == "openai" else (
                            app_cfg.get("openrouterKey") if llm_engine == "openrouter" else (
                                app_cfg.get("groqKey") if llm_engine == "groq" else None
                            )
                        )
                    )
                )
            )
        )

        copy_res = generate_social_copy_with_llm(
            transcript_text=context,
            model_name=model_name or "qwen2.5:7b",
            provider=llm_engine,
            api_key=api_key
        )
        title = copy_res.get("hooks", [rec.get("title")])[0]
        desc = copy_res.get("caption", rec.get("description"))
        tags = " ".join(copy_res.get("hashtags", ["#gaming", "#viral"]))
        updated = self.db.update_autoedit_copy(autoedit_id, title, desc, tags)
        return updated

    def update_candidate_trim(self, args: Any) -> Dict[str, Any]:
        candidate_id = args.get("candidateId")
        start_sec = float(args.get("startSec", 0.0))
        end_sec = float(args.get("endSec", 0.0))
        return self.db.update_candidate_trim(candidate_id, start_sec, end_sec)

    def delete_project(self, args: Any):

        project_id = args.get("projectId") if isinstance(args, dict) else args
        self.db.delete_project(project_id)

    def rename_project(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId")
        name = args.get("name")
        return self.db.rename_project(project_id, name)

    def toggle_project_completed(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        proj = self.db.get_project(project_id)
        if not proj:
            raise ValueError(f"Project not found: {project_id}")
        new_status = "ready" if proj.get("status") == "completed" else "completed"
        self.db.update_project_status(project_id, new_status)
        return self.db.get_project(project_id)

    def relink_project_video(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId")
        new_source_path = args.get("newSourcePath")
        if not project_id:
            raise ValueError("Missing projectId")
        if not new_source_path or not os.path.exists(new_source_path):
            raise FileNotFoundError(f"El archivo seleccionado no existe: {new_source_path}")

        duration = None
        try:
            probe = probe_media(new_source_path)
            duration = probe.get("durationSec")
        except Exception:
            pass

        updated = self.db.relink_project(project_id, new_source_path, duration)
        updated["sourceExists"] = True
        return updated

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

    def open_media_file(self, args: Any) -> bool:
        path = args.get("path") if isinstance(args, dict) else args
        if path:
            p = Path(path)
            if p.exists():
                try:
                    os.startfile(str(p))
                    return True
                except Exception as e:
                    print(f"Error opening media file: {e}")
        return False

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

    def open_project_folder(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId") if isinstance(args, dict) else args
        proj = self.db.get_project(project_id)
        proj_dir = self.get_project_dir(proj)
        if proj_dir.exists():
            try:
                os.startfile(str(proj_dir))
            except Exception as e:
                print(f"Error opening project folder: {e}")
                return {"success": False, "error": str(e)}
        return {"success": True, "projectDir": str(proj_dir)}

    def move_project_folder(self, args: Any) -> Dict[str, Any]:
        project_id = args.get("projectId")
        new_parent_dir = args.get("newParentDir")
        if not project_id:
            raise ValueError("Missing projectId")
        if not new_parent_dir or not os.path.exists(new_parent_dir):
            raise FileNotFoundError(f"Carpeta de destino no existe: {new_parent_dir}")

        proj = self.db.get_project(project_id)
        current_dir = self.get_project_dir(proj)

        folder_name = current_dir.name
        dest_dir = Path(new_parent_dir) / folder_name

        if dest_dir.resolve() == current_dir.resolve():
            return {"success": True, "projectDir": str(current_dir), "message": "La carpeta ya está en esa ubicación."}

        if dest_dir.exists():
            counter = 1
            while dest_dir.exists():
                dest_dir = Path(new_parent_dir) / f"{folder_name}_{counter}"
                counter += 1

        try:
            shutil.move(str(current_dir), str(dest_dir))
        except Exception:
            shutil.copytree(str(current_dir), str(dest_dir), dirs_exist_ok=True)
            shutil.rmtree(str(current_dir), ignore_errors=True)

        updated = self.db.update_project_dir(project_id, str(dest_dir))
        return {
            "success": True,
            "projectDir": str(dest_dir),
            "project": updated
        }

