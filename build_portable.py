"""
Script de construccion y empaquetado portable para AutoShorts.
Genera la distribucion onedir compilada y el paquete comprimido .zip con hash SHA-256.
"""

import os
import sys
import shutil
import hashlib
import zipfile
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from python_backend.version import __version__, APP_NAME


def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def run_command(cmd: str, desc: str):
    print(f"\n[*] {desc}...")
    print(f"    Ejecutando: {cmd}")
    res = subprocess.run(cmd, shell=True, cwd=str(PROJECT_ROOT))
    if res.returncode != 0:
        print(f"\n[ERROR] Falló: {desc} (código de salida: {res.returncode})")
        sys.exit(res.returncode)


def main():
    print("=" * 60)
    print(f"      Construyendo paquete portable para {APP_NAME} v{__version__}")
    print("=" * 60)

    # 1. Compilar frontend de React con pnpm
    run_command("pnpm.cmd run build", "Compilando frontend de producción con pnpm")

    # 2. Compilar con PyInstaller en modo onedir
    run_command("pyinstaller --clean AutoShorts.spec", "Compilando backend ejecutable con PyInstaller (onedir)")

    output_dir = PROJECT_ROOT / "dist" / "AutoShorts"
    if not output_dir.exists() or not (output_dir / "AutoShorts.exe").exists():
        print("\n[ERROR] No se encontró el ejecutable generado en dist/AutoShorts/AutoShorts.exe")
        sys.exit(1)

    # 3. Crear archivo marcador portable.mode y carpeta data inicial
    portable_marker = output_dir / "portable.mode"
    with open(portable_marker, "w", encoding="utf-8") as f:
        f.write("# AutoShorts Portable Mode - Data will be stored locally in ./data/\n")
    os.makedirs(output_dir / "data", exist_ok=True)

    # 4. Comprimir en archivo ZIP de distribución
    zip_name = f"AutoShorts-v{__version__}-windows-x64-portable.zip"
    zip_path = PROJECT_ROOT / "dist" / zip_name

    print(f"\n[*] Comprimiendo {output_dir.name} en {zip_name}...")
    if zip_path.exists():
        try:
            os.remove(zip_path)
        except Exception:
            pass

    file_count = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _, files in os.walk(output_dir):
            for file in files:
                full_path = Path(root) / file
                arc_name = Path("AutoShorts") / full_path.relative_to(output_dir)
                zf.write(full_path, arc_name)
                file_count += 1

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    sha256 = compute_sha256(zip_path)

    sha_file = zip_path.with_suffix(".zip.sha256")
    with open(sha_file, "w", encoding="utf-8") as f:
        f.write(f"{sha256}  {zip_name}\n")

    print("\n" + "=" * 60)
    print("      CONSTRUCCIÓN Y EMPAQUETADO PORTABLE EXITOSO")
    print("=" * 60)
    print(f" Aplicación:  {APP_NAME} v{__version__}")
    print(f" Directorio:  {output_dir}")
    print(f" Paquete ZIP: {zip_path}")
    print(f" Tamaño ZIP:  {size_mb:.2f} MB ({file_count} archivos incluidos)")
    print(f" SHA-256:     {sha256}")
    print(f" Hash Check:  {sha_file}")
    print("=" * 60)


if __name__ == "__main__":
    main()
