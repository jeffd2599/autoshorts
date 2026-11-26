# EGM Drift Report — Plan 40 (`Studio NLE v3.0`)

**Date:** 2026-11-24  
**Design Audited:** `context/designs/40-auditoria-ux-studio-nle-vbr-aspect-ratio-y-sync-video.md`  
**Audit Method:** Subagente aislado `egm-codebase-details` (`7496fa29-4a05-4c80-a847-7e51381fbaec`)  
**Status:** No drift detected

---

## Verification Summary

| Component / File | Verified Symbols & Requirements | Status |
|---|---|---|
| `python_backend/db.py` | `SCHEMA_MIGRATIONS` v7 (`bit_rate_bps INTEGER`), `create_project`, `upsert_project_record`, `list_projects`, `get_project`, `update_project_bit_rate`, `relink_project` | Compliant |
| `python_backend/services/project_service.py` | `serialize_project` (`"bitRate": proj.get("bitRate")`), `restore_project_from_disk` (`bit_rate_bps=data.get("bitRate")`) | Compliant |
| `python_backend/api.py` | `get_project_detail` (reutiliza `probe_media_cached` sin doble `ffprobe`, persiste `bitRate` si falta), `create_project_from_path`, `render_flat_clip_for_candidate`, `relink_project_video` | Compliant |
| `python_backend/media.py` | `render_flat_clip` (`min_bitrate_k`, `max_bitrate_k`, `rate_control_flags` simétricos en 1-pass y 2-pass) | Compliant |
| `src/types.ts` | `Project` (`bitRate?: number \| null; bitRateMbps?: number \| null;`) | Compliant |
| `src/hooks/useMediaPipeline.ts` | `CutClipOptions` (`minBitrateK`, `maxBitrateK`), `cutCandidate` | Compliant |
| `src/styles/modals.css` | `.clip-studio-modal`, `.clip-studio-body`, `.clip-phone-stage`, `.studio-tabs-bar`, `.studio-tab-btn` (`white-space: nowrap`), `.clip-studio-timeline-dock`, `@media (max-width: 860px)` | Compliant |
| `src/components/modals/CandidatePreviewModal.tsx` | Sync multi-`<video>` (`initialSeekDoneRef`, sin `autoPlay`, `onPlaying`, drift en 3 capas), `Centrar Y` + `lockOutputAspectRatio` + `Shift`, `Probar Música`, `Original: X Mbps`, VBR Min/Objetivo/Max, Layout NLE 3 zonas + Timeline Dock | Compliant |
| `tests/test_v30_regression.py` | `TestPlan40VbrAndBitrate` | Compliant |

## Checks
- `tsc --noEmit --noUnusedLocals --noUnusedParameters`: Exit code `0`
- `vite build`: `✓ 1612 modules transformed.`, `✓ built in 2.86s`
- `python -m unittest discover -s tests -p "test_*.py" -v`: `Ran 15 tests in 2.816s` — `OK (skipped=1)`

**Conclusion:** `No drift detected`
