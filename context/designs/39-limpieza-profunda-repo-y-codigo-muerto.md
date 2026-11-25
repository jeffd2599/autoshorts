# Diseño Técnico Definitivo (Plan 39): Limpieza Profunda del Repositorio, Código Muerto y Residuos Locales

**Plan Asociado:** `context/plans/39-limpieza-profunda-repo-y-codigo-muerto.md`  
**Reporte de Auditoría:** `context/egm/goldfish_review_report.md`  
**Estado:** APROBADO TRAS AUDITORÍA EGM GOLDFISH  
**Fecha:** 2026-11-24

---

## 1. Matriz de Control Git y Working Tree (Prohibido `git reset` / `git clean`)

| Categoría | Elementos Exactos | Acción Autorizada |
| :--- | :--- | :--- |
| **Staging ya existente a preservar** | `git mv DECISIONS.md -> context/DECISIONS.md`, `git mv plans/1..32 -> context/plans/*` | **NO revertir.** Mantener intacto en índice Git. |
| **Memoria del proyecto (`context/`)** | `context/DECISIONS.md`, `context/plans/*`, `context/designs/*`, `context/egm/*` | **Preservar y actualizar** (`D-039`, Plan 39, Diseño 39, Reportes EGM). |
| **Archivos rastreados a eliminar (`git rm`)** | `.github/workflows/release.yml`, `.env.example`, `src/components/common/PipelineStep.tsx`, `src/components/common/StatusPill.tsx`, `src/styles/autoedit.css` | **Eliminar del disco e índice Git** (`.github/` si queda vacío). |
| **Residuos locales NO rastreados a borrar** | `_internal/`, `MagicMock/`, `analizarrepos/`, `build/`, `.env`, `**/__pycache__/`, y contenido dentro de `scratch/` (eliminando scripts/PNGs/tests obsoletos; carpeta vacía o borrada) | **Eliminar solo del disco local** tras consolidar `tests/test_v30_regression.py`. |
| **Activos e infraestructura protegidos** | `data/`, `node_modules/`, `public/` (`favicon.ico`, `icon.png`), `icon.ico`, `icon.png`, `tests/*`, `AutoShorts.bat`, `AutoShorts.spec`, `run.py`, `build_portable.py` | **Preservar.** Reconstruir `dist/` limpio vía `vite build` para que `AutoShorts.bat` arranque directo por `:1422`. |

---

## 2. Orden de Ejecución Obligatorio (Fases 1 a 6)

### Fase 1: Suite TDD Unificada en `tests/test_v30_regression.py` (Tests Primero — Red Gate)
Crear `tests/test_v30_regression.py` usando exclusivamente `tempfile.TemporaryDirectory()` (cero rutas relativas ni creación de `MagicMock/` en raíz) con 4 bloques obligatorios:
1. **Unitarios:** `make_even`, `make_even_coord`, `SystemLogBuffer.append`, `normalize_candidate_duration`, desacoplamiento de filtergraphs en `render_flat_clip` (`video_filter_parts` vs `audio_filter_parts`, `cmd_pass1` sin nodos de audio ni BGM, multi-segment `concat=v=1:a=0` y `v=0:a=1`) y composición 2D `gaming_split` (`scale={cam_out_w}:{cam_out_h}`, `overlay=x={cam_out_x}:y={cam_out_y}`, mocando `subprocess.Popen` y `probe_media`).
2. **Integración:** `Api.save_project_bgm` (sanitización contra path traversal y caracteres reservados en Windows), más `Api` + `Database` + `project_service.sync_project_to_disk` / `restore_project_from_disk` verificando `appVersion == __version__` dentro de directorio temporal.
3. **E2E Autocontenido (Sin dependencias externas en disco):** Generar con `ffmpeg` un MP4 sintético de 3s (`testsrc` + `sine`) en `TemporaryDirectory()`, generar subtítulos `.ass` + badge CTA `.png` y ejecutar `render_flat_clip` real (layout `gaming_split` 2D y/o `two_pass=True`), validando con `probe_media` que el `.mp4` resultante existe con streams válidos de video/audio.
4. **Aserciones Estáticas de Higiene + Guard `MagicMock/`:**
   - Verificar que no existen `.github/workflows/release.yml`, `.env.example`, `PipelineStep.tsx`, `StatusPill.tsx`, `src/styles/autoedit.css`, `_internal/`, ni `MagicMock/`.
   - Verificar que `src/styles/layout.css` contiene `.view-mode-segmented` y `.view-mode-pill`, y que `api.py`, `db.py`, `llm.py` y `llm_prompts.py` no contienen los símbolos muertos eliminados.

Ejecutar `python -m unittest discover -s tests -p "test_*.py" -v` (verificando fallo controlado inicial en las aserciones estáticas de limpieza).

---

### Fase 2: Migración y Limpieza CSS Segura (`src/styles/`)
1. **`src/styles/layout.css`:**
   - Copiar **literalmente las líneas 1-38** de `src/styles/autoedit.css` (`.view-mode-segmented`, `.view-mode-pill`, `.view-mode-pill:hover`, `.view-mode-pill.active`) junto a `.topbar-actions`.
   - **Preservar estrictamente:** `.icon-button` (`L81`, `L291-309`) porque se usa 4 veces en `CandidatePanel.tsx`, y `.secondary-action.settings-toggle.active` (`L368-372`) usada en `WorkspaceHeader.tsx:243`.
   - **Eliminar:** `.brand-mark` (`L42-51`), `, .empty-workspace h2` (`L58`), `.settings-panel` + `@keyframes slideInDown` + `.key-stack-horizontal*` (`L311-365`), `.icon-button.settings-toggle.active,` (`L367`), `.pipeline-strip`, `.pipeline-step`, `.pipeline-step.done` (`L384-409`), `.work-grid` (`L411-418`).
2. **`src/styles.css` y `src/styles/autoedit.css`:**
   - Verificar que `.view-mode-segmented` y `.view-mode-pill*` están guardadas en `layout.css`.
   - Eliminar `@import './styles/autoedit.css';` de `src/styles.css`.
   - Eliminar `src/styles/autoedit.css`.
3. **`src/styles/dashboard.css`:**
   - Eliminar la regla `@media` muerta `.work-grid, .pipeline-strip { grid-template-columns: 1fr; }` (`L98-101`).
4. **`src/styles/panels.css`:**
   - Eliminar `.clip-control`, `.clip-control input` (`L30-43`), `, .portrait-preview-container` y `, .portrait-preview-mock` (`L84, 92, 107, 112` preservando `.media-preview-container` y `.media-preview-thumb`), `.mock-video-inactive` (`L142-146`), `.output-path,` y `.output-path` (`L358, 369-373`), `, .empty-workspace` (`L382`) y `.empty-workspace*` (`L392-402` preservando `.empty-state`).
5. **`src/styles/modals.css`:**
   - Eliminar bloque StyleModal legacy (`L34-276`: `.style-modal-header*`, `.style-grid*`, `.style-card*`, `.style-preview-box`, `.preview-text-*`, `.style-modal-actions*`, `.key-stack-horizontal select*`). **Preservar** `.style-modal-overlay`, `.style-modal`, `@keyframes fadeIn`, `@keyframes scaleIn`.
   - Eliminar bloque Onboarding legacy (`L331-642`: `.brand-mark.large`, `.onboarding-choices`, `.choice-card*`, `.choice-icon`, `.choice-badge*`, `.local-setup-flow`, `.cloud-setup-flow`, `.setup-steps`, `.setup-step`, `.step-num`, `.step-body*`, `.code-block-container`, `.copy-btn*`, `.step-check*`, `.model-cards`, `.model-card*`, `.form-stack`, `.input-group*`, `.form-help`, `.onboarding-actions`, `.downloading-flow`). **Preservar estrictamente** `.onboarding-overlay`, `.onboarding-card`, `.onboarding-header*`, `.download-progress-container`, `.download-loader`, `.progress-bar-*`, `.download-*` (usados por `ModelDownloadModal.tsx`).
   - Eliminar `.summary-stats-box` y `.summary-stat-item*` (`L740-764`). **Preservar estrictamente** `.summary-modal-overlay`, `.summary-modal`, `.summary-modal-header*` (usados por `SettingsPanel`, `SocialCopyModal` y `QuickCopyModal`).
   - Eliminar todo el bloque AutoEdit modal (`L882-1437`, incluyendo `@keyframes modalScaleIn`). **Preservar estrictamente** `.cta-anim-*`, `.motionmaxxing-badge`, `.clip-studio-*`, `.clip-phone-*`, `.studio-*`.

---

### Fase 3: Frontend TypeScript / React y Vite (`src/`, `vite.config.ts`)
1. **Eliminar componentes muertos:** `src/components/common/PipelineStep.tsx`, `src/components/common/StatusPill.tsx`.
2. **`vite.config.ts`:** Eliminar `watch: { ignored: ["**/src-tauri/**"] }`.
3. **`src/types.ts`:** Eliminar `"demoTranscript"` de `BusyState` (`L169`) y `export type GamingCrops` (`L200-203`).
4. **Cadena `selectedStyle` / `setSelectedStyle`:**
   - `src/components/modals/StyleModal.tsx`: quitar `getOllamaTrafficLevel` (L18) y `selectedStyle` / `setSelectedStyle` de `StyleModalProps` (L26-27) y desestructuración (L66-67).
   - `src/hooks/useProjectActions.ts`: eliminar `const [selectedStyle, setSelectedStyle] = useState("modern-box");` (L32) y su exportación en retorno (L382-383); cambiar `confirmImport` (L285-305) para aceptar `(contentType, dur)` y pasar `captionStyle: "modern-box"` directamente en `invoke("create_project_from_path", ...)`.
   - `src/components/modals/ModalContainer.tsx`: quitar `React` default import (L1), quitar `export` de `ModalContainerProps` (L23), quitar `selectedStyle`/`setSelectedStyle` (`L70-71, 171-172`), y quitar props muertos `transcriptionEngine`/`setTranscriptionEngine` pasados a `SettingsPanel` (`L28-29, 128-129`).
   - `src/components/modals/SettingsPanel.tsx`: quitar `React` default import (`L1`) y props sin uso `transcriptionEngine`/`setTranscriptionEngine` de `SettingsPanelProps` (`L22-23`).
   - `src/App.tsx`: quitar `invoke`, `Loader2`, `SettingsPanel` (`L2, 3, 19`), eliminar bloque muerto `settingsNode` (`L81-121`) y su paso en `<HomeDashboard>` (`L230`) junto con `environment={settings.environment}` (`L218`), quitar `busy={projectActions.busy}` en `useMediaPipeline` (`L56`), quitar `transcriptionEngine` en `TranscriptPanel` (`L165`), quitar `selectedStyle`/`setSelectedStyle` en `<ModalContainer>` (`L290-291`) y actualizar `onConfirmImport` (`L308-314`).
5. **Props/imports/exports restantes:**
   - `src/components/panels/HomeDashboard.tsx`: quitar `EnvironmentStatus` de `import type` (`L15`) y eliminar `environment` y `settingsNode` de `HomeDashboardProps` y desestructuración (`L21, 33, 39, 51`).
   - `src/components/panels/TranscriptPanel.tsx`: quitar `React` default import (`L1`) y prop `transcriptionEngine` (`L13, 28`).
   - `src/components/panels/WorkspaceHeader.tsx`: quitar `Clapperboard`, `Trash2`, `LlmMemoryStatus` (`L3, 15, 17`).
   - `src/components/panels/Sidebar.tsx` y `src/components/modals/SocialCopyModal.tsx`: quitar `React` default import (`L1`).
   - `src/components/modals/CandidatePreviewModal.tsx`: quitar `Eye` (`L16`), quitar `export` de `InternalSegment` (`L38`), eliminar `const origFps = ...` (`L558`).
   - `src/hooks/useMediaPipeline.ts`: quitar `export` de `CutClipOptions` (`L14`) y eliminar `busy` de `UseMediaPipelineOptions` (`L53`) y desestructuración (`L78`).
   - `src/hooks/useAppSettings.ts`: quitar `export` de `DEFAULT_MOMENTS_PROMPT` (`L13`).

---

### Fase 4: Backend Python, Dependencias y `README.md`
1. **`python_backend/api.py`:**
   - Quitar imports sin uso: `subprocess`, `threading`, `extract_video_thumbnail`, `build_drawtext_filters`, `open_media_file`, `PROJECT_FILE_NAME`.
   - Importar `DEFAULT_MOMENTS_PROMPT` directamente desde `.llm_prompts`.
   - Eliminar métodos RPC muertos: `update_project_workflow_goal`, `probe_project`, `extract_project_audio`, `save_demo_transcript`, `get_whisper_models`, `install_ollama`, `open_media_file`.
   - Renombrar `open_project_file_dialog` a `_open_project_file_dialog` (invocado en `import_existing_project`) para no exponer un RPC muerto.
   - Eliminar variables locales muertas: `api_key` no usada en `transcribe_project` (`L398, 408, 412`), `enable_thinking` local sin uso en `regenerate_candidate_copy` (`L828`), `drawtext_filters = None` en `render_flat_clip_for_candidate` (`L1140, L1223`).
2. **`python_backend/db.py`:**
   - Quitar alias muerto `_infer_hook_type = classify_hook_type` (`L18`).
   - Eliminar `update_project_workflow_goal` (`L260-264`).
   - Eliminar métodos CRUD muertos de AutoEdit: `save_autoedit`, `get_autoedit`, `list_autoedits`, `delete_autoedit`, `update_autoedit_copy` (`L581-666`), manteniendo `CREATE TABLE IF NOT EXISTS autoedits` para compatibilidad retroactiva de SQLite.
3. **`python_backend/llm.py`:**
   - Quitar imports sin uso `DEFAULT_MOMENTS_PROMPT` y `locate_moment_active_window` (`L13, L16`).
   - Eliminar wrappers muertos `expand_short_candidate` (`L427-434`) y `clamp_candidate_duration` (`L437-444`).
   - Quitar variable local sin uso `unloaded` en `unload_all_lmstudio_models` (`L123, L130`).
4. **`python_backend/llm_prompts.py`:**
   - Eliminar función huérfana `locate_moment_active_window` (`L233-311`).
5. **`python_backend/media.py`:**
   - Eliminar funciones huérfanas `extract_video_thumbnail` (`L620-641`), `get_font_option` (`L806-824`) y `build_drawtext_filters` (`L827-883`).
   - Retirar parámetro muerto `drawtext_filters: Optional[str] = None` (`L1340`) y su rama `elif drawtext_filters` (`L1594-1595`) en `render_flat_clip`.
6. **`python_backend/services/project_service.py`:**
   - Importar `from ..version import __version__` y reemplazar `"appVersion": "2.6.0"` por `"appVersion": __version__` (`L76`).
   - Eliminar función huérfana `open_media_file` (`L400-409`).
7. **`python_backend/stream_server.py`, `transcription.py`, `logger.py`:**
   - Eliminar `from pathlib import Path` en `stream_server.py`, `import json` en `transcription.py`, `import time` en `logger.py`.
8. **`requirements.txt` y `README.md`:**
   - Quitar `tqdm>=4.66.0` (dependencia transitiva no importada directamente) de `requirements.txt`.
   - Actualizar `README.md` a `v3.0.0`, sustituir `clamp_candidate_duration` por `normalize_candidate_duration`, actualizar árbol del repo (`context/DECISIONS.md`, `context/plans/`, `tests/`, eliminar referencia a `.tar.gz`) y documentar capacidades v3.0 (Gaming Split 2D, Downscale Blur, BGM y VBR 2-Pass).

---

### Fase 5: Purga de Archivos Obsoletos, Residuos Locales y `.gitignore`
1. Eliminar en Git (`git rm`): `.github/workflows/release.yml`, `.env.example`, `src/components/common/PipelineStep.tsx`, `src/components/common/StatusPill.tsx`, `src/styles/autoedit.css`. Eliminar carpeta vacía `.github/`.
2. Eliminar del disco local (residuos no rastreados): `_internal/`, `MagicMock/`, `analizarrepos/`, `build/`, `.env`, `**/__pycache__/`, y todo el contenido residual de `scratch/`.
3. **`.gitignore` definitivo:**
   ```gitignore
   node_modules
   dist
   build
   _internal
   .env
   .DS_Store
   *.log
   *.pyc
   __pycache__/
   venv/
   .venv/
   env/
   data/
   scratch/
   MagicMock/
   ```

---

### Fase 6: Validación Final y Gate de Cierre
1. Ejecutar `node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters` (0 errores).
2. Ejecutar `node node_modules/vite/bin/vite.js build` para reconstruir limpio `dist/` para `AutoShorts.bat` (`emptyOutDir: true` elimina cualquier resto previo dentro de `dist/`).
3. Ejecutar `python -m unittest discover -s tests -p "test_*.py" -v` (100% en verde, verificando que el test E2E sintético pasa y que no se creó `MagicMock/`).
4. Ejecutar auditoría **`egm-drift-report`** sobre `context/designs/39-limpieza-profunda-repo-y-codigo-muerto.md`, guardar en `context/egm/2026-11-24_DRIFT_REPORT.md` y confirmar `Status: No drift detected`.
