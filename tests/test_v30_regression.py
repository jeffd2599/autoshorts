import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from python_backend.api import Api
from python_backend.logger import SystemLogBuffer
from python_backend.llm import normalize_candidate_duration
from python_backend.media import (
    command_exists,
    generate_ass_subtitles,
    generate_cta_badge_image,
    get_ffmpeg_path,
    make_even,
    make_even_coord,
    parse_progress_time_sec,
    probe_media,
    render_flat_clip,
)
from python_backend.services.project_service import restore_project_from_disk, sync_project_to_disk
from python_backend.version import __version__


class TestV30CoreUnit(unittest.TestCase):
    def test_version_and_parity_helpers(self):
        self.assertEqual(__version__, "3.0.0")
        self.assertEqual(make_even(0), 2)
        self.assertEqual(make_even(181), 180)
        self.assertEqual(make_even(607.6), 608)
        self.assertEqual(make_even_coord(-4), 0)
        self.assertEqual(make_even_coord(0), 0)
        self.assertEqual(make_even_coord(1), 0)
        self.assertEqual(make_even_coord(121), 120)

    def test_parse_progress_time_and_logger_append(self):
        self.assertAlmostEqual(parse_progress_time_sec("out_time_us=12500000"), 12.5)
        self.assertAlmostEqual(parse_progress_time_sec("out_time=00:01:05.500000"), 65.5)
        self.assertIsNone(parse_progress_time_sec("frame=42"))

        buf = SystemLogBuffer(max_lines=10)
        self.assertTrue(hasattr(buf, "append"))
        buf.append("Operacion normal")
        buf.append("[ERROR] Fallo simulado")
        entries = buf.get_entries()
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["level"], "INFO")
        self.assertEqual(entries[1]["level"], "ERROR")

    def test_normalize_candidate_duration(self):
        segments = [
            {"start": 0.0, "end": 20.0, "text": "intro"},
            {"start": 20.0, "end": 55.0, "text": "body"},
            {"start": 55.0, "end": 95.0, "text": "climax"},
        ]
        # Expand short clip to >= target_min
        s1, e1 = normalize_candidate_duration(0.0, 15.0, segments, target_min=45.0, target_max=75.0)
        self.assertEqual(s1, 0.0)
        self.assertGreaterEqual(e1 - s1, 45.0)
        # Clamp overlong clip <= target_max
        s2, e2 = normalize_candidate_duration(0.0, 150.0, segments, target_min=45.0, target_max=75.0)
        self.assertEqual(s2, 0.0)
        self.assertLessEqual(e2 - s2, 75.0)

    @patch("python_backend.media.command_exists", return_value=True)
    @patch("python_backend.media.probe_media")
    @patch("python_backend.media._run_ffmpeg_monitored")
    def test_render_flat_clip_two_pass_decoupled_and_gaming_split_2d(self, mock_mon, mock_probe, _mock_cmd):
        mock_probe.return_value = {
            "durationSec": 120.0,
            "hasVideo": True,
            "width": 1920,
            "height": 1080,
            "videoCodec": "h264",
            "audioCodec": "aac",
            "fps": 60.0,
            "bitRate": 10000000,
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            bgm_file = tmp_dir / "track.mp3"
            bgm_file.write_bytes(b"ID3dummy")
            out_file = tmp_dir / "out.mp4"

            render_flat_clip(
                source_path="fake_src.mp4",
                start_sec=10.0,
                end_sec=40.0,
                output_path=out_file,
                aspect_ratio="9:16",
                layout="gaming_split",
                camera_crop={"x": 1400, "y": 500, "width": 480, "height": 270, "outWidth": 600, "outHeight": 360, "outX": 240, "outY": 40},
                gameplay_crop={"x": 0, "y": 0, "width": 1920, "height": 1080, "outWidth": 960, "outHeight": 720, "outX": 60, "outY": 440},
                sub_ranges=[{"start": 10.0, "end": 22.0}, {"start": 25.0, "end": 40.0}],
                bgm_path=str(bgm_file),
                bgm_volume=0.35,
                bgm_start_sec=5.0,
                target_bitrate_k=8000,
                two_pass=True,
            )

            self.assertEqual(mock_mon.call_count, 2)
            pass1_cmd = mock_mon.call_args_list[0].kwargs["cmd"]
            pass2_cmd = mock_mon.call_args_list[1].kwargs["cmd"]
            p1_str = " ".join(str(x) for x in pass1_cmd)
            p2_str = " ".join(str(x) for x in pass2_cmd)

            # Pass 1: video-only filtergraph, no BGM input, no alimiter/aout
            self.assertNotIn(str(bgm_file), p1_str)
            self.assertNotIn("alimiter", p1_str)
            self.assertNotIn("[aout]", p1_str)
            self.assertIn("concat=n=2:v=1:a=0[vjoined]", p1_str)
            self.assertIn("-an", pass1_cmd)
            self.assertIn("-preset", pass1_cmd)

            # Pass 2: combined video+audio, 2D layout scales and overlays
            self.assertIn(str(bgm_file), p2_str)
            self.assertIn("concat=n=2:v=0:a=1[ajoined]", p2_str)
            self.assertIn("alimiter", p2_str)
            self.assertIn("[aout]", pass2_cmd)
            self.assertIn("scale=600:360:flags=lanczos[vcam]", p2_str)
            self.assertIn("scale=960:720:flags=lanczos[vgame]", p2_str)
            self.assertIn("[vbg][vgame]overlay=x=60:y=440[vtmp]", p2_str)
            self.assertIn("[vtmp][vcam]overlay=x=240:y=40[vbase]", p2_str)


class TestV30Integration(unittest.TestCase):
    def test_save_project_bgm_and_project_file_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            api = Api(str(tmp_dir))
            try:
                src_video = tmp_dir / "gameplay.mp4"
                src_video.write_bytes(b"\x00\x00\x00\x20ftypisom")
                proj_dir = tmp_dir / "proj_folder"
                proj = api.db.create_project(
                    source_path=str(src_video),
                    transcription_mode="local",
                    caption_style="modern-box",
                    source_duration=60.0,
                    project_dir=str(proj_dir),
                )

                payload = "data:audio/mp3;base64," + base64.b64encode(b"ID3v2_test_bytes").decode("ascii")
                res = api.save_project_bgm({
                    "projectId": proj["id"],
                    "fileName": "../../evil:bgm?*<name>.mp3",
                    "dataBase64": payload,
                })
                self.assertTrue(res["success"])
                saved_bgm = Path(res["path"])
                self.assertTrue(saved_bgm.exists())
                self.assertEqual(saved_bgm.name, "evilbgmname.mp3")
                self.assertEqual(saved_bgm.parent, (proj_dir / "bgm").resolve())

                # Sync and inspect .project file version
                project_file = sync_project_to_disk(api.db, proj["id"], proj_dir)
                self.assertIsNotNone(project_file)
                saved_json = json.loads(Path(project_file).read_text(encoding="utf-8"))
                self.assertEqual(saved_json["appVersion"], __version__)

                # Restore into a fresh DB
                api2 = Api(str(tmp_dir / "db2"))
                try:
                    restored = restore_project_from_disk(api2.db, Path(project_file))
                    self.assertEqual(restored["project"]["id"], proj["id"])
                finally:
                    api2.db.close()
            finally:
                api.db.close()

        self.assertFalse((PROJECT_ROOT / "MagicMock").exists(), "Los tests no deben crear MagicMock/ en la raíz")


class TestV30SyntheticRenderE2E(unittest.TestCase):
    def test_synthetic_two_pass_gaming_split_2d_with_bgm_subtitles_and_cta(self):
        if not command_exists("ffmpeg") or not command_exists("ffprobe"):
            self.skipTest("FFmpeg/FFprobe no disponibles en PATH")

        ffmpeg_exe = get_ffmpeg_path()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            src_mp4 = tmp_dir / "synthetic_src.mp4"
            bgm_mp3 = tmp_dir / "synthetic_bgm.wav"
            badge_png = tmp_dir / "cta.png"
            ass_path = tmp_dir / "subs.ass"
            out_mp4 = tmp_dir / "final_short.mp4"

            # 2.5s synthetic 1280x720 video + audio
            subprocess.run([
                ffmpeg_exe, "-y",
                "-f", "lavfi", "-i", "testsrc=duration=2.5:size=1280x720:rate=30",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5",
                "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", str(src_mp4),
            ], check=True, capture_output=True)

            # 2s synthetic BGM audio
            subprocess.run([
                ffmpeg_exe, "-y",
                "-f", "lavfi", "-i", "sine=frequency=220:duration=2.0",
                str(bgm_mp3),
            ], check=True, capture_output=True)

            generate_cta_badge_image(text="Sigue el canal", output_path=str(badge_png), is_vertical=True, scale_factor=1.0)
            ass_text = generate_ass_subtitles(
                words=[{"start": 0.2, "end": 1.8, "text": "TEST"}],
                start_sec=0.0,
                end_sec=2.0,
                aspect_ratio="9:16",
                pos_x=540,
                pos_y=1500,
                source_width=1280,
                source_height=720,
            )
            ass_path.write_text(ass_text, encoding="utf-8")

            ass_posix = ass_path.resolve().as_posix()
            sub_filter = f"ass='{ass_posix[0]}\\:{ass_posix[2:]}'"

            render_flat_clip(
                source_path=str(src_mp4),
                start_sec=0.0,
                end_sec=2.0,
                output_path=out_mp4,
                aspect_ratio="9:16",
                layout="gaming_split",
                camera_crop={"x": 800, "y": 400, "width": 400, "height": 260, "outWidth": 640, "outHeight": 360, "outX": 220, "outY": 60},
                gameplay_crop={"x": 0, "y": 0, "width": 1280, "height": 720, "outWidth": 1000, "outHeight": 640, "outX": 40, "outY": 460},
                subtitle_filter=sub_filter,
                cta_badge_path=str(badge_png),
                bgm_path=str(bgm_mp3),
                bgm_volume=0.25,
                target_bitrate_k=2500,
                two_pass=True,
            )

            self.assertTrue(out_mp4.exists())
            self.assertGreater(out_mp4.stat().st_size, 10_000)
            info = probe_media(str(out_mp4))
            self.assertTrue(info.get("hasVideo"))
            self.assertEqual(info.get("width"), 1080)
            self.assertEqual(info.get("height"), 1920)
            self.assertIsNotNone(info.get("audioCodec"))


class TestRepoCleanupCompliance(unittest.TestCase):
    def test_obsolete_tracked_and_local_artifacts_removed(self):
        obsolete_paths = [
            PROJECT_ROOT / ".github" / "workflows" / "release.yml",
            PROJECT_ROOT / ".env.example",
            PROJECT_ROOT / ".env",
            PROJECT_ROOT / "_internal",
            PROJECT_ROOT / "MagicMock",
            PROJECT_ROOT / "analizarrepos",
            PROJECT_ROOT / "build",
            PROJECT_ROOT / "src" / "components" / "common" / "PipelineStep.tsx",
            PROJECT_ROOT / "src" / "components" / "common" / "StatusPill.tsx",
            PROJECT_ROOT / "src" / "styles" / "autoedit.css",
        ]
        for p in obsolete_paths:
            self.assertFalse(p.exists(), f"Artefacto obsoleto o residual aún presente: {p}")

    def test_config_css_and_docs_cleaned(self):
        gitignore = (PROJECT_ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("_internal", gitignore)
        self.assertNotIn("src-tauri", gitignore)
        self.assertEqual(gitignore.count("*.pyc"), 1)

        vite_cfg = (PROJECT_ROOT / "vite.config.ts").read_text(encoding="utf-8")
        self.assertNotIn("src-tauri", vite_cfg)

        styles_entry = (PROJECT_ROOT / "src" / "styles.css").read_text(encoding="utf-8")
        self.assertNotIn("autoedit.css", styles_entry)

        layout_css = (PROJECT_ROOT / "src" / "styles" / "layout.css").read_text(encoding="utf-8")
        self.assertIn(".view-mode-segmented", layout_css)
        self.assertIn(".view-mode-pill", layout_css)
        self.assertIn(".icon-button", layout_css)
        self.assertNotIn(".pipeline-strip", layout_css)
        self.assertNotIn(".work-grid", layout_css)

        modals_css = (PROJECT_ROOT / "src" / "styles" / "modals.css").read_text(encoding="utf-8")
        self.assertNotIn(".autoedit-modal-overlay", modals_css)
        self.assertIn(".onboarding-overlay", modals_css)
        self.assertIn(".summary-modal-overlay", modals_css)
        self.assertIn(".style-modal-overlay", modals_css)

        readme = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("3.0.0", readme)
        self.assertIn("context/DECISIONS.md", readme)
        self.assertNotIn("clamp_candidate_duration", readme)

    def test_dead_python_symbols_removed(self):
        api_txt = (PROJECT_ROOT / "python_backend" / "api.py").read_text(encoding="utf-8")
        for sym in ["save_demo_transcript", "probe_project", "extract_project_audio", "get_whisper_models", "install_ollama", "open_media_file", "update_project_workflow_goal"]:
            self.assertNotIn(f"def {sym}", api_txt)

        db_txt = (PROJECT_ROOT / "python_backend" / "db.py").read_text(encoding="utf-8")
        for sym in ["save_autoedit", "get_autoedit", "list_autoedits", "delete_autoedit", "update_autoedit_copy", "update_project_workflow_goal", "_infer_hook_type"]:
            self.assertNotIn(sym, db_txt)

        llm_txt = (PROJECT_ROOT / "python_backend" / "llm.py").read_text(encoding="utf-8")
        self.assertNotIn("def expand_short_candidate", llm_txt)
        self.assertNotIn("def clamp_candidate_duration", llm_txt)

        prompts_txt = (PROJECT_ROOT / "python_backend" / "llm_prompts.py").read_text(encoding="utf-8")
        self.assertNotIn("def locate_moment_active_window", prompts_txt)

        media_txt = (PROJECT_ROOT / "python_backend" / "media.py").read_text(encoding="utf-8")
        for sym in ["def extract_video_thumbnail", "def build_drawtext_filters", "def get_font_option"]:
            self.assertNotIn(sym, media_txt)


if __name__ == "__main__":
    unittest.main()
