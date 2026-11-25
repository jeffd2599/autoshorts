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


## D-016: Blindaje Reactivo y Fallback Estático para Modelos Faster-Whisper en Ejecutable Portable
- **Decisión:**
  1. Definir DEFAULT_WHISPER_MODELS: WhisperModel[] en src/types.ts con las especificaciones oficiales de los 6 modelos Faster-Whisper (large-v3-turbo, large-v3, medium, small, ase, 	iny).
  2. Inicializar whisperModelsList con estos modelos por defecto en useAppSettings.ts e integrar sincronización reactiva automática mediante useEffect al actualizarse environment?.whisperModels.
  3. Extender el timeout del bridge en src/apiBridge.ts de 2.5s a 12s para mitigar arranques en frío (cold start) en WebView2 en Windows, incorporando reintentos con backoff al montar la aplicación.
  4. Implementar fallback defensivo en StyleModal.tsx y SettingsPanel.tsx para garantizar que los selectores desplegables contengan siempre las opciones de modelos en cualquier estado.
  5. Configurar en AutoShorts.spec la recolección exhaustiva de datos de aster_whisper (silero_vad_v6.onnx), librerías dinámicas de ctranslate2 (cudnn64_9.dll, libiomp5md.dll) y sus submódulos recursivos.
  6. Blindar python_backend/api.py registrando excepciones de llamadas RPC en utoshorts.log y garantizando lista de respaldo en environment_status.
- **Motivo:** Evitar que condiciones de carrera temporales en el puente PyWebView o inicializaciones lentas en Windows dejen los selectores de modelos vacíos en la interfaz portable (AutoShorts.exe), y asegurar la presencia de todos los binarios y pesos ONNX necesarios para la inferencia de voz y VAD.

## D-017: Supresión Total de Ventanas CMD en Subprocesos, Empaquetado de cuBLAS CUDA y Fallback Resiliente a CPU en Whisper
- **Decisión:**
  1. Implementar `get_no_window_kwargs()` en `python_backend/paths.py` inyectando `creationflags=subprocess.CREATE_NO_WINDOW` (`0x08000000`) y `STARTF_USESHOWWINDOW` con `wShowWindow=SW_HIDE` en Windows. Aplicar esta configuración a todas las llamadas de `subprocess.Popen` y `subprocess.run` en `media.py` (`extract_audio`, `probe_media`, `extract_video_thumbnail`, `render_flat_clip`), `stream_server.py` y `telemetry.py`.
  2. Redirigir la lectura de `stderr` de FFmpeg en `extract_audio` hacia `log_buffer.push(...)` para alimentar en tiempo real el visor interno de Terminal/Logs (`LogsModal.tsx`) sin requerir consolas externas.
  3. Empaquetar `cublas64_12.dll` y `cublasLt64_12.dll` en `ctranslate2` dentro de `AutoShorts.spec` y registrar `os.add_dll_directory` en `run.py` y `transcription.py` para aceleración nativa CUDA 12 sin requerir PyTorch ni instalación manual del CUDA Toolkit.
  4. Blindar `transcribe_local` en `python_backend/transcription.py` con degradación elegante (*graceful degradation*): ante cualquier fallo de inicialización en GPU CUDA (falta de DLLs, drivers incompatibles o hardware no NVIDIA), el software captura el error, emite alerta en el terminal interno y conmuta automáticamente a CPU (`int8`) completando la transcripción con cero cuelgues.
  5. Sustituir caracteres emoji en sentencias `print()` para prevenir errores `UnicodeEncodeError` en terminales con codificación estándar Windows `cp1252`.
- **Motivo:** Garantizar una experiencia de escritorio completamente limpia y profesional sin ventanas CMD flotantes, proporcionar aceleración CUDA autónoma en el bundle portable y asegurar tolerancia absoluta a fallos de hardware en cualquier ordenador con Windows.


## D-018: Release v2.6.0 — Editor de Cortes Internos CapCut, Calibración de Bitrate TikTok, Contexto Dinámico LM Studio, Summary Automático y Empaquetado tar.gz
- **Decisión:**
  1. Calibrar el exportador de video para TikTok y plataformas verticales en `python_backend/media.py`: sustituir el perfil sobre-inflado (`-crf 15`, `-b:v 16M`, `-maxrate 24M`, `-bufsize 30M`, `-b:a 320k`) por Constrained CRF con VBV (`-crf 19`, `-maxrate 10M`, `-bufsize 16M`, `-pix_fmt yuv420p`, `-c:a aac`, `-b:a 192k`, `-movflags +faststart`). Mantener resolución 1080x1920 nativa sin reescalado ni sharpening artificial para evitar la recompresión agresiva de TikTok.
  2. Implementar detección dinámica de contexto en LM Studio (`python_backend/llm.py`): consultar `GET /api/v0/models` extrayendo directamente `loaded_context_length` cuando `state == "loaded"` (con fallback a `/api/v1/models`). Al detectar 16k tokens, los bloques de análisis se calculan a 10 minutos (en vez de 5 min), reduciendo las llamadas al LLM de 50 a ~25 y acelerando el análisis al doble.
  3. Integrar editor de cortes internos estilo CapCut (`CandidatePreviewModal.tsx`, `useMediaPipeline.ts`, `media.py`): barra de tiempo multi-segmento con botón "Dividir en cabezal", marcado/desmarcado de fragmentos eliminados, selector de FPS (Auto/60/30) y salto automático en previsualización. En backend, concatenación frame-accurate (`trim`/`concat`/`xfade`) y re-mapeo temporal matemático de subtítulos ASS y SRT.
  4. Poblado automático de la carpeta `summary/` (`project_service.py`): generación continua de `transcripcion_completa.txt`, `subtitulos_completos.srt`, `transcripcion_detallada.json` y `momentos_virales.txt`.
  5. Empaquetado portable `.tar.gz`: migrar `build_portable.py` para generar `AutoShorts-v2.6.0-windows-x64-portable.tar.gz` con compresión Gzip nivel 9 y checksum SHA-256.
- **Motivo:** Entregar clips nítidos que no se pixelen tras subirse a TikTok, permitir a los creadores eliminar partes muertas dentro de los momentos antes de exportar, optimizar el uso de modelos LLM con ventanas de contexto amplias y cumplir con las especificaciones de la versión v2.6.0.

## D-019: Auto-Carga en LM Studio para Contexto Real de 16k, Sincronización Remotion en Subtítulos SRT/ASS con Cortes Internos y Feedback en Tiempo Real de Exportación FFmpeg
- **Decisión:**
  1. Auto-precarga en LM Studio (`python_backend/llm.py`): Antes de evaluar el contexto dinámico con `get_available_context_size`, el pipeline ejecuta `ensure_model_loaded(provider="lmstudio", model_name=model_name)`. Si el modelo está `"state": "not-loaded"`, lo carga en memoria automáticamente mediante warm-up ping y espera confirmación activa de carga. Esto asegura que LM Studio devuelva el valor real de `loaded_context_length` (16.384 tokens) incluso sin tener activo el "Modo Ráfaga", evitando la caída artificial al default de 8k y previniendo timeouts en inferencia.
  2. Sincronización estricta de subtítulos SRT y ASS ante cortes (`python_backend/media.py`): Actualizar `generate_srt` para utilizar `chunk_words_remotion` con `silence_break_sec=0.35`. Ante fragmentos eliminados o pausas de silencio, las palabras se segmentan de forma independiente y se reasignan a la línea de tiempo concatenada sin generar subtítulos que atraviesen los cortes ni permanecer en pantalla durante silencios.
  3. Feedback y diagnóstico visual en exportación de video (`src/components/modals/CandidatePreviewModal.tsx`, `media.py`, `api.py`):
     - En frontend: Mantener el modal abierto durante la exportación con estado `isExporting`, spinner animado (`<Loader2 className="spin" />`), texto `"Exportando video..."` y bloqueo de botones para evitar clics duplicados o abandonos accidentales. El modal se cierra automáticamente solo tras completar el render con éxito; si ocurre un error, muestra una alerta descriptiva en pantalla para permitir reintentar.
     - En backend: Canalizar eventos informativos en tiempo real hacia `log_buffer.push(...)` en `render_flat_clip` y `render_flat_clip_for_candidate` (inicio de render, parámetros CRF 19 / VBV 10M, subtítulos libass, badge CTA y reporte final con tamaño en MB o stderr detallado).
     - Sanitización de rutas: Blindar `safe_hook` para evitar colisiones de caracteres (`¡`, `¿`) con el filtro de libass en Windows.
- **Motivo:** Garantizar que los modelos de 16k se aprovechen al 100% desde la primera ejecución sin requerir interacción manual previa, asegurar que el usuario tenga plena visibilidad del proceso de renderizado con FFmpeg y mantener la sincronización absoluta de subtítulos con los cortes internos.

## D-020: Intercalado de Pads en FFmpeg Concat, Rediseño de Alto Contraste del Botón Dividir y Persistencia Unificada de Ajustes y Cortes
- **Decisión:**
  1. Intercalado obligatorio en filtro `concat` de FFmpeg (`python_backend/media.py`): Corregir la sintaxis del filtro para que los pads de video y audio se intercalen estrictamente por segmento (`[vseg0][aseg0][vseg1][aseg1]...concat=n=N:v=1:a=1[vjoined][ajoined]`). Esto elimina el error `Media type mismatch` entre `asetpts` y `concat`.
  2. Rediseño de alto contraste para "Dividir en cabezal" (`src/components/modals/CandidatePreviewModal.tsx`): Retirar la clase `.btn-confirm` (que forzaba fondo blanco) y aplicar fondo índigo `#4f46e5`, texto blanco `#ffffff`, borde `#6366f1` y feedback hover `#4338ca` para una legibilidad y contraste óptimos (>7:1).
  3. Persistencia unificada de ajustes y cortes (`CandidatePreviewModal.tsx`): El botón "Guardar Ajuste" ahora persiste tanto el punto de inicio y fin como los cortes internos (`segments` / `subRanges`) en `localStorage` por candidato, restaurándolos automáticamente al reabrir el modal y mostrando confirmación visual instantánea (`¡Ajuste Guardado!`). El botón "Restablecer Original" limpia los cortes guardados y restaura el rango inicial.
- **Motivo:** Garantizar que la exportación de video multi-segmento con cortes internos se ejecute sin errores en FFmpeg, mejorar la experiencia de usuario con botones legibles y permitir que los cortes estilo CapCut no se pierdan al cerrar el modal.

## D-021: Release v2.7.0 — Control Total de Coordenadas X/Y Estilo NLE para Subtítulos y CTA, Fix de Persistencia de Trim y Acción Descartar
- **Decisión:**
  1. **Control Total de Coordenadas y Tamaño para Subtítulos (Lienzo Nativo 1080x1920):**
     - Integrar panel de transformación en pestaña 2 con sliders e inputs numéricos para Posición X (0-1080 px), Posición Y (0-1920 px), Tamaño de Fuente (36-88 px) y Alineación Horizontal (Izq, Centro, Der).
     - Añadir presets rápidos: "Streamer Elevado (1420)" para evitar colisiones con HUDs y overlays inferiores de streamers, "Arriba (280)", "Centro (960)", "Abajo (1680)" y botón "Centrar X (540)".
     - En backend (`python_backend/media.py`), inyectar el tag ASS `{\an{code}\pos(X, Y)}` en cada línea de diálogo para garantizar anclaje subpixel idéntico entre preview y render.
  2. **Control Total de Coordenadas, Escala y Corrección Visual en Insignia CTA:**
     - Panel de transformación en pestaña 3 con sliders e inputs para Posición X (0-1080), Posición Y (0-1920) y Escala (70% a 140%).
     - Corregir el bearing del emoji de corazón (`min(0, bbox_e[0])`) y ampliar el padding perimetral en `generate_cta_badge_image` para evitar cualquier roce con el borde curvo de la pastilla.
     - En filtergraph de FFmpeg, posicionar la insignia usando expresiones exactas centradas `overlay=x='max(0,min(W-w,X-w/2))':y='max(0,min(H-h,Y-h/2))'`.
  3. **Sincronización Unificada de Trim y Cortes Internos:**
     - Sincronizar en tiempo real los botones `+5s/-5s` y `+1s/-1s` de Punto de Inicio y Fin con los límites exteriores de los `segments`.
     - Reubicar los botones "Restablecer Original" y "Guardar Ajuste" al fondo de la pestaña Trim para que gobiernen de forma unificada tanto el recorte fino como los cortes internos estilo CapCut.
  4. **Previsualización 1:1 en Smartphone y Acción Descartar en Footer:**
     - El smartphone preview proyecta las coordenadas exactas con `(X/1080)*100%` y `(Y/1920)*100%`, logrando fidelidad idéntica al render final.
     - Renombrar el botón inferior a "Cerrar" (sin mutar el estado) y añadir el botón "Descartar Momento" que invoca `toggleCandidateDismissed` y cierra el estudio.
- **Motivo:** Otorgar a los creadores control absoluto sobre la ubicación y tamaño de subtítulos y stickers para evitar solapamientos con sus plantillas u overlays de streaming, asegurar que los recortes se guarden con total fidelidad y proporcionar un flujo de descarte ágil dentro del estudio.

## D-022: Auto-Apertura del Último Proyecto, Supresión de '}' en Subtítulos ASS y Centrado Métrico Subpixel en CTA
- **Decisión:**
  1. **Auto-Apertura del Último Proyecto (`src/hooks/useProjectActions.ts`):**
     - Persistir la clave `autoshorts_last_active_project_id` en `localStorage` al seleccionar o abrir proyectos.
     - En `refresh()`, cuando no se especifique un ID objetivo, restaurar automáticamente el último proyecto activo si continúa disponible en `projectList`, o seleccionar por defecto el proyecto más reciente (`projectList[0].id`).
     - Al borrar un proyecto (`deleteProject`) o deseleccionar explícitamente, limpiar la clave de `localStorage` para un comportamiento intuitivo idéntico a Premiere Pro y CapCut.
  2. **Supresión Definitiva del Carácter '}' Parásito en Subtítulos ASS (`python_backend/media.py`):**
     - Eliminar `{pos_tag}` y `{fs_tag}` de las directivas de reset inline de palabras individuales (`words_text`) en karaoke.
     - Mantener `{pos_tag}` y `{fs_tag}` exclusivamente al inicio del evento Dialogue (`Dialogue: ... {pos_tag}{fs_tag}{text_line}`), preservando una sintaxis ASS limpia sin llaves anidadas que confundan a libass.
  3. **Centrado Métrico Subpixel de Insignia CTA (`python_backend/media.py`):**
     - Medir la caja envolvente de píxeles exacta de cada glifo con `get_exact_glyph_bbox`.
     - Alinear verticalmente los centroides visuales del emoji y del texto respecto a la línea media del badge mediante compensación de offsets de glifo:
       `emoji_draw_y = (total_h - emoji_h) // 2 - bbox_e[1]`
       `text_draw_y = (total_h - text_h) // 2 - bbox_t[1]`
     - Establecer un espaciado horizontal calibrado entre el extremo derecho real del emoji y el inicio del texto.
- **Motivo:** Eliminar la fricción de tener que re-seleccionar proyectos al abrir la app, solucionar el error visual de la llave '}' en pantalla sobre las palabras activas de karaoke y lograr una estética tipográfica perfectamente equilibrada en la insignia de llamado a la acción.

## D-023: Medición Vectorial Ilimitada del Texto y Lienzo Dinámico de Emoji en Insignia CTA
- **Decisión:** En `python_backend/media.py` (`generate_cta_badge_image`), sustituir la medición de texto mediante rasterización fija por cálculo vectorial directo con `draw_d.textbbox((0, 0), rest_text, font=text_font)`. Para el emoji (`emoji_part`), dimensionar dinámicamente el lienzo de medición en función del tamaño de fuente escalado (`ss_font_size * 3`).
- **Motivo:** Prevenir que al escalar el CTA (por encima de 1.0x hasta 2.0x) la pastilla se trunque horizontalmente debido al límite rígido de un lienzo fijo de 400px, asegurando que frases completas ("¡Sígueme y dale like!") se dibujen al 100% íntegras con sus tapas curvas completas en cualquier resolución.

## D-024: Desacoplamiento de `datas` en PyInstaller y Purga de Build Previa para Actualizaciones Garantizadas
- **Decisión:** En `AutoShorts.spec`, desacoplar la regla `datas` para incluir específicamente `('dist/index.html', 'dist')` y `('dist/assets', 'dist/assets')` en lugar de la carpeta raíz `('dist', 'dist')`, suprimiendo la auto-recursión cíclica de PyInstaller hacia `dist/AutoShorts`. En `build_portable.py`, añadir la eliminación previa obligatoria de `dist/AutoShorts` y `build/AutoShorts` y la bandera `--noconfirm` (`-y`).
- **Motivo:** Evitar que PyInstaller aborte la sobrescritura del ejecutable `AutoShorts.exe` por colisión de directorio no vacío, garantizando que cada compilación reemplace íntegramente los binarios en `dist/` y en la distribución de escritorio.

## D-025: Release v2.8.0 — Enfoque Híbrido Gaming, Duraciones de 10m y 15m y Soporte Horizontal Nativo
- **Decisión:**
  1. **Enfoque Híbrido Gaming (Subgéneros + Contexto Libre):**
     - En frontend (`StyleModal.tsx`), incorporar 7 pastillas de selección rápida de subgénero de videojuegos (Competitivo, Campaña / Historia, Souls-like / Desafío, Precisión / Rítmico, Terror, Sandbox, General) y un campo de texto libre para contexto de juego o capítulo de serie (e.g., "Campaña de Hollow Knight", "Capítulo 5 de Metro").
     - En backend (`llm_prompts.py`, `llm.py`, `api.py`), definir directivas heurísticas especializadas (`SUBGENRE_DIRECTIVES`) e inyectarlas dinámicamente en el prompt del sistema al LLM junto con el contexto del juego.
  2. **Ampliación de Duraciones Objetivo (10m y 15m):**
     - Añadir objetivos de duración de 10 min (~540s-660s) y 15 min (~810s-990s) para formato serie/episodio en `DURATION_SPECS`, `types.ts` y `StyleModal.tsx`.
     - Calibrar la partición de transcripción en `detect_candidates_pipeline` con bloques adaptados de 1200s (20m) y 1800s (30m) para análisis sin fragmentación excesiva.
  3. **Compatibilidad Nativa con Video Horizontal (16:9) y Resoluciones Arbitrarias:**
     - En `media.py` y `api.py`, detectar dimensiones originales y aspect ratio nativo mediante `probe_media`.
     - Soportar opciones de aspect ratio (`original`, `16:9`, `9:16`) tanto en importación como en exportación por candidato sin forzar recorte vertical destructivo cuando el video es horizontal.
     - Adaptar el lienzo de subtítulos ASS (`PlayResX` / `PlayResY`) a 1920x1080 para formato horizontal (o dimensiones nativas para original) con fuentes y márgenes proporcionales.
     - Blindar FFmpeg con el filtro `scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1` garantizando paridad exacta de píxeles y evitando errores de libx264 ante dimensiones impares.
     - En el reproductor de previsualización (`CandidatePreviewModal.tsx`, `modals.css`), adaptar dinámicamente la ventana de previsualización (`.stage-horizontal` 16:9 vs `.stage-vertical` 9:16) y la proyección porcentual de subtítulos y stickers CTA a la geometría activa.
- **Motivo:** Permitir a los creadores de contenido de videojuegos analizar partidas de cualquier género con instrucciones precisas para la IA, generar videos largos o episodios completos de hasta 15 minutos, y procesar y exportar videos en formato horizontal 16:9 nativo o en cualquier resolución sin distorsión ni errores de codificación.

## D-026: Macro-Agrupación para 4GB VRAM, Coordenadas Adaptativas NLE, Filtro/Orden de Clips y Desacoplamiento de Whisper
- **Decisión:**
  1. **Macro-Agrupación y Protección de Contexto para 4GB VRAM (`python_backend/llm.py`):**
     - Implementar `macro_compact_segments` con agrupamiento por bloques temporales (`block_sec=30s-60s`) y límite estricto de palabras por bloque (`max_words_per_block=25`), reduciendo el consumo de tokens en un 75% (~2,000 tokens para 30 minutos de stream).
     - Añadir protección de bisección mínima (`can_bisect`): un bloque nunca se subdivide si su mitad es menor que la duración mínima del clip solicitado (`dur_info['min']`), permitiendo a tarjetas de 4GB con ventanas de 4k tokens extraer clips de 10m y 15m sin desbordamiento de contexto.
  2. **Coordenadas y Presets NLE Adaptativos (`CandidatePreviewModal.tsx`):**
     - Establecer presets y rangos independientes por orientación: horizontal 1920x1080 (Arriba: 100, Centro: 540, Abajo: 920, Streamer Elevado: 780, Centro X: 960) vs vertical 1080x1920 (Arriba: 280, Centro: 960, Abajo: 1680, Streamer Elevado: 1420, Centro X: 540).
     - Implementar almacenamiento independiente por relación de aspecto (`autoshorts_caption_y_h`, `autoshorts_caption_y_v`, etc.) y auto-reescalado proporcional defensivo al conmutar formatos para prevenir que las coordenadas superen la altura visible (1080px).
  3. **Selector de Duraciones Completo, Orden Cronológico y Filtro por Tipo (`CandidatePanel.tsx`):**
     - Añadir opciones de 10m y 15m al selector de duración en el panel principal.
     - Incorporar selector de ordenación: Por Match / Virilidad (defecto), Cronológico (por `startSec` en línea de tiempo) y por Duración.
     - Incorporar barra de pastillas interactivas con conteo dinámico para filtrar por `hook_type` (Todos, Reacción, Destacado, Clutch / Jugada, Anécdota, Fail / Rage, Tutorial / Tip, Pregunta).
  4. **Desacoplamiento de Whisper y Fix de Auto-Transcripción al Importar:**
     - En `useMediaPipeline.ts`, trasladar las comprobaciones de Ollama / LM Studio para que ocurran exclusivamente dentro de `autoDetectMoments`. La transcripción con Whisper opera 100% independiente de CTranslate2 sin requerir servidores LLM activos.
     - Persistir `autoTranscribeOnImport` en `localStorage` (por defecto `true`) y validar la existencia real de transcripción (`rawJson.length > 5`).
- **Motivo:** Permitir que usuarios con hardware modesto (4GB VRAM) procesen videos de larga duración con IA local, garantizar una experiencia de edición NLE libre de coordenadas huérfanas en videos horizontales, facilitar la navegación y ordenación de momentos por línea de tiempo y asegurar que la importación siempre transcriba sin fricción.

## D-027: Reparación Definitiva de Renderizado de Subtítulos y CTA en Exportación de Clips (Hardware Real)
- **Decisión:**
  1. **Lienzo Canónico Universal en Subtítulos ASS (`python_backend/media.py`):**
     - Establecer siempre `PlayResX: 1920` y `PlayResY: 1080` (en horizontal) y `1080x1920` (en vertical) en `generate_ass_subtitles`. En el estándar ASS, este encabezado define el lienzo de referencia sobre el cual operan las etiquetas de posición absoluta `\pos(x,y)` de la UI, permitiendo a `libass` proyectar y reescalar con precisión milimétrica los subtítulos sobre cualquier resolución de video nativa (720p, 1080p, 4K), erradicando el bug donde los subtítulos se renderizaban fuera de pantalla en videos 720p.
  2. **Escalamiento Proporcional y Duración Extendida de Insignia CTA:**
     - En `render_flat_clip`, proyectar y reescalar matemáticamente las coordenadas $cta_x$ y $cta_y$ al ancho y alto real del video final (`target_w`, `target_h`), corrigiendo el desplazamiento lateral en videos 720p.
     - Extender la ventana de visibilidad del badge animado a 5 segundos completos ($t = 1.0\text{s}$ a $6.0\text{s}$) al inicio y $4.5\text{s}$ al cierre para garantizar su impacto visual.
  3. **Saneamiento Defensivo de Coordenadas en Frontend y Propagación en Lote (`CandidatePreviewModal.tsx`, `useMediaPipeline.ts`):**
     - Clampear defensivamente en React todas las coordenadas ($X, Y$) contra `canvasWidth` y `canvasHeight`, impidiendo que valores desactualizados o provenientes de modo vertical ($Y = 1680$) persistan en modo horizontal.
     - En `useMediaPipeline.ts`, recuperar y propagar automáticamente las opciones de subtítulos y CTA guardadas en `localStorage` al realizar cortes individuales desde la tarjeta o en lote ("Cortar Seleccionados").
  4. **Eliminación del Fallback Silencioso en FFmpeg:**
     - Remover el reintento que purgaba los filtros de subtítulos y CTA ante errores. Si ocurre un fallo en FFmpeg, se registra el `stderr` en el buffer de logs y se lanza una excepción explícita para máxima transparencia y trazabilidad técnica.
- **Motivo:** Garantizar que los subtítulos dinámicos y la insignia CTA personalizada se quemen visualmente en los clips exportados con FFmpeg sobre cualquier resolución y formato de video, comprobado al 100% mediante análisis de píxeles en hardware real.

## D-028: Antislop en UI, Control Estricto de Duración y Limpieza de Prompts de Copy y Thinking
- **Decisión:**
  1. **Control Estricto de Duraciones Máximas (`python_backend/llm.py`, `llm_prompts.py`):**
     - Implementar `clamp_candidate_duration`: restringe cualquier momento propuesto por el LLM que exceda el techo máximo (`target_max * 1.10`, ej. 75s-82s para 1m) recortando hacia el corte de frase/segmento de voz más cercano dentro de la ventana objetivo, eliminando clips desbordados de 3 a 5 minutos cuando se solicita 1 minuto.
  2. **Refactorización de "Rehacer Copy" y Desacoplamiento de Titulares:**
     - En `python_backend/api.py` (`regenerate_social_copy`), inyectar contexto temático sin forzar la repetición del titular.
     - En `python_backend/llm.py` (`generate_social_copy_with_llm`, `_normalize_social_copy_dict`), prohibir explícitamente anteponer el título o titular en el cuerpo de la descripción, erradicar emojis de alarma (`🚨`, `⚠️`) y generar descripciones naturales y vendedoras idénticas en estilo a las iniciales.
  3. **Purgado de "Thinking / Modo Razonamiento / CoT":**
     - Retirar definitivamente todos los checkboxes, textos y advertencias de "Thinking / CoT en Ollama" y "Modo Rápido" en `CandidatePanel.tsx`, `StyleModal.tsx` y `SettingsPanel.tsx`. Fijar internamente `enableThinking = false` para respuestas JSON ultrarrápidas y directas sin saturar la UI.
  4. **Antislop en UI (Erradicación de Emojis Decorativos No Profesionales):**
     - Siguiendo `antislop-ui` (R-04, R-16) y `antislop-copywriting`, purgar todos los emojis en métricas de candidatos (`Viral /100`, `Hook:`, `Retención:`, `Valor:`, `Compartir:`), chips de filtro por tipo, botones de ordenamiento, selectores de subgénero y botones de importación.
     - Sustituirlos por diseño sobrio y profesional estilo suite NLE con iconos Lucide pertinentes o texto directo.
     - Purgar emojis en hooks acústicos (`💥 Jugada...` -> `Jugada...`) y aplicar `strip_emojis_from_text` sobre títulos generados.
  5. **Detección Acústica en Gameplay Silencioso:**
     - Resaltar en la UI de importación el funcionamiento del analizador acústico RMS (`inject_acoustic_cues_into_transcript`), el cual detecta combates, disparos y jugadas tensas en segundo plano aunque el creador guarde silencio.
- **Motivo:** Garantizar coherencia estricta en las duraciones solicitadas, proporcionar copys atractivos y limpios sin redundancias, ofrecer una interfaz profesional de grado industrial libre de emojis genéricos y simplificar el uso eliminando controles innecesarios de razonamiento.

## D-029: Auditoría Senior — Optimizaciones de Arquitectura, Concurrencia, Rendimiento y Calidad de Código
- **Decisión:**
  1. **Pool de Conexión SQLite y Concurrencia WAL (`python_backend/db.py`):**
     - Sustituir la apertura repetitiva de conexiones en cada query por un pool por hilo utilizando `threading.local()`.
     - Habilitar `PRAGMA journal_mode = WAL;` para garantizar lecturas y escrituras no bloqueantes en Windows bajo concurrencia de transcripción y API.
     - Implementar versionado formal de esquema con tabla `schema_version` y migraciones secuenciales idempotentes.
     - Centralizar `classify_hook_type` en `llm_prompts.py` y proveer método de cierre explícito `db.close()`.
  2. **Unificación de Lógica de Duración y Resiliencia en LLM (`python_backend/llm.py`):**
     - Unificar `expand_short_candidate` y `clamp_candidate_duration` en una sola función lineal $O(n)$: `normalize_candidate_duration`.
     - Implementar `_call_with_retry` con backoff exponencial para llamadas HTTP a Ollama y LM Studio ante caídas o timeouts transitorios.
     - Incorporar telemetría de niveles de reparación JSON en `parse_candidate_json` y advertencias explícitas en logs ante candidatos malformados.
  3. **Seguridad y Trazabilidad en API y Multimedia (`python_backend/api.py`, `media.py`):**
     - Erradicar la evaluación de JavaScript con f-strings crudos en `refine_project_transcript`, reemplazándola por `self.emit()` seguro con serialización JSON.
     - Implementar `_validate_safe_path` para bloquear ataques de path traversal hacia directorios del sistema en `open_folder` y `move_project_folder`.
     - Introducir `probe_media_cached` con `@lru_cache` para evitar subprocesos redundantes de ffprobe sobre el mismo archivo multimedia.
  4. **Purga Integral de Dead Props y Memoización en Frontend (React / TypeScript):**
     - Retirar definitivamente `enableThinking` y `setEnableThinking` de la cadena completa de props (`useAppSettings.ts`, `App.tsx`, `useMediaPipeline.ts`, `CandidatePanel.tsx`, `StyleModal.tsx`, `SettingsPanel.tsx`, `QuickCopyModal.tsx`, `ModalContainer.tsx`).
     - Eliminar props muertas en `WorkspaceHeader` (`selectedCount`, `selectedCutCount`, `selectedCaptionsCount`).
     - Envolver en `useMemo` los filtros y ordenamiento de candidatos en `CandidatePanel.tsx` y los contadores en `useMediaPipeline.ts`.
     - Limpiar timers de `setTimeout` con `useRef` para evitar memory leaks y advertencias de desmontaje.
     - Reemplazar `window.confirm` bloqueante por confirmación reactiva en `SettingsPanel.tsx`.
- **Motivo:** Elevar el software a estándares de ingeniería senior de producción: cero fugas de memoria, mayor rendimiento en UI y base de datos, protección contra errores transitorios de red/LLM y eliminación total de código muerto.








## D-030: Auditoría Senior — Sincronización en Lote, Descarte Atómico, Resiliencia ante Errores y Pulido Antislop
- **Decisión:**
  1. **Sincronización Completa de Coordenadas, Estilos y Cortes en Lote (`src/hooks/useMediaPipeline.ts`):**
     - En `cutSelected`, recuperar de `localStorage` para cada candidato seleccionado sus coordenadas proporcionales de subtítulos y CTA según orientación (`_v` vs `_h`), colores, escala y segmentos internos estilo CapCut (`autoshorts_candidate_segments_${candidate.id}`), propagando la carga completa de parámetros a `render_flat_clip_for_candidate`.
  2. **Descarte Atómico y Exclusión de Descartados en Slider (`python_backend/db.py`, `src/hooks/useMediaPipeline.ts`, `CandidatePanel.tsx`):**
     - En `db.py` (`toggle_candidate_dismissed`), limpiar automáticamente el estado de selección con `selected = CASE WHEN ? = 1 THEN 0 ELSE selected END`.
     - En `db.py` (`set_selected_clip_count`), añadir la cláusula `AND (dismissed = 0 OR dismissed IS NULL)` para prevenir que el slider re-seleccione momentos descartados.
     - En `useMediaPipeline.ts`, derivar `selectedCandidates` y `selectedCount` filtrando estrictamente `candidate.selected && !candidate.dismissed`.
  3. **Solución a Condición de Carrera en Guardado de Trim y Contratos de Tipos (`CandidatePreviewModal.tsx`, `ModalContainer.tsx`, `useMediaPipeline.ts`):**
     - Definir la firma de `saveCandidateTrim` como `(startSec?: number, endSec?: number, candidateId?: string)` y tipar las interfaces de props a `(startSec?: number, endSec?: number) => Promise<void>`.
     - Invocar `await onSaveTrim(newStart, newEnd)` de forma síncrona en el modal, eliminando la dependencia del ciclo asíncrono de renderizado de React.
  4. **Resiliencia de Exportación, Rollback de Estado y Limpieza de Temporales (`python_backend/api.py`, `useMediaPipeline.ts`):**
     - En `render_flat_clip_for_candidate`, envolver la ejecución en `try...except...finally`: ante fallos de FFmpeg actualizar SQLite a `status="error"`, registrar en buffer de logs y propagar la excepción.
     - En el bloque `finally:`, eliminar de forma segura los archivos temporales intermedios (`*_cta.png`, `*.ass`) mediante `unlink(missing_ok=True)`, manteniendo intactos el video `.mp4` y el `.srt`.
     - En `cutCandidate`, re-lanzar `throw err` para que el modal capture el error y no se cierre prematuramente mediante `onClose()`. En `CandidatePanel.tsx`, agregar `.catch(() => {})` para mitigar advertencias de promesas no capturadas.
  5. **Diagnóstico Amigable ante LM Studio sin Modelo Cargado (`python_backend/llm.py`):**
     - Capturar respuestas HTTP 400 con `"no model"` o `"not loaded"` en `call_lmstudio` y `generate_social_copy_with_llm`, lanzando `ModelFatalError` con instrucción clara para el usuario.
  6. **Persistencia Continua de Archivo de Proyecto (`python_backend/api.py`):**
     - Invocar `sync_project_to_disk` tras exportar clips, actualizar trim o alternar el descarte de candidatos.
  7. **Antislop UI Integral en Modal de Previsualización (`CandidatePreviewModal.tsx`):**
     - Erradicar emojis decorativos en formatos, presets de estilo de subtítulos, animaciones y opciones de CTA.
- **Motivo:** Garantizar que los clips cortados en lote respeten rigurosamente los ajustes finos del creador, eliminar estados inconsistentes en base de datos y disco, proteger la experiencia de usuario ante fallos de red/render y ofrecer una interfaz sobria y profesional de grado NLE.

## D-031: Fix de Terminal en Portable (Subsystem 2 GUI) e Integración de OpenRouter (Free / Paid) con Macro-Chunks
- **Decisión:**
  1. **Fix Definitivo del Subsistema PE en Ejecutable Portable (`build_portable.py`):**
     - Restaurar `runw.exe` en el bootloader de PyInstaller con `Subsystem = 2` (`IMAGE_SUBSYSTEM_WINDOWS_GUI`).
     - Incorporar en `build_portable.py` la rutina `ensure_gui_subsystem` ejecutada en el Paso 2.5 antes de la compresión en `.tar.gz`, forzando `pe.OPTIONAL_HEADER.Subsystem = 2` de forma in-place para que Windows nunca más abra una consola CMD al iniciar `AutoShorts.exe`.
  2. **Integración de OpenRouter Cloud API sin Romper la Filosofía Local-First:**
     - Mantener la transcripción con **faster-whisper 100% local** sobre GPU CUDA / CPU INT8 (cero audio enviado a la nube, privacidad total y latencia cero).
     - Incorporar OpenRouter como motor de inferencia LLM alternativo y opcional en `python_backend/llm.py` y `api.py` para usuarios que carecen de hardware local para correr modelos 7B/14B en Ollama o LM Studio.
  3. **Protección de Cuota Diaria (50 reqs/día) y Rate Limits en OpenRouter Free:**
     - En modo Free con ventana de contexto de **16k tokens**, forzar `macro_compact_segments` y bloques de 15 minutos (`chunk_dur = 900.0s`), reduciendo las llamadas a la API a **2 o 3 peticiones por video** de 30-45 minutos (ahorro del 95% de la cuota).
     - Incorporar delay de 2.5s entre bloques analizados para prevenir el rate limit de ráfaga por minuto.
     - Implementar en `call_openrouter` reintentos defensivos con backoff ante HTTP 429 transitorios y un *Circuit Breaker* inmediato ante 401 (clave inválida), 402 (sin créditos) y 429 de cuota diaria agotada (50 peticiones alcanzadas), cortando el bucle sin reintentos inútiles.
     - Soportar modelos de razonamiento (CoT) saneando etiquetas `<think>` y extrayendo respuestas desde `message["reasoning"]` / `reasoning_content`.
  4. **Experiencia de Usuario Profesional Antislop en Frontend (`src/`):**
     - En `SettingsPanel.tsx`, desplegar selector de 3 motores (`repeat(3, 1fr)`) y subpanel dedicado para OpenRouter con campo de API Key con toggle de visibilidad (icono `Eye` / `EyeOff`), selector de modelo con presets rápidos (`openrouter/free`, `meta-llama/llama-3.3-70b-instruct:free`, `google/gemini-2.0-flash-exp:free`, `deepseek/deepseek-chat`), toggle Free vs Pago y selector de context window (16k vs 8k).
     - En `StyleModal.tsx` y `QuickCopyModal.tsx`, agregar soporte fluido a OpenRouter con indicador del modelo activo.
     - Corregir `canUseActiveLlm` en `useAppSettings.ts` para que dependa exclusivamente de la presencia de la clave configurada al seleccionar OpenRouter.
- **Motivo:** Garantizar que el software portable abra con una ventana de escritorio pura y limpia sin terminales parásitas en Windows, y brindar a los creadores flexibilidad para usar modelos gratuitos de OpenRouter sin saturar su cuota diaria.

## D-032: Release v2.9.0 — Empaquetado Portable ZIP Oficial, Actualización Exhaustiva de README, Macro-Chunks Dinámicos y Exportador de Logs
- **Decisión:**
  1. **Empaquetado Portable ZIP Oficial para Windows (`build_portable.py`):**
     - Incorporar la generación automática de `AutoShorts-v2.9.0-windows-x64-portable.zip` mediante `zipfile` con compresión `ZIP_DEFLATED, compresslevel=9`, forzando rutas internas en formato POSIX `/` (`arc_name.as_posix()`) para máxima compatibilidad con el explorador nativo de Windows.
     - Mantener la verificación in-place de la cabecera PE `ensure_gui_subsystem` (Subsystem = 2), abortar limpiamente si instancias abiertas bloquean la carpeta y excluir explícitamente archivos temporales (`.db`, `.log`, `.tmp`, `__pycache__`).
     - Generar checksum SHA-256 (`.zip.sha256`) garantizando un tamaño final inferior a 400 MB.
  2. **Macro-Chunks Adaptativos para OpenRouter en Videos Extensos (`python_backend/llm.py`):**
     - En grabaciones largas procesadas con OpenRouter en contexto de 16k tokens, escalar dinámicamente el tamaño de los bloques: 15 minutos para $\le 1$h, 20 minutos para $1-2$h y 25 minutos para $> 2$h (120+ min).
     - Preservar prioritariamente el tamaño mínimo de bloque para clips largos solicitados expresamente (mínimo 20 min para `10m` y 30 min para `15m`).
     - En directos de más de 2 horas (ej. 125 min), esto reduce las llamadas a la API de 9 a solo 5 peticiones, conservando el 90% de la cuota diaria de 50 peticiones/día en modo Free.
  3. **Exportador Integral de Logs con Diálogo Nativo de Windows (`python_backend/api.py`, `LogsModal.tsx`):**
     - En `api.py`, implementar `export_system_logs`: volcar el 100% de entradas en memoria de `log_buffer` a un archivo `.log` en UTF-8 y presentar el diálogo nativo `SAVE_DIALOG` de PyWebView (con fallback a `Downloads`).
     - En `LogsModal.tsx`, incorporar botón "Exportar" con feedback visual de guardado, banner con ruta del archivo y botón para abrir la carpeta contenedora en el explorador.
     - Blindar la copia al portapapeles mediante elemento fuera de pantalla ante pérdidas de foco en WebView2.
  4. **Bump de Versión a v2.9.0 y Documentación Integral (`version.py`, `package.json`, `README.md`):**
     - Fijar formalmente la versión semántica en `v2.9.0`.
     - Reestructurar y actualizar exhaustivamente `README.md` documentando OpenRouter (Free/Paid), cortes internos CapCut, controles de subtítulos y CTA, ejecución sin consolas y descarga directa del ZIP portable.
- **Motivo:** Entregar un paquete portable estándar en formato ZIP listo para su publicación en GitHub Releases, optimizar drásticamente el consumo de API en grabaciones extensas, resolver las fallas de exportación de registros del sistema y actualizar la documentación oficial a los estándares de la versión v2.9.0.

## D-033: Release v3.0.0 — Conversión Vertical con Downscale Blur y Split Gaming, Música de Fondo Drag & Drop y Calibración H.264 Level 5.1
- **Decisión:**
  1. **Filtro Cinemático Downscale Blur + Fast Bilinear Upscale (`python_backend/media.py`):**
     - Descartar el uso directo de `gblur` o `boxblur` a resolución completa 1080x1920 (el cual consumía el 95% de la CPU). Implementar la técnica de reducción previa a 180x320 con `boxblur=10:2` y reescalado bilineal a 1080x1920, logrando un desenfoque bokeh idéntico en tiempo real.
  2. **Modo Gaming Split con Sanitización de Paridad y Aspect Ratio:**
     - Permitir al usuario encuadrar la cámara y el gameplay en `CandidatePreviewModal.tsx`.
     - En backend, sanitizar todas las coordenadas con `trunc(val/2)*2` para evitar errores `height not divisible by 2` en `yuv420p` y preservar el aspect ratio de la facecam (`scale=1080:-2`).
  3. **Mezcla de Audio con BGM, Transición Cero y Limitador de Picos (`alimiter`):**
     - Desactivar la normalización automática destructiva de `amix` (`normalize=0`) para no atenuar la voz del creador a la mitad (-6 dB) y fijar `dropout_transition=0`.
     - Añadir `alimiter=limit=0.95:attack=5:release=50:asc=1` para evitar clipping digital cuando la voz y la música coinciden en amplitud máxima.
  4. **Control Avanzado de Bitrate y Framerate con Level Dinámico (30, 60 y 120 FPS):**
     - Extraer `bitRate` y `fps` en `probe_media`.
     - Elevar automáticamente a `-level:v 5.1` y buffer ampliado (`-maxrate 15M -bufsize 24M`) al exportar a 120 FPS para evitar violaciones de macrobloques en H.264. Mantener `-level:v 4.2` para $\le 60$ FPS.
     - Soportar codificación en 2 pases (VBR 2-Pass) con archivo temporal `-passlogfile`.
- **Motivo:** Permitir transformar cualquier gameplay horizontal en un video vertical profesional con cámara y fondo desenfocado sin penalización de CPU, añadir música de fondo sin arruinar el audio vocal y ofrecer exportación calibrada a estándares de nivel industrial.

## D-034: Normalización de Saltos CRLF en Launcher .BAT y Empaquetado Portable Oficial v3.0.0
- **Decisión:**
  1. **Conversión Estricta a CRLF en `AutoShorts.bat`:** Reemplazar los saltos Unix LF (`\n`) por saltos Windows CRLF (`\r\n`), eliminando la pérdida del primer byte por línea en `cmd.exe` (`etlocal`, `cho`, `et`) e incorporando la detección defensiva de `%LOCALAPPDATA%\Programs\Python\Python311\python.exe`.
  2. **Multiplataforma en `build_portable.py`:** Sustituir la invocación de `pnpm.cmd` por `node node_modules/vite/bin/vite.js build` y `pyinstaller` directo por `"{sys.executable}" -m PyInstaller`, garantizando que la compilación de la distribución onedir y los archivos comprimidos (`.zip` y `.tar.gz`) funcionen sin depender de variables de entorno volátiles en Windows.
- **Motivo:** Garantizar que el lanzador por lotes funcione con doble clic directo en el explorador de Windows y generar los binarios portables oficiales en `dist/` para la versión v3.0.0.

## D-035: Encuadre Interactivo Gaming con Mouse, Fondo Blur Integral, BGM en Vivo, Progreso y Cancelación Atómica
- **Decisión:**
  1. **Layout Gaming Split con Fondo Blur Integral (Lienzo 1080x1920):**
     - Estructurar el lienzo en 3 capas: Capa 0 con fondo desenfocado integral del mismo video (`scale=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear`), Capa 1 con Facecam (`scale=1080:{cam_h}:flags=lanczos`) en la parte superior (`cam_y`), y Capa 2 con Gameplay principal (`scale=1080:{game_h}:flags=lanczos`) centrado debajo de la cámara (`game_y`).
     - Aplicar paridad estricta (`make_even`) y clamping defensivo de coordenadas para eliminar artefactos de color en `yuv420p` y evitar fallos por desbordamiento de canvas en FFmpeg.
  2. **Encuadre Interactivo con Mouse en Frontend:**
     - Implementar en `CandidatePreviewModal.tsx` manipulación directa con mouse para Facecam y Gameplay, calculando las coordenadas reales mediante `getRenderedVideoRect` para compensar el letterboxing de `object-fit: contain`. Sincronizar bidireccionalmente con los campos numéricos de la interfaz.
  3. **Música de Fondo en Vivo y Offset Temporal (`bgm_start_sec`):**
     - Sincronizar un elemento `<audio>` con el `<video>` en el modal gestionando `onPlay`, `onPause`, `onWaiting` y `onSeeked`, con control de inicio de pista (`bgmStartSec`) y ajuste de volumen en tiempo real.
     - En FFmpeg, aplicar el offset dentro del filtergraph (`atrim=start={bgm_start_sec:.3f},asetpts=PTS-STARTPTS`) para preservar el bucle infinito `-stream_loop -1` sin saltos ni desincronización de PTS.
  4. **Monitoreo de Progreso en Vivo y Cancelación Atómica en Windows:**
     - Ejecutar FFmpeg con `subprocess.Popen` y `-progress pipe:1`. Drenar continuamente `stdout` para telemetría de porcentaje y `stderr` mediante hilo daemon para evitar bloqueos por buffers de pipe saturados en Windows. Ponderar el avance en 1 pase (0% a 99%) y 2 pases (Pase 1: 0-45%, Pase 2: 45-99%).
     - Proteger el subproceso con `threading.Lock()` e implementar `cancel_active_render()`: comprobar `proc.poll() is None`, invocar `taskkill /F /T /PID` y `proc.kill()`, y esperar salida antes de purgar archivos temporales, previniendo condiciones de carrera y reciclaje accidental de PIDs en Windows.
     - En frontend, escuchar el evento `render-progress` mostrando porcentaje en vivo y botón `Cancelar Exportación` con limpieza automática en `beforeunload`.
- **Motivo:** Brindar a los creadores una experiencia fluida e interactiva de reencuadre vertical idéntica a su flujo de trabajo real, con preescucha de música y control absoluto del renderizado sin bloqueos de sistema operativo.



## D-036: Composición Vertical 9:16 Flexible, Inyección de `-t` en Pase 1 y Tag BGM JSX en Tiempo Real
- **Decisión:**
  1. **Composición Flexible en Lienzo 9:16 (Facecam & Gameplay):**
     - Extender `CropRect` y `CutClipOptions` con `outHeight?: number; outY?: number;`.
     - Implementar sliders interactivos en `CandidatePreviewModal.tsx` para definir la altura de la cámara (`camOutHeight`: 180px - 720px) y del gameplay (`gameOutHeight`: 360px - 1400px), así como sus posiciones verticales `Y`.
     - Reflejar en tiempo real la composición en el Phone Stage con Facecam en primer plano (`zIndex: 4`) y Gameplay en capa inferior (`zIndex: 3`).
     - En el backend (`python_backend/media.py`), invertir el orden del filtergraph para superponer primero el gameplay sobre el fondo blur y luego la facecam al frente (`[vbg][vgame]` -> `[vtmp][vcam]`), impidiendo que el gameplay oculte la cámara. Implementar `make_even_coord` (`max(0, ...)`) para permitir `y = 0` exacto sin bordes negros de 2px.
  2. **BGM Nativo en JSX con Streaming y Preescucha:**
     - Insertar explícitamente el elemento `<audio ref={bgmAudioRef} ... loop />` en el JSX conectado a `http://127.0.0.1:1422/stream?file=...` con salvaguarda `onLoadedMetadata` antes de aplicar seek, control reactivo de volumen y botón "▶ Probar Música". Registrar tipos MIME de audio (`.mp3`, `.wav`, `.aac`, `.m4a`) en `stream_server.py`.
  3. **Solución Mortal al Cuelgue en 45% y Aceleración de VBR 2-Pass:**
     - Añadir obligatoriamente `"-t", dur_str` al comando `cmd_pass1` de FFmpeg en `media.py`, subsanando el defecto donde el Pase 1 codificaba hasta el final absoluto de videos de 2 a 4 horas.
     - Reemplazar el argumento `-` por `os.devnull` (`NUL` en Windows) para eliminar la colisión de descriptores con `-progress pipe:1`.
     - Optimizar el Pase 1 con `-preset veryfast` para acelerar el análisis estadístico a más del doble sin comprometer la calidad del Pase 2 (`-preset medium`).
     - Incorporar sleep defensivo (`time.sleep(0.01)`) en `_run_ffmpeg_monitored` para evitar busy-loops de CPU mientras el proceso finaliza I/O en disco.
- **Motivo:** Corregir el bloqueo del exportador en 2 pases, permitir a los creadores libertad total de encuadre en el video vertical final y hacer audible la música de fondo en tiempo real durante la edición del clip.

## D-037: Lienzo 9:16 Interactivo con Mouse, Sincronización Preset x264 2-Pass y Bridge BGM
- **Decisión:**
  1. **Interacción con Mouse en Lienzo Vertical 9:16 (Phone Stage):**
     - Dotar a las capas de Facecam y Gameplay de manipulación interactiva directa con el mouse en el Phone Stage (`CandidatePreviewModal.tsx`): desplazamiento vertical (`move`) y redimensión vertical mediante manija inferior derecha (`resize_br`).
     - Aislar eventos con `e.stopPropagation()` y `setPointerCapture` para impedir que hacer clic o arrastrar las capas pause la reproducción de video.
     - Implementar helpers de paridad en frontend (`makeEven`, `makeEvenCoord`) para asegurar múltiplos de 2 requeridos por FFmpeg y subsampling `yuv420p`. Sincronizar bidireccionalmente con los sliders numéricos.
  2. **Unificación de Preset en libx264 VBR 2-Pass (`python_backend/media.py`):**
     - Fijar idéntico preset `"-preset", "medium"` y `"-threads", "0"` tanto en `cmd_pass1` como en `cmd_pass2`.
     - Erradicar la disparidad interna de `--weightp` (1 en veryfast vs 2 en medium) que provocaba el fallo mortal en la apertura del encoder de x264 en el Pase 2 (`Generic error in an external library`, código -542398533).
  3. **Alias Universal de Compatibilidad en Logging (`python_backend/logger.py`):**
     - Definir `append = push` en `SystemLogBuffer`, eliminando las excepciones `AttributeError: 'SystemLogBuffer' object has no attribute 'append'` lanzadas desde `api.py` (L155, L161, L245) y preservando la categorización automática de niveles y formato de timestamps.
  4. **Drag & Drop de Audio BGM Resiliente y RPC de Persistencia (`api.py`, `CandidatePreviewModal.tsx`):**
     - Resolver la restricción de sandbox de Chromium / WebView2 en Windows (donde `(file as any).path` es `undefined`) generando `URL.createObjectURL(file)` en frontend para preescucha inmediata con 0ms de latencia en `<audio>`.
     - Implementar endpoint RPC `save_project_bgm(projectId, fileName, dataBase64)` en backend: decodificar base64, sanitizar contra path traversal y caracteres prohibidos en Windows, persistir en `{project_dir}/bgm/{filename}` y retornar la ruta absoluta verificada en disco para FFmpeg.
- **Motivo:** Brindar a los creadores control táctil/mouse en pantalla completa sobre el formato vertical 9:16, solucionar definitivamente el error fatal de codificación en dos pases con x264 y asegurar que la música arrastrada se reproduzca en vivo y se exporte con precisión física.

## D-038: Desacoplamiento de Grafos FFmpeg en 2 Pases y Composición 2D en Lienzo 9:16
- **Decisión:**
  1. **Desacoplamiento Estricto de Filtergraphs en Pase 1 (`python_backend/media.py`):**
     - Separar la construcción de filtros en `video_filter_parts` y `audio_filter_parts`.
     - En clips con multi-segmentos (`has_multi_segment`), bifurcar la concatenación en dos nodos independientes: `concat=n={N}:v=1:a=0[vjoined]` en video y `concat=n={N}:v=0:a=1[ajoined]` en audio.
     - En `cmd_pass1` (Pase 1 VBR), inyectar únicamente `video_fc` y excluir los demuxers de audio BGM (`-stream_loop -1 -i bgm_path`), erradicando por completo el fallo fatal de FFmpeg `Filter 'alimiter/concat:default' has output 1 unconnected`.
     - En `cmd_pass2` y Single Pass, aplicar `full_fc` con mapeo dinámico resiliente de `out_audio_map` (`[aout]`, `[ajoined]`, `0:a?` o `-an`).
  2. **Composición Bidimensional 2D en Lienzo 9:16 (Facecam & Gameplay):**
     - Extender `CropRect` en `src/types.ts` y backend con parámetros 2D completos: `outWidth`, `outHeight`, `outX`, `outY`.
     - En `media.py`, aplicar `scale={out_w}:{out_h}` y `overlay=x={out_x}:y={out_y}` para Facecam y Gameplay, permitiendo al creador achicar la cámara a cualquier dimensión deseada dejando ver el fondo difuminado cinematográfico alrededor.
     - En `CandidatePreviewModal.tsx`, implementar arrastre 2D (`move`) y redimensión 2D (`resize_br`) en el Phone Stage 9:16 con fórmulas matemáticas acotadas contra desbordamientos (`maxW = 1080 - initialX`, `maxH = 1920 - initialY`) y controles numéricos en la interfaz con auto-clamp y atajos de centrado horizontal.
- **Motivo:** Garantizar exportaciones exitosas al 100% en codificación en dos pases sin colisiones de pads de audio y otorgar libertad creativa total para diseñar layouts gamer profesionales estilo OBS/Premiere en formato vertical.

## D-039: Limpieza Integral Pre-Push v3.0 (Código Muerto, Estilos, CI Obsoleto y Residuos Locales)
- **Decisión:**
  1. **Retiro Definitivo de Legados Obsoletos:** Eliminar del índice Git el workflow roto de Rust/Tauri (`.github/workflows/release.yml`), `.env.example` (claves cloud retiradas en D-005), componentes huérfanos (`PipelineStep.tsx`, `StatusPill.tsx`) y `src/styles/autoedit.css` tras migrar `.view-mode-segmented` / `.view-mode-pill*` a `layout.css`.
  2. **Higiene Estricta Frontend y Backend:** Alcanzar cero errores en `tsc --noEmit --noUnusedLocals --noUnusedParameters` retirando props muertas (`selectedStyle`, `settingsNode`, `transcriptionEngine` en `SettingsPanel`/`TranscriptPanel`, `busy` en `useMediaPipeline`), selectores CSS huérfanos (`modals.css`, `layout.css`, `dashboard.css`, `panels.css` preservando `.icon-button`, `.onboarding-*` de `ModelDownloadModal`, `.summary-modal*` y `.style-modal`), imports/métodos muertos en `api.py`, `db.py` (sin tocar esquema `.db`), `llm.py` (`expand_short_candidate`, `clamp_candidate_duration`), `llm_prompts.py` (`locate_moment_active_window`), `media.py` (`extract_video_thumbnail`, `build_drawtext_filters`, `get_font_option`) y `project_service.py` (`open_media_file`, versionando `appVersion` con `__version__`).
  3. **Consolidación de Tests y Limpieza Local:** Promover la suite v3.0 completa (unitarios, integración, E2E FFmpeg sintético autocontenido y aserciones de higiene) a `tests/test_v30_regression.py` usando `tempfile.TemporaryDirectory()`, purgar residuos locales (`_internal/`, `MagicMock/`, `analizarrepos/`, `build/`, `.env`, `scratch/`), actualizar `.gitignore` y `README.md` a `v3.0.0`, y preservar `context/`, `data/` y `dist/` recompilado para `AutoShorts.bat`.
- **Motivo:** Dejar la rama `release-v3.0` limpia, auditada y lista para publicar sin artefactos rotos ni código muerto acumulado entre versiones.


