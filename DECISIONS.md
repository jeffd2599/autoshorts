# Registro de Decisiones de Arquitectura y Documentación

## D-001: Reescritura del README Principal
- **Decisión:** Reestructurar `README.md` como una guía técnica exhaustiva de nivel profesional, documentando la totalidad de módulos implementados en el backend de Python 3 y el frontend de React 19.
- **Motivo:** El README previo omitía módulos críticos (faster-whisper con CTranslate2, presets de subtítulos ASS, detector de pausas dead-air y el importador de YouTube con análisis de derechos).
- **Estándar:** Aplicar principios de documentación técnica clara y directa: sin fórmulas vacías, sin guiones largos de tipo em dash y con especificaciones validadas contra el código fuente.

## D-002: Arquitectura del Backend en Python 3
- **Decisión:** Mantener y documentar la migración completa del backend desde Rust/Tauri hacia Python 3.11 sobre PyWebView.
- **Motivo:** Facilita la ejecución nativa de PyTorch con aceleración CUDA, integración directa con Whisper/CTranslate2 y comunicación sin fricción con servidores locales de LLM (Ollama y LM Studio).

## D-003: Eliminación de PyInstaller Antiguo y Lanzador Batch
- **Decisión:** Eliminar `build_exe.py`, `AutoShorts.spec`, `build_tmp/` y `release/`. Incorporar el lanzador `AutoShorts.bat` con detección automática de entornos virtuales (`venv`, `.venv`, `env`) y pausa diagnóstica.
- **Motivo:** El script antiguo de PyInstaller presentaba fallos y ensuciaba el repositorio. La distribución de un binario final se gestionará en un hito futuro mediante una release portable limpia para GitHub.

## D-004: Filosofía Local-First (Cero Coste de APIs)
- **Decisión:** Orientar la arquitectura y la documentación hacia el uso 100% local en la máquina del usuario: transcripción local con faster-whisper (CUDA FP16 / CPU INT8) e inferencia con Ollama y LM Studio.
- **Motivo:** AutoShorts está diseñado como un software a medida para creadores que aprovechan la potencia de su propio hardware sin pagar suscripciones ni consumo de tokens por minuto.

## D-005: Especialización Exclusiva en Clips y Purga de Funcionalidades Cloud y AutoEdición
- **Decisión:** Retirar completamente el importador de YouTube (yt-dlp), el módulo de AutoEdición de formato largo (autoedit_service.py, AutoEditWorkspace.tsx), OpenAI Whisper estándar, Deepgram y todas las pasarelas cloud (OpenRouter, DeepSeek, OpenAI, Anthropic, Gemini, Groq). El software se especializa exclusivamente en la extracción y edición de clips verticales virales (Shorts, Reels, TikTok) con faster-whisper y LLMs locales (Ollama y LM Studio).
- **Motivo:** Eliminar latencias de red y cuellos de botella de APIs gratuitas o de pago, simplificar la arquitectura, reducir la superficie de mantenimiento y garantizar una experiencia 100% privada, local y sin coste operativo.

## D-006: Estandarización Obligatoria en pnpm como Gestor de Paquetes
- **Decisión:** Establecer pnpm como el único gestor de paquetes de Node.js / frontend permitido en el proyecto (prohibido el uso de npm o yarn).
- **Motivo:** Directriz técnica explícita del usuario y ventajas de rendimiento, consistencia de dependencias y ahorro de almacenamiento mediante enlaces duros centralizados.

## D-007: Entrada Directa sin Modal de Bienvenida y Autodetección No Bloqueante de LLMs
- **Decisión:** Eliminar el modal bloqueante de onboarding (OnboardingModal.tsx). AutoShorts inicia de inmediato en el Dashboard principal de proyectos. La detección de Ollama y LM Studio opera de forma automática, no invasiva y en tiempo real, reflejándose en la barra de estado inferior (StatusBar.tsx) y en el panel de configuración (SettingsPanel.tsx), sin forzar descargas obligatorias de modelos.
- **Motivo:** Evitar fricción de entrada, respetar la autonomía del usuario para elegir libremente su motor local (LM Studio u Ollama) y garantizar el comportamiento fluido y tradicional esperado en aplicaciones nativas de escritorio.

## D-008: Detección Dinámica de VRAM/GPU, Ordenamiento Inteligente de Whisper y Rediseño de Configuración
- **Decisión:** Eliminar todas las referencias estáticas a GPUs específicas (como RTX 2060 12GB). La idoneidad de los modelos (Óptimo, Moderado, Pesado) se calcula de forma 100% dinámica en tiempo real según la GPU y VRAM detectadas (4GB, 6GB, 8GB, 12GB, 16GB o CPU). Los modelos de Whisper se ordenan con optgroups priorizando los ya descargados en disco y, dentro de cada grupo, de mayor idoneidad a mayor peso. El panel de configuración se rediseñó en una arquitectura limpia de 3 tarjetas independientes (Faster-Whisper, Motor de IA, y Prompt del Sistema) con responsive fluido.
- **Motivo:** Adaptar el software universalmente al hardware de cualquier usuario sin colapsos visuales, textos acumulados ni falsas advertencias de VRAM.

## D-009: Fusión Definitiva de Prompt de Detección de Momentos y Social Copywriting Conciso
- **Decisión:** Fusionar el prompt base del sistema (`DEFAULT_MOMENTS_PROMPT`) integrando los criterios de alta retención para TikTok, Reels y Shorts (ganchos de primeros 3s, picos emocionales/gameplay, contenido narrativo, auto-conclusión estricta, cortes limpios en pausas naturales y exclusiones de partes lentas o promocionales), manteniendo el contrato técnico JSON (`candidates`/`clips`) de bajo nivel 100% invisible para el usuario. Se actualizó el generador y normalizador de social copy (`generate_social_copy_with_llm`, `_normalize_social_copy_dict`) aplicando los principios de `antislop-copywriting`: descripciones breves de 2-3 líneas para no tapar los videos en smartphone, eliminación de guiones largos (`—`) y límite estricto garantizado de 3 a 5 hashtags específicos.
- **Motivo:** Maximizar la calidad de los clips detectados y la retención en redes sociales verticales, evitando descripciones excesivamente largas o saturadas de hashtags genéricos que perjudican el engagement.

## D-010: Identidad Visual Inicial
- **Decisión:** Reemplazar el icono genérico heredado del repositorio base por un primer imagotipo temático para AutoShorts en Windows y web.
- **Motivo:** Sustituir la gráfica base del template por recursos propios del proyecto.

## D-011: Rediseño Minimalista de Primer Nivel para el Isotipo y Branding
- **Decisión:** Rediseñar por completo el logo e icono de AutoShorts adoptando una estética geométrica puramente minimalista de nivel profesional: un squircle oscuro mate con un botón de reproducción estilizado dividido por un corte diagonal de alta energía en gradiente cálido neón (ámbar a coral magenta). Se generaron capas multi-resolución en `icon.ico` (16x16 a 256x256) con transparencia perimetral y `icon.png` (512x512) para máxima legibilidad en barra de tareas, barra lateral (36x36) y navegador.
- **Motivo:** Eliminar la complejidad visual recargada de tipo wallpaper, garantizando nitidez absoluta, alto contraste y presencia de marca sólida en cualquier escala.

## D-012: Cancelación Inmediata con Liberación de VRAM, Chunks Adaptativos y Circuit Breaker
- **Decisión:** Implementar liberación explícita y completa de memoria en transcripción (`gc.collect()`, `torch.cuda.empty_cache()` y desreferenciación inmediata de generadores de CTranslate2 y modelos) tanto en interrupción como en `cancel_transcription`, integrando chequeo de cancelación en el análisis acústico RMS. Para la inferencia LLM (LM Studio y Ollama), se implementó detección dinámica de contexto, dimensionamiento inteligente de bloques y sub-partición adaptativa por bisección ante desbordamiento de contexto (`exceed_context_size_error`), permitiendo operar fluidamente con ventanas de 4k u 8k sin saturar la VRAM de la GPU. Ante errores fatales o modelos descargados, un Circuit Breaker corta de inmediato la ejecución para evitar saturación inútil. Se amplió el logo en la barra lateral a 36x36 px para óptima presencia visual.
- **Motivo:** Evitar que procesos cancelados continúen ocupando la GPU y que grabaciones extensas fallen en bloque por exceder el context window cuando el usuario trabaja con VRAM ajustada.

## D-013: Release v2.5, Archivos de Proyecto Autónomos (autoshorts.project), Visor de Logs y Empaquetado Portable onedir
- **Decisión:** 
  1. Crear la rama `release-v2.5` siguiendo la secuencia de releases (`release-v1.0`, `release-v1.5`, `release-v2.0`) y fijar el versionado del software en `v2.5.0` (`python_backend/version.py`, `package.json`).
  2. Implementar arquitectura de proyectos autónomos (`autoshorts.project` en la raíz de cada carpeta de grabación, estilo Premiere/CapCut) con auto-migración de proyectos existentes, auto-detección al importar para omitir Whisper si ya existe transcripción, y re-vinculación inteligente de video cuando cambia la unidad de disco.
  3. Incorporar visor de terminal y logs en vivo (`LogsModal.tsx`, `logger.py`) accesible desde el Sidebar y la StatusBar, con buffer circular de 1,000 líneas, rotación en `autoshorts.log`, copia rápida al portapapeles y auto-scroll.
  4. Diseñar la arquitectura portable en modo `--onedir` (`AutoShorts.spec`, `paths.py`, `multiprocessing.freeze_support()` en `run.py`) e implementar `build_portable.py` para compilar el frontend y empaquetar `AutoShorts-v2.5.0-windows-x64-portable.zip` con checksum SHA-256.
- **Motivo:** Garantizar máxima portabilidad de datos entre máquinas y pendrives sin depender de SQLite central, evitar pérdida de visibilidad de eventos en Windows sin consola, y permitir la distribución oficial en GitHub Releases sin dependencias de instalación.

## D-014: Optimización de Tamaño del Bundle Portable (< 400 MB) Mediante Exclusión de PyTorch
- **Decisión:** Excluir explícitamente PyTorch (`torch`, `torchvision`, `torchaudio`, `torchtext`) de la compilación portable en `AutoShorts.spec` y adaptar `python_backend/transcription.py` para utilizar directamente `ctranslate2.get_cuda_device_count()` para la aceleración GPU de `faster-whisper`.
- **Motivo:** PyTorch y sus librerías CUDA (`torch_cuda.dll`, `cudnn_engines`, `cublasLt`, etc.) sumaban más de 2.2 GB innecesarios, haciendo que el ZIP resultante pesara 2.41 GB y fuera rechazado por el límite estricto de 2.0 GB de GitHub Releases. `faster-whisper` no utiliza PyTorch sino CTranslate2 (56 MB), el cual detecta y ejecuta modelos en GPUs NVIDIA CUDA de forma nativa e independiente, reduciendo el ZIP final a menos de 400 MB.

## D-015: Auditoría Integral y Purga de Dependencias Huérfanas de Tauri y Estandarización de Requisitos
- **Decisión:** 
  1. Eliminar por completo `@tauri-apps/api`, `@tauri-apps/plugin-dialog` y `@tauri-apps/cli` de `package.json`, junto con los scripts `tauri:*`. Refactorizar `src/apiBridge.ts` con tipado estricto eliminando las ramas condicionales de Tauri hacia una interfaz nativa directa con `window.pywebview.api`. Eliminar `package-lock.json` residual para respetar D-006 (`pnpm`).
  2. Actualizar `requirements.txt`: incorporar formalmente `pillow>=10.0.0` (utilizado por el generador de stickers y títulos en `media.py`), retirar la dependencia engañosa de `torch>=2.0.0` y documentar que la aceleración GPU es gestionada autónomamente por CTranslate2.
  3. Retirar `'psutil'` de `hiddenimports` en `AutoShorts.spec` (la telemetría es 100% nativa vía `ctypes` y `nvidia-smi`). Eliminar `AutoShorts.vbs` y preservar protegida la carpeta `analizarrepos/`.
- **Motivo:** Eliminar 14 paquetes muertos de `node_modules`, desvincular código obsoleto de la migración de Tauri, prevenir confusiones al instalar dependencias en Python y mantener el repositorio en un estado rigurosamente limpio y profesional.
