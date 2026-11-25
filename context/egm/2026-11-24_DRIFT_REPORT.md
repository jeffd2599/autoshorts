# EGM Drift Report — Plan 39 (`39-limpieza-profunda-repo-y-codigo-muerto`)

**Date:** 2026-11-24  
**Design Audited:** `context/designs/39-limpieza-profunda-repo-y-codigo-muerto.md`  
**Audit Method:** Subagente aislado `egm-codebase-details` (`f0b5d44c-1d00-45cf-becf-510b190d1742`) sobre código/CSS/configs/docs/tests + verificación directa en shell del Elefante para rutas en disco, git index y suite de checks Fase 6.  
**Status:** No drift detected

---

## 1. Phase-by-Phase Compliance Audit

### Fase 1: Suite TDD Unificada (`tests/test_v30_regression.py`)
- **Result:** Compliant (`tests/test_v30_regression.py` L1-324).
- **Verified Evidence:**
  - Uses `tempfile.TemporaryDirectory()` exclusively in unit (`L87`), integration (`L137`), and synthetic E2E (`L189`) tests, with root `MagicMock` absence guard (`L180`).
  - **Unitarios (`TestV30CoreUnit`, L33-133):** Covers `make_even`, `make_even_coord` (`L36-42`), `parse_progress_time_sec` and `SystemLogBuffer.append` (`L44-56`), `normalize_candidate_duration` (`L58-71`), `render_flat_clip` two-pass filtergraph decoupling (`concat=n=2:v=1:a=0[vjoined]` vs `concat=n=2:v=0:a=1[ajoined]`, Pass 1 without BGM/alimiter/`[aout]`, `-an`, `-preset`), and 2D `gaming_split` composition (`scale=600:360:flags=lanczos[vcam]`, `scale=960:720:flags=lanczos[vgame]`, `overlay=x=60:y=440`, `overlay=x=240:y=40`) (`L73-133`).
  - **Integración (`TestV30Integration`, L135-180):** Covers `Api.save_project_bgm` path-traversal/reserved-character sanitization (`../../evil:bgm?*<name>.mp3` -> `evilbgmname.mp3` under `proj_dir / "bgm"`, `L153-162`) and `sync_project_to_disk` / `restore_project_from_disk` asserting `appVersion == __version__` (`L165-176`).
  - **E2E Autocontenido (`TestV30SyntheticRenderE2E`, L183-252):** Synthesizes video (`testsrc`) and audio (`sine`) via `ffmpeg`, generates `.ass` subtitles and CTA `.png` badge, runs `render_flat_clip(..., layout="gaming_split", two_pass=True)`, and validates output stream presence and `1080x1920` dimensions via `probe_media`.
  - **Aserciones Estáticas (`TestRepoCleanupCompliance`, L255-320):** Asserts absence of obsolete artifacts (`.github/workflows/release.yml`, `.env.example`, `.env`, `_internal`, `MagicMock`, `analizarrepos`, `build`, `PipelineStep.tsx`, `StatusPill.tsx`, `src/styles/autoedit.css`), CSS/config/README hygiene, and removal of dead Python symbols in `api.py`, `db.py`, `llm.py`, `llm_prompts.py`, and `media.py`.
- **Minor Implementation Notes (Non-Drift):**
  - `test_render_flat_clip_two_pass_decoupled_and_gaming_split_2d` (`L73-75`) patches `python_backend.media._run_ffmpeg_monitored` (wrapping `subprocess.Popen`) preserving direct inspection of `cmd_pass1` and `cmd_pass2`.
  - `TestV30SyntheticRenderE2E` (`L200, L232`) generates a 2.5s source and renders a 2.0s clip via real FFmpeg.

### Fase 2: Migración y Limpieza CSS Segura (`src/styles/`, `src/styles.css`)
- **Result:** Compliant.
- **Verified Evidence:**
  - `src/styles.css` (`L1-6`): `@import './styles/autoedit.css';` removed; `src/styles/autoedit.css` absent.
  - `src/styles/layout.css` (`L1-463`): `.view-mode-segmented`, `.view-mode-pill`, `.view-mode-pill:hover`, `.view-mode-pill.active` migrated adjacent to `.topbar-actions` (`L273-316`); `.icon-button` (`L69, L318-336`) and `.secondary-action.settings-toggle.active` (`L338-342`) preserved; `.brand-mark`, `, .empty-workspace h2`, `.settings-panel`, `@keyframes slideInDown`, `.key-stack-horizontal*`, `.icon-button.settings-toggle.active,`, `.pipeline-strip`, `.pipeline-step*`, and `.work-grid` removed.
  - `src/styles/dashboard.css` (`L70-97`): Dead `.work-grid, .pipeline-strip` rule removed from `@media (max-width: 1120px)`.
  - `src/styles/panels.css` (`L1-365`): `.clip-control*`, `.portrait-preview-container`, `.portrait-preview-mock`, `.mock-video-inactive`, `.output-path`, and `.empty-workspace*` removed; `.media-preview-container`, `.media-preview-thumb`, and `.empty-state` preserved.
  - `src/styles/modals.css` (`L1-574`): Legacy StyleModal, legacy Onboarding, `.summary-stats-box` / `.summary-stat-item*`, and AutoEdit modal + `@keyframes modalScaleIn` removed; `.style-modal-overlay`, `.style-modal`, `@keyframes fadeIn`, `@keyframes scaleIn`, `.onboarding-overlay`, `.onboarding-card`, `.onboarding-header*`, `.download-*`, `.progress-bar-*`, `.summary-modal*`, `.motionmaxxing-badge`, `.cta-anim-*`, `.clip-studio-*`, `.clip-phone-*`, and `.studio-*` preserved.

### Fase 3: Frontend TypeScript / React y Vite (`src/`, `vite.config.ts`)
- **Result:** Compliant.
- **Verified Evidence:**
  - `src/components/common/PipelineStep.tsx` and `src/components/common/StatusPill.tsx`: removed (`git rm`).
  - `vite.config.ts` (`L1-13`): `watch.ignored` for `src-tauri` removed.
  - `src/types.ts` (`L1-226`): `"demoTranscript"` removed from `BusyState` (`L165-171`); `GamingCrops` removed.
  - `src/components/modals/StyleModal.tsx` (`L1-765`): `getOllamaTrafficLevel` removed, `selectedStyle`/`setSelectedStyle` removed from `StyleModalProps` and destructuring.
  - `src/hooks/useProjectActions.ts` (`L1-403`): `selectedStyle`/`setSelectedStyle` removed; `confirmImport` accepts `(contentType, dur)` and passes `captionStyle: "modern-box"`.
  - `src/components/modals/ModalContainer.tsx` (`L1-249`): default `React` import removed, `export` removed from `ModalContainerProps`, `selectedStyle`/`setSelectedStyle` removed, `transcriptionEngine`/`setTranscriptionEngine` removed from `<SettingsPanel>`.
  - `src/components/modals/SettingsPanel.tsx` (`L1-926`): default `React` import removed, `transcriptionEngine`/`setTranscriptionEngine` removed from `SettingsPanelProps`.
  - `src/App.tsx` (`L1-296`): `invoke`, `Loader2`, `SettingsPanel` removed; dead `settingsNode` block removed; `environment` & `settingsNode` removed from `<HomeDashboard>`; `busy` removed from `useMediaPipeline`; `transcriptionEngine` removed from `<TranscriptPanel>`; `selectedStyle`/`setSelectedStyle` removed and `onConfirmImport` updated in `<ModalContainer>`.
  - `src/components/panels/HomeDashboard.tsx` (`L1-264`): `EnvironmentStatus` import and `environment`/`settingsNode` props removed.
  - `src/components/panels/TranscriptPanel.tsx` (`L1-197`), `WorkspaceHeader.tsx` (`L1-280`), `Sidebar.tsx` (`L1-142`), `SocialCopyModal.tsx` (`L1-296`), `CandidatePreviewModal.tsx` (`L1-4532`), `useMediaPipeline.ts` (`L1-900`), `useAppSettings.ts` (`L1-443`): all specified dead imports, props, locals, and internal exports cleaned cleanly.

### Fase 4: Backend Python, Dependencias y `README.md`
- **Result:** Compliant.
- **Verified Evidence:**
  - `python_backend/api.py` (`L1-1498`): unused imports removed, `DEFAULT_MOMENTS_PROMPT` imported from `.llm_prompts`, 7 dead RPC methods removed, `_open_project_file_dialog` privatized, 3 dead locals removed.
  - `python_backend/db.py` (`L1-569`): `_infer_hook_type`, `update_project_workflow_goal`, and 5 AutoEdit CRUD methods removed while preserving `CREATE TABLE IF NOT EXISTS autoedits` (`L116-128`).
  - `python_backend/llm.py` (`L1-1701`), `llm_prompts.py` (`L1-256`), `media.py` (`L1-1665`), `services/project_service.py` (`L1-454`), `stream_server.py`, `transcription.py`, `logger.py`: all dead symbols/imports/hardcoded `"2.6.0"` removed and replaced with `__version__`.
  - `requirements.txt` (`L1-12`): `tqdm>=4.66.0` removed.
  - `README.md` (`L1-331`): updated to `v3.0.0`, `normalize_candidate_duration`, `context/DECISIONS.md`, `context/plans/`, `tests/`, `.zip` portable without `.tar.gz`, and v3.0 features.

### Fase 5: Purga de Archivos Obsoletos, Residuos Locales y `.gitignore`
- **Result:** Compliant.
- **Verified Evidence:**
  - `.gitignore` (`L1-17`) matches all 15 ignore rules cleanly without duplicate `*.pyc` or `src-tauri` entries.
  - Direct filesystem checks (`Test-Path`) verified absence (`True`) of `.github`, `.env`, `.env.example`, `_internal`, `MagicMock`, `analizarrepos`, `build`, `PipelineStep.tsx`, `StatusPill.tsx`, and `autoedit.css`, plus `SCRATCH ITEMS COUNT: 0`.
  - Direct filesystem checks verified preservation (`True`) of `context/`, `context/DECISIONS.md` (`D-039`), `data/`, `public/favicon.ico`, `public/icon.png`, root `icon.ico`, root `icon.png`, `dist/index.html`, `AutoShorts.bat`, `AutoShorts.spec`, `run.py`, and `build_portable.py`.

### Fase 6: Verificación Integral (Build, Typecheck y Tests)
- **TypeScript (`tsc --noEmit --noUnusedLocals --noUnusedParameters`):** Exit code `0` (0 errores).
- **Frontend Build (`node node_modules/vite/bin/vite.js build`):** `✓ 1612 modules transformed.`, `✓ built in 2.79s` (`dist/index.html`, CSS `30.04 kB`, JS `538.10 kB`).
- **Python Test Suite (`python -m unittest discover -s tests -p "test_*.py" -v`):** `Ran 12 tests in 1.732s` — `OK (skipped=1)` (único omitido: `test_real_hardware_ffmpeg_burns_subtitles_and_cta` por ausencia en disco de grabación externa en `E:\Disco OLD\...`).
- **Git Index (`git status -s`):** Renames previos en `context/` intactos (`RM DECISIONS.md -> context/DECISIONS.md`, `R plans/1..32 -> context/plans/*`), borrados escenificados (`D` en los 5 archivos obsoletos), 0 residuos sin ignorar.

---

## 2. Drift Summary

- **Blocker:** 0
- **Major:** 0
- **Nit / Informational:** 2 notas menores en pruebas (`_run_ffmpeg_monitored` mockeado en vez de `subprocess.Popen` directo; video sintético de 2.5s -> 2.0s).
- **Verdict:** **No drift detected**
