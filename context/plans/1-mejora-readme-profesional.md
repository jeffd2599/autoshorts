# Plan de Acción 1: Auditoría Técnica y Elaboración de README Profesional de Primer Nivel

## 1. Diagnóstico

AutoShorts es una aplicación de escritorio integral para streamers, podcasters y editores de video. Permite transformar transmisiones de larga duración (de 1 a más de 4 horas en Twitch, Kick o YouTube) y podcasts en dos tipos de productos:
1. **Clips verticales (9:16 Shorts, TikToks, Reels)** con subtítulos dinámicos animados (estilo karaoke TikTok), detección acústica de momentos de acción (RMS en silencios), hooks virales y generación de copies sociales.
2. **Autoedición y resúmenes para YouTube (16:9 o 9:16)** de 1 a 30 minutos, estructurados narrativamente por IA, con eliminación de pausas incómodas (dead-air), teaser inicial, generación de capítulos con marcas de tiempo y miniaturas en alta definición.

### Estado Actual del README
El archivo `README.md` existente describe varias características, pero presenta limitaciones importantes:
- Carece de un diagrama de arquitectura claro que explique el puente entre React 19, PyWebView, Python RPC, SQLite, FFmpeg y los motores de IA.
- Omite detalles técnicos clave implementados en el código: soporte para `faster-whisper` (CTranslate2 con FP16/INT8), presets avanzados de subtítulos (`loud-viral`, `arcade-retro`, `cyber-terminal`, `clean-editorial`), badges animados de CTA, el pipeline de compilación para Windows con PyInstaller (`build_exe.py` y `AutoShorts.vbs`), y la suite de autoedición con eliminación de silencios muertos.
- No cuenta con una guía completa de variables de entorno (`.env.example`) ni de optimización de hardware según la GPU instalada.
- Su redacción contiene fórmulas y patrones que pueden depurarse aplicando las directrices de `antislop-copywriting` (cero guiones largos em dash, sin palabras vacías ni claims inflados, con especificaciones técnicas rigurosas y verificables).

---

## 2. Alcance

### Archivos a modificar
- `README.md`: Reescritura integral del documento para convertirlo en un README de nivel enterprise / open-source premium, bilingüe o en español técnico de alta fidelidad, con diagramas Mermaid, tablas de referencia, instrucciones de instalación exactas, flujos de trabajo detallados y solución de problemas.

### Archivos a crear
- `plans/1-mejora-readme-profesional.md`: Este documento de planificación y diagnóstico estructurado.
- `DECISIONS.md`: Registro conciso de decisiones de arquitectura y documentación técnica según el protocolo del usuario.

### Archivos a consultar (solo lectura)
- `python_backend/api.py`, `python_backend/media.py`, `python_backend/llm.py`, `python_backend/transcription.py`, `python_backend/telemetry.py`.
- `src/App.tsx`, `src/types.ts`, componentes de modals y panels.
- `build_exe.py`, `AutoShorts.spec`, `AutoShorts.vbs`, `.env.example`, `package.json`, `requirements.txt`.

---

## 3. Paso a Paso Técnico

1. **Estructuración y Redacción de `DECISIONS.md`**:
   - Documentar la estructura técnica seleccionada para la documentación, el diagrama de arquitectura y la política de estilos de subtítulos y modelos de IA soportados.

2. **Diseño de la Arquitectura Visual (Mermaid)**:
   - Crear un diagrama de flujo y componentes que muestre con precisión:
     - Frontend (React 19 + TypeScript + Vite + CSS Dark Mode).
     - Capa de Puente Nativo (PyWebView + JS API bridge).
     - Servidor de Streaming Local (HTTP Range en puerto 1422).
     - Motores de Inferencia Local y Cloud (faster-whisper / Whisper / Deepgram, Ollama / LM Studio / OpenRouter / Claude / DeepSeek / Gemini / OpenAI / Groq).
     - Procesamiento Multimedia (FFmpeg / FFprobe, análisis acústico RMS, generador de subtítulos ASS, detector de pausas muertas).
     - Capa de Persistencia (SQLite3 embebido).

3. **Desarrollo de Secciones del README Profesional**:
   - **Encabezado y Badges Reales**: Tecnologías verificadas en el repositorio (Python 3.11, React 19, TypeScript 5.7, Vite 6, PyWebView 5, PyTorch CUDA, FFmpeg, faster-whisper, Licencia MIT).
   - **Propuesta de Valor y Casos de Uso**: Explicación clara sin jerga vacía sobre cómo resolver el flujo de stream a clip/resumen.
   - **Matriz de Funcionalidades**:
     - *Detección de Momentos*: Chunking con solapamiento de 30s, análisis RMS acústico en milisegundos, modos por tipo de contenido (Gaming, Tutorial, Charla/Podcast, General).
     - *Estudio de Subtítulos y Estilos*: Tabla con los 6 presets (`tiktok-karaoke`, `loud-viral`, `arcade-retro`, `cyber-terminal`, `clean-editorial`, `modern-box`), soporte de timing por palabra, modo 1 o 2 líneas, badges animados de llamada a la acción (CTA).
     - *Autoedición para YouTube*: Ensamblado narrativo de 1 a 30 minutos, 3 vibes (`balanced`, `tryhard`, `fails`), recorte de silencios muertos (`detect_dead_air_silences`), teaser gancho de entrada, generación automática de capítulos y miniaturas HD.
     - *Soporte Multi-LLM y Gestión de VRAM*: Ollama y LM Studio con auto-detección y descarga instantánea de VRAM (`keep_alive: 0`), además de proveedores cloud con reintentos exponenciales contra rate-limits.
     - *Quick Copy y Transcripción*: Subida directa de subtítulos (`.srt`, `.vtt`, `.txt`) con limpieza automática de timestamps y etiquetas.
     - *Importador de YouTube*: Integración directa con yt-dlp y análisis preventivo de licencias Creative Commons vs estándar.
     - *Telemetría de Hardware*: Muestreador continuo de CPU (GetSystemTimes Win32) y GPU/VRAM (nvidia-smi y PyTorch).
   - **Requisitos de Sistema y Matriz de Compatibilidad**: Tabla con versiones mínimas y recomendadas para CPU, GPU NVIDIA CUDA, Node.js y FFmpeg.
   - **Guía de Instalación Rápida Paso a Paso**: Comandos reproducibles para PowerShell (Windows) y Bash (Linux/macOS), incluyendo la instalación de PyTorch con CUDA 12.1 y dependencias de Node.js.
   - **Modos de Ejecución**:
     - Producción / Uso habitual (`python run.py` o doble clic en `AutoShorts.vbs`).
     - Modo Desarrollo (`pnpm run dev` + `python run.py`).
     - Compilación a binario ejecutable `.exe` (`python build_exe.py`).
   - **Referencia de Configuración y Variables de Entorno**: Tabla detallada con todas las claves soportadas en `.env` y configuración interna en `~/.autoshorts/config.json`.
   - **Estructura Detallada del Repositorio**: Árbol de carpetas anotado con el propósito de cada módulo.
   - **Preguntas Frecuentes y Solución de Problemas**: Fallos comunes de FFmpeg en PATH, compatibilidad CUDA, conexión con Ollama/LM Studio y resolución de rutas de video no encontradas.

4. **Auditoría de Calidad y Filtro Anti-Slop**:
   - Verificar que no existan guiones largos em dash (`—`).
   - Verificar que no haya palabras vacías ni adjetivos inflados.
   - Confirmar que cada dato, ruta y comando coincida exactamente con los archivos del código fuente.

---

## 4. Riesgos e Implicaciones

| Riesgo / Implicación | Impacto | Mitigación |
| :--- | :--- | :--- |
| **Pérdida de enlaces o referencias útiles del README anterior** | Bajo | Se conservarán y actualizarán todos los enlaces a licencias, créditos del fork original y comandos de instalación válidos. |
| **Discrepancia entre la documentación y el código real** | Medio | Cada función y opción descrita en el README se valida contra su implementación en `python_backend/` y `src/`. |
| **Sintaxis de Mermaid en GitHub** | Bajo | Los nodos y etiquetas contendrán comillas dobles y caracteres limpios para evitar errores de renderizado en navegadores y plataformas Git. |
