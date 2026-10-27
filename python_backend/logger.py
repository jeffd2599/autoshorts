import os
import sys
import time
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

MAX_BUFFER_LINES = 1000
MAX_LOG_FILE_BYTES = 5 * 1024 * 1024  # 5 MB


class SystemLogBuffer:
    def __init__(self, max_lines: int = MAX_BUFFER_LINES):
        self.max_lines = max_lines
        self.entries: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self.listeners: List[Callable[[Dict[str, Any]], None]] = []

    def add_listener(self, fn: Callable[[Dict[str, Any]], None]):
        with self._lock:
            if fn not in self.listeners:
                self.listeners.append(fn)

    def remove_listener(self, fn: Callable[[Dict[str, Any]], None]):
        with self._lock:
            if fn in self.listeners:
                self.listeners.remove(fn)

    def push(self, raw_line: str, level: str = "INFO"):
        raw_clean = raw_line.rstrip("\r\n")
        if not raw_clean.strip():
            return

        now_str = datetime.now().strftime("%H:%M:%S")

        # Detect log level from prefixes
        upper = raw_clean.upper()
        if "[ERROR]" in upper or "ERROR:" in upper or "TRACEBACK" in upper or "EXCEPTION" in upper or "FAILED" in upper or "🛑" in raw_clean:
            level = "ERROR"
        elif "[ALERTA]" in upper or "[WARNING]" in upper or "WARNING:" in upper or "WARN:" in upper:
            level = "WARNING"
        elif "[ADAPTIVE]" in upper or "[CUDA]" in upper or "[VRAM]" in upper or "[CIRCUIT BREAKER]" in upper or "🚀" in raw_clean:
            level = "SYSTEM"

        entry = {
            "timestamp": now_str,
            "level": level,
            "message": raw_clean,
            "raw": f"[{now_str}] [{level}] {raw_clean}"
        }

        with self._lock:
            self.entries.append(entry)
            if len(self.entries) > self.max_lines:
                self.entries.pop(0)
            listeners_snapshot = list(self.listeners)

        for listener in listeners_snapshot:
            try:
                listener(entry)
            except Exception:
                pass

    def get_entries(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        with self._lock:
            if limit and limit > 0:
                return list(self.entries[-limit:])
            return list(self.entries)

    def clear(self):
        with self._lock:
            self.entries.clear()


# Global singleton instance
log_buffer = SystemLogBuffer()


class InterceptedStream:
    def __init__(self, original_stream, default_level: str = "INFO", file_handle=None):
        self.original_stream = original_stream
        self.default_level = default_level
        self.file_handle = file_handle
        self._buffer = ""
        self._lock = threading.Lock()

    def write(self, text: str):
        if not text:
            return

        with self._lock:
            # Forward to original stream (console if present)
            if self.original_stream:
                try:
                    self.original_stream.write(text)
                    self.original_stream.flush()
                except Exception:
                    pass

            # Write to log file if available
            if self.file_handle:
                try:
                    self.file_handle.write(text)
                    self.file_handle.flush()
                except Exception:
                    pass

            # Buffer lines
            self._buffer += text
            while "\n" in self._buffer:
                line, self._buffer = self._buffer.split("\n", 1)
                clean = line.strip("\r")
                if clean:
                    log_buffer.push(clean, self.default_level)

    def flush(self):
        with self._lock:
            if self._buffer.strip():
                log_buffer.push(self._buffer.strip("\r"), self.default_level)
                self._buffer = ""
            if self.original_stream:
                try:
                    self.original_stream.flush()
                except Exception:
                    pass
            if self.file_handle:
                try:
                    self.file_handle.flush()
                except Exception:
                    pass


_file_handle = None


def init_logging(user_data_dir: Path) -> Path:
    """Initializes rotating file log and hooks stdout/stderr."""
    global _file_handle
    os.makedirs(user_data_dir, exist_ok=True)
    log_file = user_data_dir / "autoshorts.log"

    # Rotate if exceeding 5MB
    if log_file.exists() and log_file.stat().st_size > MAX_LOG_FILE_BYTES:
        try:
            prev_log = user_data_dir / "autoshorts.prev.log"
            if prev_log.exists():
                os.remove(prev_log)
            os.rename(log_file, prev_log)
        except Exception:
            pass

    try:
        _file_handle = open(log_file, "a", encoding="utf-8", errors="replace")
        _file_handle.write(f"\n--- Sesión AutoShorts iniciada: {datetime.now().isoformat()} ---\n")
        _file_handle.flush()
    except Exception as e:
        print(f"Warning: could not open autoshorts.log: {e}")

    # Hook stdout and stderr
    sys.stdout = InterceptedStream(sys.__stdout__, "INFO", _file_handle)
    sys.stderr = InterceptedStream(sys.__stderr__, "ERROR", _file_handle)

    return log_file


def get_system_logs(limit: int = 500) -> List[Dict[str, Any]]:
    return log_buffer.get_entries(limit)


def clear_system_logs():
    log_buffer.clear()
