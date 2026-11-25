# Plan de Acción 11: Optimización de Tamaño del Bundle Portable (< 2.0 GB) y Sincronización de Rama Main

## 1. Diagnóstico y Entendimiento del Problema

El usuario ha identificado dos situaciones críticas al intentar publicar en GitHub:

1. **Rechazo del ZIP por Límite de GitHub Releases (> 2.0 GB):**
   - GitHub Releases impone un límite estricto de **2,048 MB (2.0 GB)** por archivo binario adjunto.
   - El archivo generado `AutoShorts-v2.5.0-windows-x64-portable.zip` pesó **2,478 MB (~2.41 GB)**.
   - **Causa Raíz:** PyInstaller empaquetó el runtime masivo de PyTorch CUDA (`torch/lib/`):
     - `torch_cuda.dll`: 885.0 MB
     - `cudnn_engines_precompiled64_9.dll`: 561.6 MB
     - `cublasLt64_12.dll`: 513.9 MB
     - `cusparse64_12.dll`: 250.2 MB
     - `torch_cpu.dll`: 237.8 MB
     - `cudnn_adv64_9.dll`: 230.4 MB
     - `cufft64_11.dll`: 181.5 MB
     - `cusolver64_11.dll`: 105.1 MB
     - `cudnn_ops64_9.dll`: 102.7 MB
   - **Hallazgo Clave de Ingeniería:** `faster-whisper` **NO utiliza PyTorch** para la inferencia de transcripción, sino **CTranslate2** (`ctranslate2.dll`, 56 MB), el cual detecta y utiliza de forma 100% nativa e independiente la GPU NVIDIA CUDA (`ctranslate2.get_cuda_device_count() == 1`).
   - Al excluir `torch`, `torchvision` y `torchaudio` en `AutoShorts.spec`, el paquete portable se reducirá drásticamente de 2.41 GB a **aproximadamente 250 MB - 350 MB** (casi 10 veces más ligero, descarga inmediata en GitHub y menor consumo de memoria en la PC del usuario).

2. **Rama `main` desfasada en GitHub:**
   - La rama `main` en GitHub muestra el último commit de hace 2 días porque el nuevo commit y tag se crearon y subieron sobre la rama `release-v2.5`.
   - Se debe realizar el merge de `release-v2.5` en `main` y sincronizar ambas ramas con `origin`.

---

## 2. Alcance (Archivos Afectados)

### Archivos a Modificar:
- `AutoShorts.spec`:
  - Retirar `'torch'` de `hiddenimports`.
  - Añadir `'torch'`, `'torchvision'`, `'torchaudio'`, `'torchtext'` a la lista de `excludes`.
- `python_backend/telemetry.py`:
  - Asegurar que la telemetría GPU no requiera `torch` (usando `nvidia-smi` y `wmi` de forma primaria y robusta).
- `python_backend/api.py` y `python_backend/transcription.py`:
  - Blindar los bloques `import torch; torch.cuda.empty_cache()` bajo `try/except Exception: pass` silencioso para evitar fallos si `torch` no está presente en el entorno congelado.
- `build_portable.py`:
  - Limpiar carpeta `dist/AutoShorts` y compilar el nuevo ZIP optimizado.
- `README.md` y `DECISIONS.md`:
  - Registrar la optimización de exclusión de PyTorch en D-014.

---

## 3. Paso a Paso Técnico

1. **Ajuste de `AutoShorts.spec`:**
   - Excluir explícitamente `torch`, `torchvision`, `torchaudio`.
   - Mantener todas las dependencias reales de `faster-whisper`, `ctranslate2`, `webview`, `requests`, `psutil`, `ffmpeg`, etc.
2. **Blindaje de Código para Ausencia de PyTorch en Modo Congelado:**
   - En `python_backend/telemetry.py`, `python_backend/transcription.py` y `python_backend/api.py`, asegurar que si `torch` no está instalado o empaquetado, el sistema continúe fluidamente sin lanzar `ModuleNotFoundError`.
3. **Re-compilación del Paquete Portable:**
   - Ejecutar `build_portable.py`.
   - Validar que el archivo ZIP resultante pese **menos de 400 MB** (muy por debajo del límite de 2 GB de GitHub).
   - Recalcular el hash SHA-256.
4. **Sincronización Git de `release-v2.5` y `main`:**
   - Hacer commit de la optimización en `release-v2.5`.
   - Cambiar a `main` y fusionar: `git checkout main && git merge release-v2.5`.
   - Retornar a `release-v2.5` o mantener ambas al día.
   - Pushear ambas ramas a `origin`:
     `git push origin release-v2.5 --tags`
     `git push origin main`
5. **Entrega de Datos Actualizados para GitHub Release:**
   - Proveer el nuevo hash SHA-256 y tamaño del ZIP (~300 MB) para la publicación definitiva en GitHub.

---

## 4. Riesgos e Implicaciones

- **Compatibilidad de Faster-Whisper con GPU:**
  - *Verificación:* Hemos validado mediante `ctranslate2.get_cuda_device_count()` que CTranslate2 interactúa directamente con los controladores de NVIDIA CUDA sin depender del framework PyTorch.
- **Liberación de Memoria:**
  - Al no estar PyTorch cargado en memoria, ¡no hay consumo previo de VRAM por tensores de PyTorch! `gc.collect()` y la desreferenciación de CTranslate2 liberan la memoria de forma limpia.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Test de Importación y Detección de GPU sin PyTorch (`scratch/test_no_torch_runtime.py`):**
  - Simular ausencia de `torch` en `sys.modules`.
  - Validar que `telemetry.get_hardware_telemetry()`, `transcription` y `api` operan sin errores.
- **Validación del Paquete ZIP:**
  - Verificar que el tamaño de `AutoShorts-v2.5.0-windows-x64-portable.zip` sea inferior a 500 MB (100% compatible con GitHub Releases).
  - Verificar que `dist/AutoShorts/AutoShorts.exe` inicie y que `ctranslate2` y `faster_whisper` estén presentes en `_internal`.
- **Criterio de Aceptación:**
  - 100% de los tests en verde y ZIP < 2 GB antes de dar por cerrada la tarea.
