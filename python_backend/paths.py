import os
import sys
import shutil
from pathlib import Path


def is_frozen() -> bool:
    """Returns True if running in a PyInstaller bundle."""
    return getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS")


def get_resource_dir() -> Path:
    """
    Returns the base directory for read-only static resources (frontend dist, icon, etc.).
    Under PyInstaller frozen mode, this is sys._MEIPASS.
    In development mode, this is the project repository root.
    """
    if is_frozen():
        return Path(sys._MEIPASS)
    # Dev: python_backend/paths.py -> autoshorts/
    return Path(__file__).resolve().parent.parent


def get_user_data_dir() -> Path:
    """
    Returns the root directory for mutable user data (SQLite database, configs, project caches).
    Portable rule:
    - If running frozen and a 'data/' folder or 'portable.mode' file exists alongside the .exe,
      data is strictly stored in that local 'data/' directory (100% self-contained USB mode).
    - Otherwise (or if installed), stores in user's Documents/AutoShorts.
    - In dev mode, uses local 'data/' directory.
    """
    if is_frozen():
        exe_dir = Path(sys.executable).parent
        portable_flag = exe_dir / "portable.mode"
        local_data = exe_dir / "data"

        if portable_flag.exists() or local_data.exists():
            os.makedirs(local_data, exist_ok=True)
            return local_data

        docs_dir = Path.home() / "Documents" / "AutoShorts"
        os.makedirs(docs_dir, exist_ok=True)
        return docs_dir

    dev_data = Path("data").resolve()
    os.makedirs(dev_data, exist_ok=True)
    return dev_data


def get_ffmpeg_path() -> str:
    """Resolves ffmpeg executable path prioritizing local portable bundle over system PATH."""
    if is_frozen():
        exe_dir = Path(sys.executable).parent
        candidates = [
            exe_dir / "bin" / "ffmpeg.exe",
            exe_dir / "ffmpeg.exe",
            Path(sys._MEIPASS) / "bin" / "ffmpeg.exe" if hasattr(sys, "_MEIPASS") else None
        ]
        for c in candidates:
            if c and c.is_file():
                return str(c)

    # Windows standard locations
    if os.path.isfile(r"C:\ffmpeg\bin\ffmpeg.exe"):
        return r"C:\ffmpeg\bin\ffmpeg.exe"

    which_path = shutil.which("ffmpeg")
    if which_path:
        return which_path

    return "ffmpeg"


def get_ffprobe_path() -> str:
    """Resolves ffprobe executable path prioritizing local portable bundle over system PATH."""
    if is_frozen():
        exe_dir = Path(sys.executable).parent
        candidates = [
            exe_dir / "bin" / "ffprobe.exe",
            exe_dir / "ffprobe.exe",
            Path(sys._MEIPASS) / "bin" / "ffprobe.exe" if hasattr(sys, "_MEIPASS") else None
        ]
        for c in candidates:
            if c and c.is_file():
                return str(c)

    if os.path.isfile(r"C:\ffmpeg\bin\ffprobe.exe"):
        return r"C:\ffmpeg\bin\ffprobe.exe"

    which_path = shutil.which("ffprobe")
    if which_path:
        return which_path

    return "ffprobe"
