# -*- mode: python ; coding: utf-8 -*-
import os
import sys
from pathlib import Path

block_cipher = None

datas = [
    ('dist', 'dist'),
    ('icon.ico', '.'),
    ('icon.png', '.'),
    ('public', 'public'),
]

binaries = []
# Bundle local ffmpeg / ffprobe if available
ffmpeg_bin = Path(r"C:\ffmpeg\bin")
if (ffmpeg_bin / "ffmpeg.exe").is_file():
    binaries.append((str(ffmpeg_bin / "ffmpeg.exe"), "bin"))
if (ffmpeg_bin / "ffprobe.exe").is_file():
    binaries.append((str(ffmpeg_bin / "ffprobe.exe"), "bin"))

hiddenimports = [
    'faster_whisper',
    'ctranslate2',
    'torch',
    'webview',
    'webview.platforms.winforms',
    'webview.platforms.edgechromium',
    'clr',
    'requests',
    'psutil',
    'sqlite3',
    'python_backend',
    'python_backend.api',
    'python_backend.db',
    'python_backend.llm',
    'python_backend.llm_prompts',
    'python_backend.media',
    'python_backend.stream_server',
    'python_backend.telemetry',
    'python_backend.transcription',
    'python_backend.version',
    'python_backend.paths',
    'python_backend.logger',
    'python_backend.services.project_service',
]

a = Analysis(
    ['run.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'pandas', 'IPython', 'notebook', 'pytest'],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='AutoShorts',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='icon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='AutoShorts',
)
