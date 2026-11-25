# Plan 39: Limpieza Profunda del Repositorio, Código Muerto y Residuos Locales (Pre-Push `release-v3.0`)

**Estado:** COMPLETADO (100% tests/build en verde + EGM Drift Report: No drift detected)  
**Diseño Técnico Definitivo:** `context/designs/39-limpieza-profunda-repo-y-codigo-muerto.md`  
**Reporte de Auditoría EGM:** `context/egm/goldfish_review_report.md`  
**Rama Actual:** `release-v3.0` (base `main` `5618215`)  
**Skills Aplicadas:** `senior-code-craft` (Clean Code, DRY, Production-Ready) y `antislop-code` (higiene estricta de comentarios)  
**Relación con Decisiones (`context/DECISIONS.md`):** Da continuidad y cierra por completo la purga arquitectónica de **D-002** (migración Rust/Tauri -> Python/PyWebView), **D-005** (purga de AutoEdit y pasarelas cloud Deepgram/Anthropic/DeepSeek/Groq), **D-006 / D-015** (estandarización en `pnpm`, retiro de `@tauri-apps` y `npm`), **D-007** (retiro de modal Onboarding), **D-029** (purga de dead props y unificación de `normalize_candidate_duration`) y **D-034 / D-038** (`AutoShorts.bat` + v3.0.0).

---

## 1. Diagnóstico (Solo Lectura — Evidencia Verificada)

Al inspeccionar el repositorio antes de subir la rama `release-v3.0`, se detectaron tres bloques de elementos sin uso o residuales:

1. **Archivos Rastreables en Git Obsoletos o Muertos:**
   - [`.github/workflows/release.yml`](file:///c:/Users/JEFF/Desktop/autoshorts/.github/workflows/release.yml): workflow heredado de CI que intenta instalar Rust, ejecutar `npm ci` (inexistente tras migrar a `pnpm`) y compilar con `tauri-apps/tauri-action@v0` (inexistente tras D-002/D-015). Si se sube y se etiqueta `v3.0.0`, fallará en GitHub Actions.
   - [`.env.example`](file:///c:/Users/JEFF/Desktop/autoshorts/.env.example) (y su copia local no rastreada `.env`): solo declaran `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY` y `GROQ_API_KEY`, todas purgadas en D-005 y nunca leídas en el código.
   - [`src/components/common/PipelineStep.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/common/PipelineStep.tsx) y [`src/components/common/StatusPill.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/common/StatusPill.tsx): componentes React con 0 referencias en todo `src/`.
   - [`src/styles/autoedit.css`](file:///c:/Users/JEFF/Desktop/autoshorts/src/styles/autoedit.css): hoja de estilos de 833 líneas del módulo eliminado `AutoEditWorkspace` (D-005). Solo 2 clases (`.view-mode-segmented` y `.view-mode-pill`) siguen usándose en [`WorkspaceHeader.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/panels/WorkspaceHeader.tsx); las otras ~69 clases están muertas.
   - [`vite.config.ts`](file:///c:/Users/JEFF/Desktop/autoshorts/vite.config.ts): conserva la regla obsoleta `ignored: ["**/src-tauri/**"]`.

2. **Código Muerto, CSS Huérfano, Imports y Props Sin Uso en Código Activo:**
   - **Frontend TypeScript/React (`tsc --noUnusedLocals --noUnusedParameters` detectó 20 errores):**
     - Imports muertos: `invoke` y `Loader2` en [`src/App.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/App.tsx); `Eye` en [`CandidatePreviewModal.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/modals/CandidatePreviewModal.tsx); `getOllamaTrafficLevel` en [`StyleModal.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/modals/StyleModal.tsx); `Clapperboard`, `Trash2` y `LlmMemoryStatus` en [`WorkspaceHeader.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/panels/WorkspaceHeader.tsx); imports por defecto `React` sin uso bajo `react-jsx` en `ModalContainer.tsx`, `SettingsPanel.tsx`, `SocialCopyModal.tsx`, `Sidebar.tsx` y `TranscriptPanel.tsx`.
     - Código y props muertas: `origFps` sin uso en `CandidatePreviewModal.tsx`; construcción duplicada e ignorada de `settingsNode` (40 líneas, L81-121 y L230) y `environment` hacia [`HomeDashboard.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/panels/HomeDashboard.tsx) en `App.tsx`; prop sin uso `transcriptionEngine` en [`TranscriptPanel.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/panels/TranscriptPanel.tsx); prop sin uso `selectedStyle` / `setSelectedStyle` en [`StyleModal.tsx`](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/modals/StyleModal.tsx) (siempre y cuando no rompa `create_project_from_path`, donde `captionStyle` queda como valor fijo por defecto en backend); desestructuración sin uso `busy` en [`useMediaPipeline.ts`](file:///c:/Users/JEFF/Desktop/autoshorts/src/hooks/useMediaPipeline.ts); exports internos innecesarios (`InternalSegment`, `ModalContainerProps`, `CutClipOptions`, `DEFAULT_MOMENTS_PROMPT` en `useAppSettings.ts` si no tiene consumidores externos).
   - **Hojas de Estilo CSS (`src/styles/`):**
     - [`src/styles/modals.css`](file:///c:/Users/JEFF/Desktop/autoshorts/src/styles/modals.css): ~89 selectores huérfanos de modales ya eliminados (`autoedit-*`, `onboarding-choices` / `choice-card` / `local-setup-flow` / `cloud-setup-flow` / `model-cards` / `form-stack` / `onboarding-actions`, `summary-stats-box` / `summary-stat-item`, `style-grid` / `style-card` / `preview-text-*` / `style-modal-actions` / `style-modal-header`). **Nota crítica:** deben preservarse `.onboarding-overlay`, `.onboarding-card`, `.onboarding-header`, `.download-*`, `.style-modal-overlay`, `.style-modal` y `.summary-modal*` porque siguen en uso en `ModelDownloadModal.tsx`, `StyleModal.tsx`, `SocialCopyModal.tsx`, `QuickCopyModal.tsx` y `LogsModal.tsx`.
     - [`src/styles/layout.css`](file:///c:/Users/JEFF/Desktop/autoshorts/src/styles/layout.css), [`dashboard.css`](file:///c:/Users/JEFF/Desktop/autoshorts/src/styles/dashboard.css) y [`panels.css`](file:///c:/Users/JEFF/Desktop/autoshorts/src/styles/panels.css): selectores huérfanos `.brand-mark`, `.settings-panel`, `.key-stack-horizontal`, `.pipeline-strip`, `.pipeline-step`, `.work-grid`, `.empty-workspace`, `.clip-control`, `.mock-video-inactive`, `.output-path`, `.portrait-preview-container`, `.portrait-preview-mock`.
   - **Backend Python (`python_backend/`):**
     - [`python_backend/api.py`](file:///c:/Users/JEFF/Desktop/autoshorts/python_backend/api.py): imports sin uso (`subprocess`, `threading`, `extract_video_thumbnail`, `build_drawtext_filters`, `PROJECT_FILE_NAME`) y métodos RPC sin consumidores en frontend ni tests (`update_project_workflow_goal`, `probe_project`, `extract_project_audio`, `save_demo_transcript`, `get_whisper_models`, `install_ollama`, `open_media_file`).
     - [`python_backend/db.py`](file:///c:/Users/JEFF/Desktop/autoshorts/python_backend/db.py): métodos CRUD muertos de AutoEdit (`save_autoedit`, `get_autoedit`, `list_autoedits`, `delete_autoedit`, `update_autoedit_copy`, L581-666) y `update_project_workflow_goal` si ya no tiene callers. Se mantiene `CREATE TABLE IF NOT EXISTS autoedits` para compatibilidad retroactiva de archivos `.db` antiguos.
     - [`python_backend/llm.py`](file:///c:/Users/JEFF/Desktop/autoshorts/python_backend/llm.py): import sin uso `locate_moment_active_window` y wrappers de legado `expand_short_candidate` y `clamp_candidate_duration` (unificados en `normalize_candidate_duration` desde D-029).
     - [`python_backend/stream_server.py`](file:///c:/Users/JEFF/Desktop/autoshorts/python_backend/stream_server.py): `from pathlib import Path` sin uso.
     - [`python_backend/transcription.py`](file:///c:/Users/JEFF/Desktop/autoshorts/python_backend/transcription.py): `import json` sin uso.

3. **Basura Local / Residuos en el Árbol de Trabajo y `.gitignore`:**
   - `_internal/` en la raíz (95 entradas, 0.84 MB): resto accidental de una compilación PyInstaller en raíz, y **no está en `.gitignore`**.
   - `MagicMock/` en la raíz (47 entradas, 1.38 MB, bases de datos dummy en `MagicMock/mock/<id>/autoshorts.db`): creado por tests antiguos en `scratch/` que mocaron `Path` sin directorio temporal.
   - `analizarrepos/` (carpeta vacía en raíz).
   - `build/` (36.64 MB de caché intermedia de PyInstaller) y `__pycache__/` sueltos.
   - `.env` local (mismas claves cloud muertas que `.env.example`).
   - `scratch/` (109 entradas): scripts descartables de parches únicos (`append_d017.py`, `append_d018.py`, `apply_plan15_fixes.py`, `audit_dependencies.py`, `convert_icon.py`, `debug_render.py`, `fix_bat.py`, `generate_minimalist_logo.py`, `inspect_v2.py`, `inspect_v2_y.py`, `process_v2_logo.py`, `sanitize_prints.py`, `update_*.py`), imágenes temporales (`scales_preview.png`, `test_minimalist_logo.png`) y 48 tests históricos. Se promoverá a `tests/` la cobertura vigente de v3.0 (sin fugas a `MagicMock/`) y se limpiará `scratch/`.
   - `.gitignore`: actualizar para ignorar `_internal/` y retirar entradas heredadas obsoletas (`target`, `src-tauri/target`, `build_tmp/`, `release/`, `repo-supoclip/`).
   - **Carpetas protegidas (NO se eliminan):** `context/` (memoria y planes del proyecto obligatorios por protocolo), `data/` (base de datos y proyectos reales del usuario) y `dist/` (bundle compilado de Vite necesario para que `AutoShorts.bat` arranque al instante; se regenerará limpio al final del paso a paso).

---

## 2. Alcance

- **Eliminar (archivos/carpetas rastreados):**
  - `.github/workflows/release.yml` (y carpeta `.github/` si queda vacía)
  - `.env.example`
  - `src/components/common/PipelineStep.tsx`
  - `src/components/common/StatusPill.tsx`
  - `src/styles/autoedit.css` (migrando `.view-mode-segmented` y `.view-mode-pill` a `src/styles/layout.css`)
- **Eliminar (residuos locales no rastreados):**
  - `_internal/`, `MagicMock/`, `analizarrepos/`, `build/`, `.env`, `__pycache__/`, y contenido residual de `scratch/`.
- **Modificar (limpieza de código muerto, CSS huérfano e higiene):**
  - `.gitignore`
  - `vite.config.ts`
  - `src/styles.css`, `src/styles/layout.css`, `src/styles/dashboard.css`, `src/styles/panels.css`, `src/styles/modals.css`
  - `src/App.tsx`, `src/components/panels/HomeDashboard.tsx`, `src/components/panels/Sidebar.tsx`, `src/components/panels/TranscriptPanel.tsx`, `src/components/panels/WorkspaceHeader.tsx`
  - `src/components/modals/CandidatePreviewModal.tsx`, `src/components/modals/ModalContainer.tsx`, `src/components/modals/SettingsPanel.tsx`, `src/components/modals/SocialCopyModal.tsx`, `src/components/modals/StyleModal.tsx`
  - `src/hooks/useMediaPipeline.ts`, `src/hooks/useAppSettings.ts`, `src/hooks/useProjectActions.ts` (solo si aplica al limpiar props muertas sin alterar `captionStyle` persistido en backend)
  - `python_backend/api.py`, `python_backend/db.py`, `python_backend/llm.py`, `python_backend/stream_server.py`, `python_backend/transcription.py`
  - `tests/`: incorporar suite consolidada de regresión v3.0 (`tests/test_v30_regression.py` unitaria, integración y E2E autocontenido) asegurando que ningún test escriba en `MagicMock/` ni fuera de `tempfile.TemporaryDirectory()`.

---

## 3. Paso a Paso Técnico

1. **Tests primero (Estrategia TDD — Punto 6.A):**
   - Consolidar en `tests/test_v30_regression.py` las validaciones críticas de v3.0 actualmente dispersas en `scratch/test_plan33..38` (incluyendo separación de filtergraphs FFmpeg en Pase 1/Pase 2, composición 2D `gaming_split`, cotas 1080x1920, `SystemLogBuffer.append`, E2E sintético autocontenido y verificación estática de higiene que confirme ausencia de componentes muertos y archivos legacy), garantizando el uso estricto de `tempfile.TemporaryDirectory()` (cero escritura en raíz / `MagicMock/`).
2. **Limpieza CSS e iconos/estilos en Frontend:**
   - Mover `.view-mode-segmented`, `.view-mode-pill` y variantes a `src/styles/layout.css`.
   - Eliminar `@import './styles/autoedit.css';` de `src/styles.css` y borrar `src/styles/autoedit.css`.
   - Purgar selectores muertos en `layout.css`, `dashboard.css`, `panels.css` y `modals.css` preservando íntegramente las clases usadas por `ModelDownloadModal`, `StyleModal`, `SocialCopyModal`, `QuickCopyModal` y `LogsModal`.
3. **Limpieza de Componentes React, Props y TypeScript (`src/`):**
   - Eliminar `PipelineStep.tsx` y `StatusPill.tsx`.
   - Limpiar todos los imports, variables, parámetros y props muertas (`settingsNode` duplicado en `App.tsx`, `Eye`/`origFps` en `CandidatePreviewModal.tsx`, `getOllamaTrafficLevel`, etc.) hasta que `tsc --noEmit --noUnusedLocals --noUnusedParameters` pase con 0 errores.
   - Limpiar `watch.ignored` de `src-tauri` en `vite.config.ts`.
4. **Limpieza Backend Python (`python_backend/`):**
   - Retirar imports muertos en `api.py`, `llm.py`, `stream_server.py` y `transcription.py` (manteniendo o importando `DEFAULT_MOMENTS_PROMPT` directamente desde `llm_prompts` en `api.py`).
   - Retirar métodos muertos en `db.py` (`save_autoedit`, `get_autoedit`, `list_autoedits`, `delete_autoedit`, `update_autoedit_copy`) y RPCs sin uso en `api.py` (`probe_project`, `extract_project_audio`, `save_demo_transcript`, `get_whisper_models`, `install_ollama`, `open_media_file`, `update_project_workflow_goal`), además de los wrappers muertos `expand_short_candidate` y `clamp_candidate_duration` en `llm.py`.
   - Revisar higiene de comentarios (`antislop-code`) en los bloques intervenidos sin alterar lógica funcional.
5. **Limpieza de Configuración, CI y Residuos Locales:**
   - Eliminar `.github/workflows/release.yml`, `.env.example`, `.env`, `_internal/`, `MagicMock/`, `analizarrepos/`, `build/`, `__pycache__/` y contenido residual de `scratch/`.
   - Actualizar `.gitignore` añadiendo `_internal/` y eliminando reglas legacy obsoletas (`target`, `src-tauri/target`, `build_tmp/`, `release/`, `repo-supoclip/`).
6. **Validación Final (100% en verde + Rebuild de `dist/`):**
   - Ejecutar `tsc --noEmit --noUnusedLocals --noUnusedParameters`.
   - Ejecutar `node node_modules/vite/bin/vite.js build` para dejar `dist/` limpio y listo para `AutoShorts.bat`.
   - Ejecutar `python -m unittest discover -s tests -p "test_*.py" -v` (unitarios, integración y E2E).
   - Revisar `git status` final para confirmar repositorio limpio antes de que el usuario haga commit/push de `release-v3.0`.

---

## 4. Riesgos e Implicaciones

- **Riesgo CSS en `WorkspaceHeader.tsx` y Modales:** Borrar `autoedit.css` sin reubicar `.view-mode-segmented` / `.view-mode-pill` rompería el selector de pestaña "Transcripción / Clips y Momentos"; eliminar `.onboarding-overlay` o `.onboarding-card` de `modals.css` rompería `ModelDownloadModal.tsx`. Mitigado mediante preservación explícita y verificación visual/DOM en build.
- **Riesgo de Import Circular o Re-export en Python:** En `api.py`, `DEFAULT_MOMENTS_PROMPT` se importa desde `.llm`. Al limpiar `llm.py`, se importará directamente desde `.llm_prompts` en `api.py` (o se mantendrá explícito) y se ejecutará import check + suite completa.
- **Compatibilidad de Base de Datos Existente (`data/autoshorts.db`):** No se ejecutará `DROP TABLE autoedits` sobre bases existentes; solo se retiran los métodos Python muertos en `db.py`, evitando cualquier riesgo de pérdida o migración forzada en `data/`.
- **Uso de `AutoShorts.bat`:** Se preserva `dist/` (actualizado con `vite build`) y `data/` para que el usuario siga abriendo la app normalmente con `AutoShorts.bat` sin empaquetado ZIP.

---

## 5. Estrategia de Testing

- **Verificación Estática TypeScript + Build:**
  - `node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters` (0 errores).
  - `node node_modules/vite/bin/vite.js build` (bundle limpio en `dist/`).
- **Tests Unitarios e Integración (`tests/`):**
  - `python -m unittest discover -s tests -p "test_*.py" -v`
  - Validación de carga de todos los módulos `python_backend` (`api`, `db`, `llm`, `media`, `stream_server`, `telemetry`, `transcription`), pruebas unitarias de subtítulos ASS, renderizado de parámetros 2D / VBR 2-Pass y limpieza de archivos residuales (confirmando que ningún test deja `MagicMock/` en disco).
- **Validación E2E:**
  - Ejecución del flujo backend/FFmpeg disponible en `tests/test_render_subtitles_and_cta_hardware_e2e.py` (y smoke test del entrypoint `run.py` / importación completa sin ventanas ni errores de módulo faltante).

---

## 6. 🚦 Recomendación EGM (Semáforo de Complejidad y Tokens)

🟢 **Tarea Pequeña / Acotada (No requiere EGM):**  
Se trata de una limpieza directa de archivos obsoletos, código muerto, selectores CSS huérfanos, imports/variables sin uso y carpetas residuales locales ya verificadas mediante análisis estático de referencias cruzadas, AST en Python y compilador TypeScript (`tsc --noUnusedLocals --noUnusedParameters`). No modifica arquitectura, concurrencia, persistencia ni flujos críticos nuevos, por lo que lanzar subagentes Goldfish consumiría tokens innecesariamente.

**Recomendación:** Responder **`PLAN APROBADO`** para ejecutar primero los tests, aplicar la limpieza completa y verificar el 100% en verde.
