import os
import re
import json
import shutil
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

PROJECT_FILE_NAME = "autoshorts.project"
LEGACY_PROJECT_FILE_NAMES = ["project.json", "autoshorts.json"]
MEDIA_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mp3", ".wav", ".m4a"}


def resolve_project_dir(db: Any, project: Dict[str, Any]) -> Path:
    """Calculates and prepares standard project directory structure."""
    proj_dir_val = project.get("projectDir")
    if proj_dir_val and str(proj_dir_val).strip():
        p = Path(str(proj_dir_val).strip())
    else:
        proj_name = project.get("name") or (Path(project["sourcePath"]).stem if project.get("sourcePath") else project["id"])
        clean_name = re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d\u2300-\u23ff\u2b50-\u2b55]', '', proj_name)
        clean_name = re.sub(r'[\\/*?:"<>|#]', "", clean_name).strip() or project["id"]
        p = Path.home() / "Documents" / "AutoShorts" / clean_name
        try:
            db.update_project_dir(project["id"], str(p))
        except Exception:
            pass

    os.makedirs(p, exist_ok=True)
    os.makedirs(p / "audio", exist_ok=True)
    os.makedirs(p / "clips", exist_ok=True)
    os.makedirs(p / "summary", exist_ok=True)
    return p


def serialize_project(db: Any, project_id: str) -> Dict[str, Any]:
    """Extracts project metadata, full transcript, and candidates for standalone storage."""
    proj = db.get_project(project_id)
    transcript_record = db.latest_transcript(project_id)
    candidates_records = db.get_candidates(project_id)

    transcript_payload = None
    if transcript_record and transcript_record.get("rawJson"):
        try:
            raw_data = json.loads(transcript_record["rawJson"])
            transcript_payload = {
                "engine": transcript_record.get("engine", "local"),
                "language": transcript_record.get("language", "es"),
                "segments": raw_data.get("segments", []),
                "words": raw_data.get("words", []),
                "duration": raw_data.get("duration"),
                "createdAt": transcript_record.get("createdAt")
            }
        except Exception as e:
            print(f"Warning: could not parse transcript rawJson for serialization: {e}")

    serialized_candidates: List[Dict[str, Any]] = []
    for c in candidates_records:
        serialized_candidates.append({
            "id": c.get("id"),
            "rank": c.get("rank"),
            "start": c.get("startSec", c.get("start", 0.0)),
            "end": c.get("endSec", c.get("end", 0.0)),
            "score": c.get("score", 0.85),
            "hook": c.get("hook", ""),
            "hookTitle": c.get("hookTitle", c.get("hook_title", "")),
            "rationale": c.get("rationale", ""),
            "description": c.get("description", ""),
            "virality": c.get("virality"),
            "selected": bool(c.get("selected", False)),
            "dismissed": bool(c.get("dismissed", False))
        })

    return {
        "formatVersion": "2.6",
        "appVersion": "2.6.0",
        "id": proj["id"],
        "name": proj.get("name"),
        "sourcePath": proj.get("sourcePath"),
        "sourceDuration": proj.get("sourceDuration"),
        "status": proj.get("status", "ready"),
        "transcriptionMode": proj.get("transcriptionMode", "local"),
        "captionStyle": proj.get("captionStyle", "modern-box"),
        "projectDir": proj.get("projectDir"),
        "workflowGoal": proj.get("workflowGoal", "clips"),
        "createdAt": proj.get("createdAt"),
        "updatedAt": proj.get("updatedAt"),
        "transcript": transcript_payload,
        "candidates": serialized_candidates
    }


def save_project_file(project_dir: Path, data: Dict[str, Any]) -> Path:
    """Saves autonomous project file atomically using a temporary file."""
    os.makedirs(project_dir, exist_ok=True)
    target_file = project_dir / PROJECT_FILE_NAME
    tmp_file = project_dir / f"{PROJECT_FILE_NAME}.tmp.{uuid.uuid4().hex[:8]}"

    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, target_file)
    except Exception as e:
        if tmp_file.exists():
            try:
                os.remove(tmp_file)
            except Exception:
                pass
        raise e

    return target_file


def find_project_file(path_or_dir: Path) -> Optional[Path]:
    """Finds an existing autoshorts.project or compatible project file."""
    if not path_or_dir:
        return None

    p = Path(path_or_dir)
    if p.is_file():
        if p.name == PROJECT_FILE_NAME or p.name in LEGACY_PROJECT_FILE_NAMES or p.suffix.lower() == ".project":
            return p
        # If user selected a media file, check its directory
        candidate = p.parent / PROJECT_FILE_NAME
        if candidate.is_file():
            return candidate
        for legacy in LEGACY_PROJECT_FILE_NAMES:
            candidate_legacy = p.parent / legacy
            if candidate_legacy.is_file():
                return candidate_legacy
        return None

    if p.is_dir():
        candidate = p / PROJECT_FILE_NAME
        if candidate.is_file():
            return candidate
        for legacy in LEGACY_PROJECT_FILE_NAMES:
            candidate_legacy = p / legacy
            if candidate_legacy.is_file():
                return candidate_legacy
        candidate_sub = p / ".autoshorts" / PROJECT_FILE_NAME
        if candidate_sub.is_file():
            return candidate_sub

    return None


def load_project_file(project_file_path: Path) -> Optional[Dict[str, Any]]:
    """Loads and parses project JSON file."""
    if not project_file_path or not project_file_path.is_file():
        return None
    try:
        with open(project_file_path, "r", encoding="utf-8", errors="replace") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading project file {project_file_path}: {e}")
        return None


def restore_project_from_disk(db: Any, file_or_dir: Path) -> Dict[str, Any]:
    """
    Restores a project from its autoshorts.project file into SQLite.
    Automatically relinks source video if folder location or drive letter changed.
    """
    proj_file = find_project_file(Path(file_or_dir))
    if not proj_file or not proj_file.is_file():
        raise FileNotFoundError(f"No se encontró archivo de proyecto en: {file_or_dir}")

    data = load_project_file(proj_file)
    if not data or not isinstance(data, dict):
        raise ValueError(f"Archivo de proyecto corrupto o inválido: {proj_file}")

    project_dir = proj_file.parent
    project_id = data.get("id") or str(uuid.uuid4())
    name = data.get("name") or project_dir.name
    raw_source = data.get("sourcePath")

    # Intelligent video relinking
    source_path = ""
    if raw_source and os.path.isfile(raw_source):
        source_path = raw_source
    else:
        # 1. Look in project_dir for exact original filename
        if raw_source:
            candidate_file = project_dir / Path(raw_source).name
            if candidate_file.is_file():
                source_path = str(candidate_file)

        # 2. Look in project_dir for any video file
        if not source_path:
            for item in project_dir.iterdir():
                if item.is_file() and item.suffix.lower() in MEDIA_EXTENSIONS and "transcription_audio" not in item.name:
                    source_path = str(item)
                    break

        # Fallback to whatever was recorded
        if not source_path and raw_source:
            source_path = raw_source

    duration = data.get("sourceDuration")
    status = data.get("status") or ("ready" if data.get("candidates") else "analyzing" if data.get("transcript") else "created")
    transcription_mode = data.get("transcriptionMode", "local")
    caption_style = data.get("captionStyle", "modern-box")
    workflow_goal = data.get("workflowGoal", "clips")

    # Upsert project into database
    restored = db.upsert_project_record(
        project_id=project_id,
        name=name,
        source_path=source_path,
        source_duration=duration,
        status=status,
        transcription_mode=transcription_mode,
        caption_style=caption_style,
        project_dir=str(project_dir),
        workflow_goal=workflow_goal,
        created_at=data.get("createdAt"),
        updated_at=data.get("updatedAt")
    )

    # Restore transcript if present and not yet in db
    transcript_info = data.get("transcript")
    if transcript_info and isinstance(transcript_info, dict):
        existing_t = db.latest_transcript(project_id)
        if not existing_t:
            raw_transcript_json = json.dumps({
                "segments": transcript_info.get("segments", []),
                "words": transcript_info.get("words", []),
                "duration": transcript_info.get("duration", duration),
                "language": transcript_info.get("language", "es")
            }, ensure_ascii=False)
            db.save_transcript(
                project_id=project_id,
                engine=transcript_info.get("engine", "local"),
                raw_json=raw_transcript_json,
                language=transcript_info.get("language", "es")
            )

    # Restore candidates if present
    candidates_list = data.get("candidates")
    if candidates_list and isinstance(candidates_list, list):
        drafts: List[Dict[str, Any]] = []
        for idx, c in enumerate(candidates_list, start=1):
            drafts.append({
                "start": float(c.get("start", c.get("startSec", 0.0))),
                "end": float(c.get("end", c.get("endSec", 0.0))),
                "score": float(c.get("score", 0.85)),
                "hook": str(c.get("hook", "")),
                "hook_title": str(c.get("hookTitle", c.get("hook_title", ""))),
                "rationale": str(c.get("rationale", "")),
                "description": str(c.get("description", "")),
                "virality": c.get("virality") if isinstance(c.get("virality"), dict) else None
            })
        if drafts:
            db.replace_candidates(project_id, drafts)
            db.update_project_status(project_id, "ready")

    # Resync file to ensure updated sourcePath or normalized format is preserved
    sync_project_to_disk(db, project_id, project_dir)
    return db.get_project_detail(project_id)


def _format_time_stamp(sec: float) -> str:
    m = int(sec // 60)
    s = int(sec % 60)
    return f"{m:02d}:{s:02d}"


def _format_srt_timestamp(secs: float) -> str:
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = int(secs % 60)
    ms = int(round((secs - int(secs)) * 1000))
    if ms >= 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def export_project_summary_files(project_dir: Path, data: Dict[str, Any]):
    """
    Exports clean transcription, complete SRT, structured JSON,
    and viral moments list into the project's summary/ folder.
    """
    summary_dir = project_dir / "summary"
    os.makedirs(summary_dir, exist_ok=True)

    transcript = data.get("transcript")
    if transcript and isinstance(transcript, dict):
        segments = transcript.get("segments", [])
        if segments:
            # 1. transcripcion_completa.txt
            lines = []
            for s in segments:
                st = _format_time_stamp(float(s.get("start", 0.0)))
                en = _format_time_stamp(float(s.get("end", 0.0)))
                speaker = s.get("speaker")
                txt = s.get("text", "").strip()
                prefix = f"[{st} - {en}] {speaker}: " if speaker else f"[{st} - {en}] "
                lines.append(f"{prefix}{txt}")

            full_txt_path = summary_dir / "transcripcion_completa.txt"
            with open(full_txt_path, "w", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")

            # 2. subtitulos_completos.srt
            srt_lines = []
            for idx, s in enumerate(segments, 1):
                st_srt = _format_srt_timestamp(float(s.get("start", 0.0)))
                en_srt = _format_srt_timestamp(float(s.get("end", 0.0)))
                txt = s.get("text", "").strip()
                srt_lines.append(f"{idx}\n{st_srt} --> {en_srt}\n{txt}\n")

            full_srt_path = summary_dir / "subtitulos_completos.srt"
            with open(full_srt_path, "w", encoding="utf-8") as f:
                f.write("\n".join(srt_lines) + "\n")

            # 3. transcripcion_detallada.json
            full_json_path = summary_dir / "transcripcion_detallada.json"
            with open(full_json_path, "w", encoding="utf-8") as f:
                json.dump(transcript, f, indent=2, ensure_ascii=False)

    # 4. momentos_virales.txt
    candidates = data.get("candidates", [])
    if candidates:
        moments_lines = [
            "=" * 70,
            f"AutoShorts - Momentos Virales Detectados ({len(candidates)} clips)",
            "=" * 70,
            ""
        ]
        sorted_candidates = sorted(candidates, key=lambda c: int(c.get("rank") or 999))
        for c in sorted_candidates:
            st = _format_time_stamp(float(c.get("start", 0.0)))
            en = _format_time_stamp(float(c.get("end", 0.0)))
            score = int(round(float(c.get("score", 0.8)) * 100))
            rank = c.get("rank", 1)
            hook = c.get("hook", "Clip")
            rationale = c.get("rationale", "")
            description = c.get("description", "")

            moments_lines.append(f"#{rank} [{st} - {en}] Score: {score}% | Hook: {hook}")
            if rationale:
                moments_lines.append(f"Por qué es viral: {rationale}")
            if description:
                moments_lines.append(f"Social Copy / Hashtags:\n{description}")
            moments_lines.append("-" * 70)

        moments_path = summary_dir / "momentos_virales.txt"
        with open(moments_path, "w", encoding="utf-8") as f:
            f.write("\n".join(moments_lines) + "\n")


def sync_project_to_disk(db: Any, project_id: str, project_dir: Optional[Path] = None) -> Optional[Path]:
    """Serializes project data, writes autoshorts.project, and populates summary/ files."""
    try:
        proj = db.get_project(project_id)
    except Exception:
        return None

    pdir = project_dir or resolve_project_dir(db, proj)
    data = serialize_project(db, project_id)
    res = save_project_file(pdir, data)
    try:
        export_project_summary_files(pdir, data)
    except Exception as e:
        print(f"Warning: could not export summary files for {project_id}: {e}")
    return res


def auto_migrate_legacy_projects(db: Any) -> int:
    """
    Checks all projects registered in SQLite and generates autoshorts.project
    for any project that does not yet have it on disk.
    """
    count = 0
    try:
        projects = db.list_projects()
        for p in projects:
            pdir_str = p.get("projectDir")
            if not pdir_str:
                pdir = resolve_project_dir(db, p)
            else:
                pdir = Path(pdir_str)

            if pdir.exists():
                proj_file = pdir / PROJECT_FILE_NAME
                if not proj_file.exists():
                    try:
                        sync_project_to_disk(db, p["id"], pdir)
                        count += 1
                        print(f"[MIGRACION] Archivo autoshorts.project generado para '{p.get('name')}' en: {pdir}")
                    except Exception as e:
                        print(f"Error migrando proyecto {p.get('id')}: {e}")
    except Exception as e:
        print(f"Error en auto_migrate_legacy_projects: {e}")
    return count


def open_media_file(path: Optional[str]) -> bool:
    if path:
        p = Path(path)
        if p.exists():
            try:
                os.startfile(str(p))
                return True
            except Exception as e:
                print(f"Error opening media file: {e}")
    return False


def open_folder(path: Optional[str]) -> bool:
    if path:
        p = Path(path)
        folder = p.parent if p.is_file() else p
        if folder.exists():
            try:
                os.startfile(str(folder))
            except Exception as e:
                print(f"Error opening folder: {e}")
    return True


def move_project_folder_action(
    db: Any,
    project_id: str,
    new_parent_dir: str,
    get_project_dir_fn: Callable[[Dict[str, Any]], Path]
) -> Dict[str, Any]:
    if not project_id:
        raise ValueError("Missing projectId")
    if not new_parent_dir or not os.path.exists(new_parent_dir):
        raise FileNotFoundError(f"Carpeta de destino no existe: {new_parent_dir}")

    proj = db.get_project(project_id)
    current_dir = get_project_dir_fn(proj)

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

    updated = db.update_project_dir(project_id, str(dest_dir))
    # Resync project file at new location
    sync_project_to_disk(db, project_id, dest_dir)

    return {
        "success": True,
        "projectDir": str(dest_dir),
        "project": updated
    }
