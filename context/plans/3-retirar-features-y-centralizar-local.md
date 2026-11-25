# Plan de Acción 3: Especialización en Clips, Purga de Funcionalidades No Deseadas y Centralización 100% Local

## 1. Diagnóstico

El usuario ha determinado una visión clara y precisa para AutoShorts:
- **Especialización exclusiva en Clips:** El software se enfocará al 100% en la detección, edición, estilizado y exportación de clips verticales de alto impacto (Shorts, TikToks, Reels). Las funciones de compilación larga y autoedición para YouTube generan complejidad visual y código residual que no aporta al flujo diario de trabajo.
- **Retiro de Importador de YouTube:** La entrada de video será exclusivamente de archivos locales de grabación, por lo que el módulo de descarga con `yt-dlp` y verificación de derechos resulta innecesario.
- **Estandarización en Faster-Whisper:** Se retira la librería lenta original de `openai-whisper` y se elimina la API de pago `Deepgram`. La transcripción queda estandarizada en `faster-whisper` (CTranslate2, CUDA FP16 / CPU INT8).
- **Inferencia LLM 100% Local (Zero API Cost):** Se retiran todos los conectores Cloud (OpenRouter, DeepSeek, Claude, Gemini, OpenAI, Groq) debido a latencia y costes. El sistema operará únicamente con **Ollama** y **LM Studio** en local.
- **Corrección de Bug en Batch:** En `AutoShorts.bat`, la línea `echo [>]` utilizó el operador de redirección `>`, generando accidentalmente un archivo en disco llamado `]`. Se corregirá el script y se eliminará el archivo residual.

---

## 2. Alcance

### Archivos y carpetas a eliminar
1. `]` (archivo residual generado por el bug de redirección en batch).
2. `src/components/modals/YouTubeImportModal.tsx`.
3. `python_backend/services/youtube_service.py`.
4. `src/components/panels/autoedit/` (carpeta completa: `AutoEditWorkspace.tsx`, `AutoEditConfigPanel.tsx`, `AutoEditGalleryPanel.tsx`).
5. `src/components/modals/AutoEditModal.tsx`.
6. `src/components/modals/SummaryModal.tsx`.
7. `src/hooks/useAutoEditState.ts`.
8. `python_backend/services/autoedit_service.py`.

### Archivos a modificar
1. **Lanzador:**
   - `AutoShorts.bat`: Cambiar `echo [>]` por `echo [*] Lanzando AutoShorts...`.
2. **Dependencias y Backend:**
   - `requirements.txt`: Retirar `yt-dlp` y `openai-whisper`, asegurar `faster-whisper>=1.0.0`.
   - `python_backend/transcription.py`: Dejar exclusivamente `faster-whisper` local con VAD y gamer prompt. Retirar `transcribe_deepgram` e importaciones de OpenAI `whisper`.
   - `python_backend/llm.py`: Limpiar proveedores Cloud (`robust_cloud_post`, DeepSeek, Claude, Gemini, OpenRouter, etc.). Conservar únicamente Ollama y LM Studio.
   - `python_backend/media.py`: Retirar métodos no utilizados de autoedición larga (`render_autoedit_video`, `render_compilation_video`, `detect_dead_air_silences`).
   - `python_backend/api.py`: Retirar comandos y endpoints de YouTube, AutoEdit, Deepgram y Cloud LLMs.
3. **Frontend (React 19 + TypeScript):**
   - `src/types.ts`: Limpiar tipos (`TranscriptionEngine` a solo faster-whisper, `LlmEngine` a solo local/ollama/lmstudio, eliminar tipos de AutoEdit).
   - `src/hooks/useAppSettings.ts`: Retirar estados y persistencia de claves cloud (Deepgram, OpenRouter, DeepSeek, Claude, etc.).
   - `src/hooks/useMediaPipeline.ts`: Retirar parámetros cloud.
   - `src/components/panels/HomeDashboard.tsx`: Retirar botón de importación desde YouTube.
   - `src/components/panels/Sidebar.tsx` y `WorkspaceHeader.tsx`: Retirar pestañas o conmutadores de AutoEdit/Moments.
   - `src/components/modals/ModalContainer.tsx`: Retirar imports y renderizado de `YouTubeImportModal`, `AutoEditModal` y `SummaryModal`.
   - `src/components/modals/SettingsPanel.tsx`, `StyleModal.tsx`, `QuickCopyModal.tsx`, `OnboardingModal.tsx`: Limpiar campos de API keys cloud y dejar únicamente configuración local de Ollama, LM Studio y faster-whisper.
   - `src/App.tsx`: Retirar importaciones de `useAutoEditState` y `AutoEditWorkspace`.
4. **Documentación y Registro:**
   - `README.md`: Actualizar arquitectura y eliminar referencias a YouTube download, AutoEdit, Deepgram y Cloud LLMs.
   - `DECISIONS.md`: Registrar la decisión de simplificación arquitectónica.

---

## 3. Paso a Paso Técnico

1. **Corrección de Batch y Borrado de Archivo Residual**:
   - Eliminar el archivo `]` de la raíz.
   - Editar `AutoShorts.bat` para sustituir `echo [>]` por `echo [*] Lanzando AutoShorts...`.

2. **Refactorización del Backend (Python)**:
   - Eliminar `python_backend/services/youtube_service.py` y `python_backend/services/autoedit_service.py`.
   - Modificar `requirements.txt` retirando `yt-dlp` y `openai-whisper`.
   - Limpiar `python_backend/transcription.py` para operar directamente con `faster-whisper`.
   - Limpiar `python_backend/llm.py` para responder únicamente a Ollama y LM Studio.
   - Limpiar `python_backend/media.py` y `python_backend/api.py` removiendo handlers obsoletos.

3. **Refactorización del Frontend (React + TypeScript)**:
   - Eliminar los archivos de componentes y hooks de AutoEdit y YouTubeImport.
   - Actualizar `src/types.ts` con definiciones limpias.
   - Modificar `useAppSettings.ts`, `useMediaPipeline.ts`, `ModalContainer.tsx`, `App.tsx`, `HomeDashboard.tsx`, `SettingsPanel.tsx`, `StyleModal.tsx`, `QuickCopyModal.tsx`, `OnboardingModal.tsx`.
   - Ejecutar `pnpm run build` para validar que la compilación de TypeScript no tenga errores ni imports rotos.

4. **Actualización de Documentación**:
   - Ajustar `README.md` y registrar en `DECISIONS.md`.

---

## 4. Riesgos e Implicaciones

| Riesgo / Implicación | Impacto | Mitigación |
| :--- | :--- | :--- |
| **Errores de compilación en TypeScript por imports rotos** | Medio | Se ejecutará una validación estricta de compilación (`tsc && vite build`) inmediatamente después de los cambios en el frontend. |
| **Registros históricos en la base de datos SQLite** | Bajo | La tabla de proyectos y transcripciones no se altera; los proyectos existentes seguirán abriéndose y procesando clips sin interrupción. |
| **Dependencia de faster-whisper** | Bajo | Se mantiene la detección de modelos descargados y compatibilidad automática con CUDA y CPU. |
