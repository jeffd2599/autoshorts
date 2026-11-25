# Reporte Consolidado de Auditoría Goldfish EGM (Plan 39)

**Borrador Auditado:** `context/egm/design_draft.md`  
**Auditores Instanciados:**
- `0ca891b3-fdfa-4053-9dcc-ec7bd7280889` (`egm-codebase-details` — Goldfish Codebase Auditor)
- `0f8eaa24-1745-4ed8-99a5-19acf933bae6` (`egm-implementation-readiness` — Goldfish Implementation Auditor)  
**Fecha:** 2026-11-24

---

## 1. Hallazgos BLOCKERS (Críticos — Deben Resolverse Antes de Ejecutar)

1. **BLOCKER-1: Import huérfano `SettingsPanel` en `src/App.tsx:19`**
   - Al retirar la variable muerta `settingsNode` (`L81-121`) y su paso en `<HomeDashboard>` (`L230`), `SettingsPanel` queda sin uso en `src/App.tsx` (pues `ModalContainer.tsx` ya lo importa y renderiza). Omitir su retirada rompe `tsc --noEmit --noUnusedLocals --noUnusedParameters` (`TS6133`).
2. **BLOCKER-2: Import huérfano `EnvironmentStatus` en `src/components/panels/HomeDashboard.tsx:15`**
   - Al retirar la prop muerta `environment` (`L21, L39`), el import de tipo `EnvironmentStatus` (`L15`) queda sin uso y rompe `tsc` (`TS6133`).
3. **BLOCKER-3: Preservación obligatoria de `.icon-button` en `src/styles/layout.css`**
   - `CandidatePanel.tsx` usa `className="icon-button"` 4 veces (`L702`, `L1154`, `L1172`, `L1190`). Debe preservarse estrictamente `.icon-button` (`layout.css:81, 291-309`) y `.secondary-action.settings-toggle.active` (`L368-372`). Únicamente debe retirarse `.icon-button.settings-toggle.active,` (`L367`).
4. **BLOCKER-4: Ausencia de orden secuencial seguro (TDD + migración CSS)**
   - Si se borra `autoedit.css` antes de copiar sus líneas `1-38` completas (incluyendo `.view-mode-pill:hover` y `.view-mode-pill.active`) hacia `layout.css`, o si se limpia `scratch/` antes de consolidar la suite TDD en `tests/`, se introducen regresiones temporales o pérdida de cobertura. Debe imponerse un orden estricto en Fases 1 a 6.
5. **BLOCKER-5: Decisiones condicionales abiertas en el borrador**
   - El borrador contenía frases abiertas (`"verificar..."`, `"si..."`, `"o..."`) sobre `.icon-button`, `useMediaPipeline` (`busy`, `CutClipOptions`), cadena completa de `selectedStyle` (`StyleModal` -> `ModalContainer` -> `useProjectActions` -> `App`), exports internos (`InternalSegment`, `ModalContainerProps`, `DEFAULT_MOMENTS_PROMPT`), `Api.open_project_file_dialog`, `Database.update_project_workflow_goal` y contenido exacto de `.gitignore`. Todas deben quedar fijadas sin ambigüedad.
6. **BLOCKER-6: Política explícita sobre staging Git actual e íconos**
   - Debe delimitarse que `git mv DECISIONS.md -> context/DECISIONS.md` y `plans/1..32 -> context/plans/` ya están staged y **no** deben revertirse (`git reset` y `git clean` prohibidos); distinguir qué se retira del índice (`git rm`) vs disco local, y dejar explícita la preservación de `public/`, `icon.ico`, `icon.png`, `context/`, `data/` y `dist/` recompilado.

---

## 2. Hallazgos MAJORS

1. **MAJOR-1: Contrato incompleto en la retirada de `selectedStyle` / `setSelectedStyle`**
   - Al retirar `selectedStyle` / `setSelectedStyle` de `StyleModal.tsx`, debe completarse la cadena en `ModalContainer.tsx`, `useProjectActions.ts` (eliminar `useState("modern-box")` L32 y retorno L382-383, simplificar `confirmImport` fijando `captionStyle: "modern-box"` internamente) y `App.tsx` (`L290-291` y llamada `confirmImport` en `L308-314`).
2. **MAJOR-2: Código muerto Python encadenado tras retirar sus únicos callers**
   - `python_backend/llm_prompts.py:233-312`: `locate_moment_active_window` queda con 0 callers al retirar su import en `llm.py`.
   - `python_backend/media.py:620-641`: `extract_video_thumbnail` queda con 0 callers al retirar su import en `api.py`.
   - `python_backend/media.py:806-883` + `L1340, 1594-1595` + `api.py:1140, 1223`: `get_font_option`, `build_drawtext_filters` y la rama `drawtext_filters` siempre `None`.
   - `python_backend/services/project_service.py:400-409` (`open_media_file`) queda huérfano, y `serialize_project` (`L76`) tiene `"appVersion": "2.6.0"` hardcodeado en lugar de `__version__`.
   - Otros símbolos muertos detectados: `_infer_hook_type` (`db.py:18`), `enable_thinking` local muerto (`api.py:828`), `api_key` local sin uso (`api.py:398, 408, 412`), `unloaded` (`llm.py:123, 130`), `import time` (`logger.py:3`), y `transcriptionEngine` / `setTranscriptionEngine` sin uso en `SettingsPanel.tsx:22-23` + `ModalContainer.tsx:128-129` + `App.tsx:86-87`.
3. **MAJOR-3: `README.md` desactualizado en `release-v3.0`**
   - Refiere `v2.9.0`, `clamp_candidate_duration` (eliminada por Plan 39) y `DECISIONS.md` en raíz (ya movido a `context/DECISIONS.md`). Debe actualizarse a `v3.0.0`.
4. **MAJOR-4: Cobertura TDD y nombre unificado de archivo de tests**
   - Unificar nombre `tests/test_v30_regression.py` (Plan 39 vs Borrador) e incluir los 4 niveles obligatorios (unitarios, integración, E2E autocontenido con video sintético FFmpeg en `TemporaryDirectory` sin depender de rutas externas, y aserciones estáticas de limpieza con verificación explícita de que `MagicMock/` no se cree en raíz).

---

## 3. Hallazgos MINORS

1. **MINOR-1:** Atribución CSS correcta en `modals.css`: `.summary-modal-overlay` lo usa `SettingsPanel.tsx:114`, `SocialCopyModal.tsx` y `QuickCopyModal.tsx`; `LogsModal.tsx` usa `.modal-backdrop` / `.logs-modal`. `.downloading-flow` (`modals.css:640-642`) tampoco tiene uso.
2. **MINOR-2:** Incluir explícitamente `.view-mode-pill:hover` y `.view-mode-pill.active` (`autoedit.css:1-38`) al migrar a `layout.css`, `GamingCrops` y `"demoTranscript"` sin uso en `src/types.ts`, `tqdm>=4.66.0` sin uso directo en `requirements.txt`, y advertencia de `vite build` (`emptyOutDir: true`) sobre `dist/`.
