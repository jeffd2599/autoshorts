import os
import sys
import time
import subprocess
from pathlib import Path
import requests
import webview

from python_backend.api import Api
from python_backend.stream_server import start_stream_server


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
    # Start local media preview server
    start_stream_server(1422)

    dev_url = "http://127.0.0.1:1420"
    vite_proc = None

    # Check if dev server is already running
    is_running = False
    try:
        r = requests.get(dev_url, timeout=1)
        if r.status_code == 200:
            is_running = True
    except Exception:
        pass

    if not is_running:
        dist_index = Path(__file__).parent / "dist" / "index.html"
        if not dist_index.exists():
            print("Starting Vite dev server for AutoShorts...")
            vite_proc = subprocess.Popen(
                "cmd /c pnpm run dev",
                shell=True,
                cwd=str(Path(__file__).parent)
            )
            print("Connecting to interface...")
            wait_for_server(dev_url)
            target_url = dev_url
        else:
            target_url = str(dist_index)
    else:
        target_url = dev_url

    data_dir = Path.home() / ".autoshorts"
    data_dir.mkdir(parents=True, exist_ok=True)
    storage_dir = data_dir / "webview_profile"
    storage_dir.mkdir(parents=True, exist_ok=True)

    api = Api(str(data_dir))

    print("Launching AutoShorts desktop window (WebView2)...")
    window = webview.create_window(
        title="AutoShorts",
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
