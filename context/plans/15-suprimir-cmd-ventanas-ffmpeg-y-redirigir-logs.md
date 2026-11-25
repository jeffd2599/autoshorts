# Plan 15: Supresión Total de Ventanas CMD, Empaquetado de cuBLAS CUDA y Blindaje Resiliente de Whisper en Versión Portable

## 1. Diagnóstico

### Los Problemas Reportados
1. **Aparición de Ventana CMD al Transcribir:** Al pulsar "Transcribir", se abrió una ventana negra de consola CMD de Windows en el escritorio en lugar de mantenerse todo silencioso y dentro del terminal/logs interno del software.
2. **Error Crítico de DLL en Faster-Whisper Portable:**
   ```text
   🚀 Using faster-whisper CTranslate2 'large-v3-turbo' on cuda (float16)...
   ❌ Error en faster-whisper: Library cublas64_12.dll is not found or cannot be loaded
   ```
   El proceso de transcripción falló por completo y el software se detuvo.

### Análisis de Causa Raíz
1. **Subprocesos de FFmpeg/FFprobe sin Flags de Ventana Oculta:**
   - En Windows, cuando un ejecutable compilado con interfaz gráfica y sin consola (`console=False` en PyInstaller) lanza herramientas CLI como `ffmpeg.exe` o `ffprobe.exe` vía `subprocess.Popen` o `subprocess.run`, Windows genera automáticamente una ventana CMD (`conhost.exe`) si no se le pasan los flags `CREATE_NO_WINDOW` (`0x08000000`) y `STARTF_USESHOWWINDOW` con `wShowWindow = SW_HIDE`.
   - Dado que la extracción de audio (`extract_audio`) dura varios segundos, esa ventana negra permanecía abierta en el escritorio. Además, el progreso de FFmpeg no se redirigía al visor interno de Terminal/Logs (`log_buffer`).

2. **Ausencia de librerías cuBLAS en el Portable y Falta de Fallback a CPU:**
   - CTranslate2 (el motor de Faster-Whisper) requiere las librerías dinámicas de NVIDIA CUDA 12: `cublas64_12.dll` y `cublasLt64_12.dll` para operar en modo `device="cuda"`.
   - En modo desarrollo (`AutoShorts.bat`), estas DLLs están disponibles en el entorno de Python local del sistema (`site-packages/torch/lib`), por lo que CTranslate2 las encontraba en memoria.
   - En la versión portable (`AutoShorts.exe`), al excluir PyTorch en `AutoShorts.spec` para reducir el tamaño del ZIP, las librerías `cublas64_12.dll` y `cublasLt64_12.dll` no fueron empaquetadas en `_internal`.
   - **Ausencia de Fallback Defensivo en `transcription.py`:** Al fallar la inicialización en GPU CUDA, el código lanzaba una excepción fatal directa en lugar de capturarla y degradar de forma elegante y automática a CPU (`device="cpu"`, `compute_type="int8"`). Esto hacía que la aplicación colapsara si el equipo carecía de las DLLs o de GPU NVIDIA compatible.

3. **Auditoría de las siguientes etapas (Detección de Momentos LLM, Cortes, Renderizado, Copias):**
   - **Detección de Momentos con LLM:** Se comunica por HTTP estándar (`requests`) hacia Ollama (`11434`) o LM Studio (`1234`). No depende de DLLs binarias de GPU en el portable (la GPU la gestiona Ollama/LM Studio independientemente).
   - **Cortes y Renderizado:** Utiliza `ffmpeg.exe` empaquetado. Solo requería los flags de supresión de ventana para que la exportación sea 100% silenciosa y limpia.
   - **Copias Sociales y Proyectos:** Operaciones puras de Python y HTTP.

---

## 2. Alcance

### Archivos a Modificar
- `python_backend/paths.py`:
  - Implementar la función centralizada `get_no_window_kwargs() -> Dict[str, Any]` para suprimir ventanas CMD en Windows.
- `python_backend/media.py`:
  - Aplicar `**get_no_window_kwargs()` a todas las llamadas de `subprocess.Popen` y `subprocess.run` (`extract_audio`, `probe_media`, `extract_video_thumbnail`, `render_flat_clip`).
  - Redirigir el progreso de `ffmpeg` en `extract_audio` hacia `log_buffer.push(...)` para alimentar el terminal interno.
- `python_backend/stream_server.py` y `python_backend/telemetry.py`:
  - Aplicar `**get_no_window_kwargs()` en generación de miniaturas y telemetría `nvidia-smi`.
- `python_backend/transcription.py`:
  - **Blindaje Resiliente con Fallback Automático a CPU:** Si `WhisperModel(...)` falla en modo CUDA por cualquier motivo (`cublas64_12.dll` no encontrada, falta de VRAM, drivers antiguos o hardware no NVIDIA), capturar el error, emitir alerta en `log_buffer` y reintentar inmediatamente en modo `device="cpu"` y `compute_type="int8"`.
  - Asegurar la inicialización de `os.add_dll_directory` para que CTranslate2 localice las DLLs empaquetadas en `_internal` y `_internal/ctranslate2`.
- `run.py`:
  - Registrar explícitamente los directorios de DLLs de recursos (`ctranslate2`, `_internal`) mediante `os.add_dll_directory` en Windows al arrancar.
- `AutoShorts.spec`:
  - Empaquetar directamente `cublas64_12.dll` y `cublasLt64_12.dll` en `binaries` dentro de la carpeta `ctranslate2` y en la raíz de `_internal`.

### Archivos Protegidos
- `analizarrepos/`: No tocar bajo ninguna circunstancia.

---

## 3. Paso a Paso Técnico

1. **Paso 1: Helper de Supresión de Ventanas (`python_backend/paths.py`):**
   - Implementar `get_no_window_kwargs()` configurando `CREATE_NO_WINDOW` y `STARTUPINFO` con `SW_HIDE` para Windows.
2. **Paso 2: Aplicar Supresión de Ventana y Redirección a Logs en `python_backend/media.py`, `stream_server.py`, `telemetry.py`:**
   - Modificar las llamadas a `subprocess` y conectar `drain_stderr` con `log_buffer.push`.
3. **Paso 3: Blindaje Anti-Cuelgues y Fallback a CPU en `python_backend/transcription.py`:**
   - Envolver la instanciación de `WhisperModel` en un bloque `try/except`. Si falla en CUDA, degradar automáticamente a CPU (`int8`) notificando al usuario en el terminal interno.
4. **Paso 4: Empaquetar Librerías cuBLAS en `AutoShorts.spec` y `run.py`:**
   - Añadir `cublas64_12.dll` y `cublasLt64_12.dll` a `binaries` en `AutoShorts.spec`.
   - En `run.py`, agregar `os.add_dll_directory` para garantizar que Windows cargue las DLLs desde el paquete portable.
5. **Paso 5: Pruebas Automatizadas Unitarias, de Integración y E2E:**
   - Crear `scratch/test_no_window_and_whisper_fallback_unit.py`.
   - Ejecutar la suite completa (`test_*.py`) verificando el 100% de tests en verde.
6. **Paso 6: Recompilar Paquete Portable y Sincronizar Escritorio:**
   - Ejecutar `python build_portable.py`.
   - Copiar los binarios actualizados a `C:\Users\JEFF\Desktop\AutoShorts - Portable` manteniendo la configuración y datos del usuario.
7. **Paso 7: Registrar Decisión y Git Sync:**
   - Registrar D-017 en `DECISIONS.md`.
   - Commit y push en ramas `release-v2.5` y `main`.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** Tamaño del ZIP final con cuBLAS.
  - *Análisis:* `cublas64_12.dll` y `cublasLt64_12.dll` tienen una altísima tasa de compresión por tratarse de matrices y kernels compilados. El ZIP pasará de 179 MB a ~380 MB, manteniéndose muy por debajo del límite de GitHub (2 GB).
- **Riesgo:** Equipos sin GPU NVIDIA (amigos con AMD o laptops sin gráfica).
  - *Mitigación:* Con el fallback automático a CPU, el programa **nunca fallará ni lanzará errores de DLL**, funcionando fluidamente en cualquier PC con Windows.

---

## 5. Estrategia de Testing (Gate de Cierre Obligatorio)

1. **Tests Unitarios (`scratch/test_no_window_and_whisper_fallback_unit.py`):**
   - Validar que `get_no_window_kwargs()` retorne `creationflags=0x08000000` y `STARTF_USESHOWWINDOW` en Windows.
   - Validar la lógica de fallback de Whisper: simular error de CUDA y verificar que el engine cambie a CPU int8 sin lanzar excepción al llamador.
2. **Tests de Integración:**
   - Verificar que `extract_audio` invoque `subprocess.Popen` con los flags correctos.
   - Verificar la presencia de las DLLs cuBLAS en la configuración de PyInstaller.
3. **Tests E2E:**
   - Ejecución de toda la suite de pruebas del proyecto (`python -m unittest discover -s scratch -p "test_*.py"`).
   - Compilación exitosa del portable con `build_portable.py` y validación de hash SHA-256.

---

## 6. Skills Aplicadas

- `senior-code-craft`: Resiliencia ante fallos de hardware (*graceful degradation*), eliminación de dependencias frágiles, manejo defensivo de DLLs del SO.
- `antislop`: Código conciso, sin comentarios redundantes, sin caracteres prohibidos como em dashes (`—`).
