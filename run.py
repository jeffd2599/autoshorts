import os
import sys
import multiprocessing

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import time
import subprocess
from pathlib import Path
import requests
import webview

from python_backend.api import Api
from python_backend.stream_server import start_stream_server
from python_backend.paths import get_resource_dir, get_user_data_dir, is_frozen
from python_backend.logger import init_logging
from python_backend.version import __version__, APP_NAME


def wait_for_server(url: str, timeout: int = 25) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(url, timeout=1)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def main():
    # Crucial for Windows PyInstaller binaries to prevent infinite child processes
    multiprocessing.freeze_support()

    base_dir = get_resource_dir()
    data_dir = get_user_data_dir()
    frozen = is_frozen()

    # Initialize logging buffer and rotating file
    init_logging(data_dir)

    print(f"Iniciando {APP_NAME} v{__version__} (Modo: {'Portable / Frozen' if frozen else 'Desarrollo'})...")
    print(f"Directorio de recursos: {base_dir}")
    print(f"Directorio de datos de usuario: {data_dir}")

    # Start local media preview server
    start_stream_server(1422)

    dev_url = "http://127.0.0.1:1420"
    app_server_url = "http://127.0.0.1:1422"
    vite_proc = None

    dist_index = base_dir / "dist" / "index.html"

    if frozen:
        target_url = app_server_url
    else:
        is_running = False
        try:
            r = requests.get(dev_url, timeout=1)
            if r.status_code == 200:
                is_running = True
        except Exception:
            pass

        if not is_running:
            if not dist_index.exists():
                print("Iniciando Vite dev server para AutoShorts...")
                vite_proc = subprocess.Popen(
                    "cmd /c pnpm run dev",
                    shell=True,
                    cwd=str(base_dir)
                )
                print("Conectando con la interfaz...")
                wait_for_server(dev_url)
                target_url = dev_url
            else:
                target_url = app_server_url
        else:
            target_url = dev_url

    storage_dir = data_dir / "webview_profile"
    storage_dir.mkdir(parents=True, exist_ok=True)

    api = Api(str(data_dir))

    print(f"Lanzando ventana de escritorio {APP_NAME} (WebView2)...")
    window = webview.create_window(
        title=f"{APP_NAME} v{__version__}",
        url=target_url,
        js_api=api,
        width=1280,
        height=840,
        min_size=(1040, 700)
    )
    api.set_window(window)

    try:
        webview.start(debug=False, private_mode=False, storage_path=str(storage_dir))
    finally:
        if vite_proc:
            try:
                vite_proc.terminate()
            except Exception:
                pass


if __name__ == "__main__":
    main()
