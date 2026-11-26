# Goldfish Review Report — Plan 40 (`design_draft.md`)

**Fecha:** 2026-11-24  
**Borrador Auditado:** `context/egm/design_draft.md`  
**Auditores Aislados (Memoria Cero):**
- `egm-codebase-details` (`b43b3510-f40f-4918-b798-85bd88141c66`)
- `egm-implementation-readiness` (`c5a1cade-a533-4973-af84-107d0f97deae`)

---

## Resumen Consolidado de Hallazgos

### BLOCKERS (7 consolidados)
1. **`api.renderFlatClip` inexistente & cableado faltante en `useMediaPipeline.ts`:** `CandidatePreviewModal.tsx` (`L4444-4483`) invoca `onCutCandidate` -> `cutCandidate` en `src/hooks/useMediaPipeline.ts` (`L14-46`, `L626-660`) -> `invoke("render_flat_clip_for_candidate", ...)`. Deben extenderse `CutClipOptions` y `cutCandidate` con `minBitrateK?: number` y `maxBitrateK?: number`.
2. **`isInitialSeekReady` como `useState` vs `useRef`:** Con `useState`, los callbacks de `<video>` pueden capturar closures obsoletos o leer estado previo al `useEffect` de reset. Debe usarse `useRef<boolean>(false)` reseteado síncronamente al cambiar `candidate.id` / `exportedPath`.
3. **`autoPlay` presente en el maestro `videoRef` (`L1395`):** Mantener `autoPlay` en `videoRef` hace que WebView2 empiece en `0.0s` antes de completar el seek a `trimStart`. Debe eliminarse `autoPlay` de `videoRef` y de todas las capas secundarias.
4. **No disparo de `onSeeked` cuando `isExported === true` o `trimStart === 0`:** En HTML5 `<video>`, `currentTime` inicia en `0`; asignar `0` no emite `seeked`. Se requiere fast-path (`Math.abs(v.currentTime - targetTime) < 0.05`) para marcar listo e iniciar `.play()`.
5. **Matemática incompleta de clamping 2D en `resize_br` (`CandidatePreviewModal.tsx` `L519-534`):** `maxW = Math.max(minW, 1080 - initialX)` permite overflow del lienzo y el clamp post-cálculo rompe `targetRatio` cuando `rawW < minW` o `rawH < minH`. Debe calcularse primero el rango válido `[ratioMinW, ratioMaxW]` dentro de `effMaxW = 1080 - initialX` y `effMaxH = 1920 - initialY`.
6. **Contradicción `twoPass && bitrateMode !== "original"` (`L4482`) e input `Objetivo (Mbps)` sin estado:** `L4482` silencia `twoPass` en `original` y el input `Objetivo` no definía a qué estado (`customBitrateMbps` + `bitrateMode`) enlaza cuando está en `recommended` u `original`.
7. **Mismatch de kwargs en `db.create_project` + skip en `restore_project_from_disk` / `UnboundLocalError` (`api.py` `L315-366`):** El borrador definía `source_bit_rate` pero llamaba `bit_rate_bps=`, no inicializaba `bit_rate_bps = None` antes del `try/except`, y omitía `restore_project_from_disk` / `import_existing_project` / `relink_project_video`.

### MAJORS (8 consolidados)
8. **Falta `onPlaying` tras `onWaiting` y drift check en `camVideoRef`/`gameVideoRef` (`L1046-1051`, `L1412-1414`):** Tras buffering (`waiting`), `onPlay` no vuelve a dispararse; se requiere `onPlaying` y verificar `el.readyState >= 1` en `syncBgVideo` + drift check en `camVideoRef` y `gameVideoRef` + manejo de montaje condicional en caliente (`bgVideoRef`/`camVideoRef`/`gameVideoRef`).
9. **Persistencia completa de `bit_rate_bps` (`db.py`, `project_service.py`, `api.py`):** Faltaba actualizar `upsert_project_record`, `serialize_project`, `restore_project_from_disk`, `list_projects` y `relink_project` / `relink_project_video`, además de usar `SCHEMA_MIGRATIONS` en `db.py` (`L17-24, 139-151`) en vez de `PRAGMA` ad-hoc.
10. **Llamada redundante a `probe_media` en `api.get_project_detail` (`L276`):** `get_project_detail` ya ejecuta `probe = probe_media_cached(sp)` en `L276`; debe reutilizarse ese `probe.get("bitRate")` para backfill en SQLite sin lanzar otro `ffprobe`.
11. **Dependencias del `useEffect` de `resize_br` (`L547`):** Debe incluir `lockOutputAspectRatio`, `cameraCrop` y `gameplayCrop` (o refs) para evitar stale closures durante el arrastre.
12. **Validación UI/Backend de VBR Min/Max (`NaN`, `0`, `min > target`):** Faltaba especificar clamp numérico en `onBlur`/submit y parseo seguro `int(round(float(val)))` en `api.py:991`.
13. **Estilos inline `maxHeight`/`maxWidth` en `.clip-phone-stage` (`L1383-1384`) y overflow vertical en `768p–900p`:** Los inline styles pisan `modals.css`; un `max-height: 520px` fijo junto al dock de timeline desbordará `.clip-studio-preview-col` en pantallas `1366x768`. Requiere quitar inline sizes y usar `flex: 1 1 auto; min-height: 0; max-height: min(520px, 100%);` + reglas responsive `< 860px`.
14. **Overflow de `.studio-tabs-bar` con `white-space: nowrap`:** Necesita `overflow-x: auto; scrollbar-width: none;` y padding compacto.
15. **Guardia `{(bgmPath || bgmBlobUrl) && ...}` en `L4084`:** Actualmente `L4084` chequea solo `bgmPath`, ocultando el timeline/botón `Probar Música` si se usa blob URL antes de finalizar el guardado en disco.

### MINORS (4 consolidados)
16. **Regla determinista para `mappingVideoRef` (`L549-553`):** Sincronizar solo cuando `activeTab === "format" && videoLayout === "gaming_split"` y drift `> 0.25s` (tab interno `"format"` llamado `"Formato"`).
17. **Alcance de `lockOutputAspectRatio` en sliders numéricos (`L3773-3875`):** Definir si los sliders `Ancho`/`Alto` también mantienen proporción cuando el candado está activo.
18. **Ubicación exacta de `Score IA`, `Original / 16:9 / 9:16` y `Guardar Ajuste` (`L1338-1373`, `L4280-4310`):** Clarificar reubicación limpia entre Header y Footer.
19. **Click-to-seek en la pista de segmentos del Timeline Dock NLE:** Permitir click/scrubbing en el Timeline persistente para mover el playhead.
