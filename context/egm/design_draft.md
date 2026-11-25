# Borrador de Diseño Técnico (Plan 39): Limpieza Profunda del Repositorio, Código Muerto y Residuos Locales

**Plan Asociado:** `context/plans/39-limpieza-profunda-repo-y-codigo-muerto.md`  
**Objetivo:** Dejar la rama `release-v3.0` y el directorio de trabajo completamente limpios antes de `git push`, eliminando archivos obsoletos (Tauri, AutoEdit, cloud APIs), código muerto en Python y TypeScript/React, selectores CSS huérfanos y residuos locales no rastreados, sin romper ninguna funcionalidad activa ni borrar datos del usuario.

---

## 1. Purga de Archivos Rastreables Obsoletos (Git)

1. **`.github/workflows/release.yml` (y directorio `.github/` si queda vacío):**
   - **Motivo:** Ejecuta `dtolnay/rust-toolchain@stable`, `npm ci` y `tauri-apps/tauri-action@v0`, incompatibles con AutoShorts v3.0 (Python + PyWebView + `pnpm` según D-002, D-006, D-015).
   - **Acción:** Eliminar `.github/workflows/release.yml` y la carpeta `.github/`.
2. **`.env.example`:**
   - **Motivo:** Solo declara claves cloud retiradas en D-005 (`DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`) que ningún archivo lee.
   - **Acción:** Eliminar `.env.example` (y `.env` local no rastreado).
3. **`src/components/common/PipelineStep.tsx` y `src/components/common/StatusPill.tsx`:**
   - **Motivo:** 0 importaciones ni referencias en `src/`.
   - **Acción:** Eliminar ambos archivos.
4. **`src/styles/autoedit.css` + `src/styles.css`:**
   - **Motivo:** 833 líneas del módulo eliminado `AutoEditWorkspace` (D-005). Solo las clases `.view-mode-segmented`, `.view-mode-pill`, `.view-mode-pill:hover` y `.view-mode-pill.active` (L1-38) están en uso activo en `src/components/panels/WorkspaceHeader.tsx`.
   - **Acción:** Migrar `.view-mode-segmented` y `.view-mode-pill*` a `src/styles/layout.css` (junto a `.topbar-actions`), eliminar `@import './styles/autoedit.css';` de `src/styles.css` y borrar `src/styles/autoedit.css`.
5. **`vite.config.ts`:**
   - **Acción:** Eliminar `watch: { ignored: ["**/src-tauri/**"] }` del bloque `server` dejando la configuración limpia.

---

## 2. Purga de CSS Huérfano (`src/styles/`)

- **`src/styles/layout.css`:**
  - Añadir `.view-mode-segmented` y `.view-mode-pill` migradas desde `autoedit.css`.
  - Eliminar los bloques muertos: `.brand-mark` (L42-51), `.empty-workspace h2` del grupo L58, `.settings-panel` y `@keyframes slideInDown` y `.key-stack-horizontal*` (L311-365), `.pipeline-strip`, `.pipeline-step`, `.pipeline-step.done` (L384-409), `.work-grid` (L411-418).
  - Nota: preservar `.icon-button` y `.icon-button.settings-toggle.active` si es necesario o comprobar primero si algún archivo usa `icon-button` (nota: verificar en auditoría Goldfish si `.icon-button` se usa en `src/`!).
- **`src/styles/dashboard.css`:**
  - En `@media (max-width: 1120px)` (L98-101), eliminar `.work-grid, .pipeline-strip { grid-template-columns: 1fr; }`.
- **`src/styles/panels.css`:**
  - Eliminar `.clip-control`, `.clip-control input` (L30-43), los selectores alias muertos `.portrait-preview-container`, `.portrait-preview-mock` (L84, L92, L107, L112 — conservando `.media-preview-container` y `.media-preview-thumb`), `.mock-video-inactive` (L142-146), `.output-path` (L358, L369-373), `.empty-workspace` (L382, L392-402 — conservando `.empty-state`).
- **`src/styles/modals.css`:**
  - Eliminar en `StyleModal` legacy: `.style-modal-header*` (L34-46), `.style-grid*` (L48-64), `.style-card*` (L66-99), `.style-preview-box` y `.preview-text-*` (L101-198), `.style-modal-actions*` (L200-243), `.key-stack-horizontal select*` (L255-276). **Preservar** `.style-modal-overlay`, `.style-modal`, `@keyframes fadeIn`, `@keyframes scaleIn`.
  - Eliminar en Onboarding legacy: `.brand-mark.large`, `.onboarding-choices`, `.choice-card*`, `.choice-icon`, `.choice-badge*`, `.local-setup-flow`, `.cloud-setup-flow`, `.setup-steps`, `.setup-step`, `.step-num`, `.step-body*`, `.code-block-container`, `.copy-btn*`, `.step-check*`, `.model-cards`, `.model-card*`, `.form-stack`, `.input-group*`, `.form-help`, `.onboarding-actions` (L331-637). **Preservar estrictamente** `.onboarding-overlay`, `.onboarding-card`, `.onboarding-header`, `.onboarding-header.compact`, `.onboarding-header h2/p` (usados por `ModelDownloadModal.tsx`) y `.downloading-flow` / `.download-progress-container` / `.progress-bar-*` / `.download-*`.
  - Eliminar en Summary legacy: `.summary-stats-box` y `.summary-stat-item*` (L740-764). **Preservar estrictamente** `.summary-modal-overlay`, `.summary-modal`, `.summary-modal-header*` (usados por `SocialCopyModal`, `QuickCopyModal` y `LogsModal`).
  - Eliminar todo el bloque AutoEdit Modal (`.autoedit-modal-overlay` hasta `.autoedit-btn:disabled`, L882-1437). **Preservar estrictamente** `.cta-anim-*`, `.motionmaxxing-badge`, `.clip-studio-*`, `.clip-phone-*`, `.studio-*`.

---

## 3. Purga de Imports, Props y Código Muerto en TypeScript/React (`src/`)

Objetivo: cero errores con `node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters`.

1. **`src/App.tsx`:**
   - Eliminar `import { invoke } from "./apiBridge";` y `import { Loader2 } from "lucide-react";`.
   - Eliminar la variable muerta `settingsNode` (L81-121, duplicada innecesariamente porque `ModalContainer` ya renderiza `<SettingsPanel>`).
   - Dejar de pasar `environment={settings.environment}` y `settingsNode={settingsNode}` a `<HomeDashboard>` y `transcriptionEngine` / `selectedStyle` si se limpian sus props.
2. **`src/components/panels/HomeDashboard.tsx`:**
   - Eliminar `environment?: ...` y `settingsNode?: ...` de `HomeDashboardProps` y de la desestructuración.
3. **`src/components/panels/TranscriptPanel.tsx`:**
   - Eliminar default import sin uso `React` y prop sin uso `transcriptionEngine` de `TranscriptPanelProps` y de `App.tsx`.
4. **`src/components/panels/WorkspaceHeader.tsx`:**
   - Eliminar imports sin uso `Clapperboard`, `Trash2`, `LlmMemoryStatus`.
5. **`src/components/panels/Sidebar.tsx`:**
   - Eliminar default import sin uso `React`.
6. **`src/components/modals/CandidatePreviewModal.tsx`:**
   - Eliminar `Eye` del import de `lucide-react` y `const origFps = ...` (L558).
   - Cambiar `export interface InternalSegment` a `interface InternalSegment` (no exportada si solo es interna).
7. **`src/components/modals/ModalContainer.tsx`:**
   - Eliminar default import sin uso `React` y quitar `export` de `ModalContainerProps` si solo es interna.
   - Si `selectedStyle` / `setSelectedStyle` no se usan en `StyleModal.tsx`, limpiarlos de `StyleModalProps`, `ModalContainerProps` y `App.tsx`, manteniendo en `useProjectActions.ts` el parámetro interno `"modern-box"` por compatibilidad de `create_project_from_path`.
8. **`src/components/modals/SettingsPanel.tsx` y `SocialCopyModal.tsx`:**
   - Eliminar `React` sin uso del import por defecto (manteniendo `{ useMemo, useState }` en `SettingsPanel.tsx`).
9. **`src/components/modals/StyleModal.tsx`:**
   - Eliminar `getOllamaTrafficLevel` sin uso del import de `ModelBadge`.
   - Retirar props sin uso `selectedStyle` y `setSelectedStyle`.
10. **`src/hooks/useMediaPipeline.ts`:**
    - Retirar desestructuración sin uso `busy` de `options` (verificar antes si `UseMediaPipelineOptions.busy` se usa o si se puede retirar de `App.tsx` + interfaz).
    - Cambiar `export interface CutClipOptions` a `interface CutClipOptions` si no se importa fuera.
11. **`src/hooks/useAppSettings.ts`:**
    - Mantener `export const DEFAULT_MOMENTS_PROMPT` o quitar `export` si nadie lo importa fuera de `useAppSettings.ts`.

---

## 4. Purga en Backend Python (`python_backend/`)

1. **`python_backend/api.py`:**
   - Eliminar imports sin uso: `subprocess`, `threading`, `extract_video_thumbnail`, `build_drawtext_filters`, `PROJECT_FILE_NAME`.
   - Cambiar import de `DEFAULT_MOMENTS_PROMPT` a `from .llm_prompts import DEFAULT_MOMENTS_PROMPT` (evitando re-export indirecto desde `llm.py`).
   - Eliminar métodos RPC muertos de `Api` con 0 llamadas desde frontend ni tests:
     - `update_project_workflow_goal`
     - `probe_project`
     - `extract_project_audio`
     - `save_demo_transcript`
     - `get_whisper_models`
     - `install_ollama`
     - `open_media_file` (y retirar su import de `.services.project_service`)
   - Convertir `open_project_file_dialog` o conservarlo si se usa internamente en `import_existing_project` (L1553 lo invoca directamente `self.open_project_file_dialog()`).
2. **`python_backend/db.py`:**
   - Eliminar métodos CRUD muertos de AutoEdit: `save_autoedit`, `get_autoedit`, `list_autoedits`, `delete_autoedit`, `update_autoedit_copy` (L581-666).
   - Eliminar `update_project_workflow_goal` (L260-264) si ya no tiene callers en `api.py` ni servicios/tests.
   - Mantener la tabla SQLite `autoedits` en `CREATE TABLE IF NOT EXISTS` para no alterar bases `data/autoshorts.db` existentes.
3. **`python_backend/llm.py`:**
   - Eliminar imports sin uso `DEFAULT_MOMENTS_PROMPT` (movido directo a `api.py`) y `locate_moment_active_window`.
   - Eliminar wrappers muertos `expand_short_candidate` (L427-434) y `clamp_candidate_duration` (L437-444), ya unificados en `normalize_candidate_duration` (D-029).
4. **`python_backend/stream_server.py`:**
   - Eliminar import sin uso `from pathlib import Path`.
5. **`python_backend/transcription.py`:**
   - Eliminar import sin uso `import json`.
6. **Higiene de comentarios (`antislop-code` + `senior-code-craft`):**
   - Limpiar comentarios decorativos redundantes en las zonas tocadas sin alterar lógica ni docstrings útiles.

---

## 5. Residuos Locales, `.gitignore` y Suite de Tests (`tests/`)

1. **Promover y Consolidar Tests en `tests/` (TDD):**
   - Crear `tests/test_v30_regression.py` consolidando pruebas unitarias e integración reales de v3.0 (desacoplamiento de filtergraphs FFmpeg en Pase 1/Pase 2 y multi-segment `concat`, composición 2D `gaming_split` con `outWidth`/`outHeight`/`outX`/`outY` y `make_even`/`make_even_coord`, `SystemLogBuffer.append`, sanitización de `save_project_bgm`, y aserciones de limpieza que verifiquen que los archivos/clases/símbolos obsoletos no existan y que los tests usen siempre `tempfile.TemporaryDirectory()`).
2. **Eliminar Residuos Locales del Directorio de Trabajo:**
   - Borrar `_internal/`, `MagicMock/`, `analizarrepos/`, `build/`, `.env`, `__pycache__/`, y todo el contenido residual de `scratch/` (scripts descartables `append_d017.py`, `apply_plan15_fixes.py`, `update_*.py`, `fix_bat.py`, PNGs temporales y tests antiguos que generaban `MagicMock/`).
   - Preservar `context/` (regla del protocolo), `data/` (base y proyectos del usuario) y `dist/` (recompilado con `vite build` para que `AutoShorts.bat` arranque al instante).
3. **Actualizar `.gitignore`:**
   - Añadir `_internal/` (además de `build/`, `dist/`, `data/`, `scratch/`, `__pycache__/`, `.env`, `*.pyc`, `*.log`).
   - Retirar reglas legacy sin sentido en Python/PyWebView (`target`, `src-tauri/target`, `build_tmp/`, `release/`, `repo-supoclip/`, `MagicMock/`, `analizarrepos/` si ya no existen, o dejar `MagicMock/` preventivamente opcional; mantener `node_modules`, `dist`, `.env`, `.DS_Store`, `*.log`, `*.pyc`, `__pycache__/`, `build/`, `_internal/`, `data/`, `scratch/`).
