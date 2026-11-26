# Diseño Técnico Definitivo — Plan 40: Studio NLE v3.0 (Sync Video, Aspect Ratio + Centrado 2D, Bitrate Original / VBR Min-Max y Layout NLE)

**Estado:** APROBADO CON AUDITORÍA EGM (Listo para `PLAN APROBADO`)  
**Plan Asociado:** `context/plans/40-auditoria-ux-studio-nle-vbr-aspect-ratio-y-sync-video.md`  
**Reporte Goldfish:** `context/egm/goldfish_review_report.md`  
**Skills Aplicadas:** `ui-ux-pro-max`, `antislop`, `antislop-ui`, `senior-code-craft`

---

## 1. Resolución de Hallazgos Goldfish (Todos Cerrados)

| Hallazgo Goldfish | Resolución Definitiva |
|---|---|
| `api.renderFlatClip` inexistente | Cablear `minBitrateK?: number` y `maxBitrateK?: number` en `CutClipOptions` y `cutCandidate` dentro de `src/hooks/useMediaPipeline.ts` (`invoke("render_flat_clip_for_candidate", ...)`). |
| `isInitialSeekReady` como `useState` | Usar `initialSeekDoneRef = useRef<boolean>(false)` reseteado síncronamente cuando cambia `candidate.id` o `exportedPath`. |
| `autoPlay` aún presente en `videoRef` | Remover `autoPlay` de `videoRef` **y** de `bgVideoRef`, `camVideoRef`, `gameVideoRef`. |
| `onSeeked` no se dispara cuando `trimStart === 0` o `isExported` | Implementar fast-path en `onLoadedMetadata`: si `Math.abs(v.currentTime - targetTime) < 0.05`, marcar `initialSeekDoneRef.current = true` y llamar `.play()` coordinado; de lo contrario esperar `onSeeked`. |
| `onPlaying`, `camVideoRef`/`gameVideoRef` drift y montaje en caliente | Añadir `onPlaying` en `videoRef` para reanudar capas tras `onWaiting`; comprobar `el.readyState >= 1` en `syncBgVideo`; chequear drift `> 0.3s` también en `camVideoRef` y `gameVideoRef`; sincronizar `mappingVideoRef` únicamente cuando `activeTab === "format" && videoLayout === "gaming_split"` y drift `> 0.25s`. |
| Clamping 2D Aspect Ratio & `maxW` overflow | Calcular `effMaxW = makeEvenCoord(Math.max(0, 1080 - initialX))` y `effMaxH = makeEvenCoord(Math.max(0, 1920 - initialY))`, acotar primero `[ratioMinW, ratioMaxW]` preservando `targetRatio`, luego `makeEven` y clamping final; incluir `lockOutputAspectRatio`, `cameraCrop` y `gameplayCrop` en deps/refs; aplicar `lockOutputAspectRatio` también a los sliders `Ancho`/`Alto`. |
| `twoPass && bitrateMode !== "original"` + estado `Objetivo` | Permitir `twoPass` también en `bitrateMode === "original"` cuando `origBitrateMbps !== null` (eliminando `&& bitrateMode !== "original"`). Si `origBitrateMbps === null`, deshabilitar 2-Pass en modo `original` con aviso claro de `-crf 19`. Al editar el input **Objetivo (Mbps)** conmutar automáticamente a `bitrateMode = "custom"` y actualizar `customBitrateMbps`. |
| Persistencia completa `bit_rate_bps` + evitar doble `ffprobe` | Usar `SCHEMA_MIGRATIONS` en `db.py` (`bit_rate_bps INTEGER`); nombrar parámetro `bit_rate_bps: Optional[int] = None` en `create_project`, `upsert_project_record`, `relink_project`; inicializar `bit_rate_bps = None` antes del `try` en `create_project_from_path`; persistir/restaurar `bitRate` en `serialize_project`/`restore_project_from_disk`; reutilizar `probe.get("bitRate")` ya obtenido en `api.get_project_detail` (`L276`) sin re-ejecutar `ffprobe`; actualizar `relink_project_video`. |
| Inline `maxHeight`/`maxWidth`, `Score IA`, `Probar Música` y `768p` overflow | Remover `maxHeight`/`maxWidth` inline de `.clip-phone-stage`; dimensionar con `flex: 1 1 auto; min-height: 0; max-height: min(520px, 100%)` + `@media (max-width: 860px)`; añadir `overflow-x: auto; scrollbar-width: none; white-space: nowrap` en `.studio-tabs-bar`; mover `Score IA` y `Original / 16:9 / 9:16` al Header; mantener `Guardar Ajuste` en Footer; añadir click-to-seek en Timeline Dock; usar `{(bgmPath || bgmBlobUrl) && ...}` en `L4084` y quitar `"▶ "` duplicado. |

---

## 2. Especificación Técnica Detallada

### 2.1 Sincronización Multi-`<video>` Sin Tartamudeo (`CandidatePreviewModal.tsx`)
1. **Refs y Estado Inicial:**
   - `const initialSeekDoneRef = useRef<boolean>(false);`
   - En un `useEffect` sobre `[candidate.id, exportedPath]`: `initialSeekDoneRef.current = false;`.
2. **Atributos de `<video>`:**
   - Eliminar `autoPlay` de `videoRef`, `bgVideoRef`, `camVideoRef`, `gameVideoRef`.
   - Mantener `preload="auto"` y `playsInline` en `videoRef`, y `muted playsInline preload="auto"` en las capas secundarias.
3. **Secuencia de Arranque Determinista (`videoRef`):**
   - `startCoordinatedPlayback(v: HTMLVideoElement)`:
     - Alinea `bgVideoRef`, `camVideoRef`, `gameVideoRef` (solo los que tengan `readyState >= 1`) a `v.currentTime` y `bgmAudioRef` a `bgmStartSec + Math.max(0, v.currentTime - trimStart)`.
     - Llama `v.play().then(() => { setIsPlaying(true); syncBgm("play"); syncBgVideo("play"); }).catch(() => setIsPlaying(false))`.
   - `onLoadedMetadata` de `videoRef`:
     - `const target = isExported ? 0 : trimStart;`
     - Si `Math.abs(v.currentTime - target) < 0.05`: `initialSeekDoneRef.current = true; startCoordinatedPlayback(v);`
     - Si no: `v.currentTime = target;` (esperando `onSeeked`).
   - `onSeeked` de `videoRef`:
     - Si `!initialSeekDoneRef.current`: `initialSeekDoneRef.current = true; startCoordinatedPlayback(v);`
     - Siempre: `syncBgm("seek"); syncBgVideo("seek");`
   - `onPlaying` de `videoRef`:
     - `setIsPlaying(true); syncBgm("play"); syncBgVideo("play");`
4. **Capas Secundarias (`bgVideoRef`, `camVideoRef`, `gameVideoRef`) y Montaje en Caliente:**
   - Cada capa secundaria implementa `onLoadedMetadata={(e) => { const el = e.currentTarget; const master = videoRef.current; const t = master ? master.currentTime : (isExported ? 0 : trimStart); if (Math.abs(el.currentTime - t) > 0.05) el.currentTime = t; if (master && !master.paused) el.play().catch(() => {}); }}`.
   - En `syncBgVideo(action)`: validar `if (!el || el.readyState < 1) return;` antes de escribir `el.currentTime` o llamar `.play()`.
   - En `handleTimeUpdate`: aplicar corrección de drift (`> 0.3s`) sobre `[bgVideoRef.current, camVideoRef.current, gameVideoRef.current]`.
   - Para `mappingVideoRef`: sincronizar en `useEffect` solo cuando `activeTab === "format" && videoLayout === "gaming_split"` y `Math.abs(mappingVideoRef.current.currentTime - videoRef.current.currentTime) > 0.25`.

### 2.2 Composición 2D: `Centrar X` / `Centrar Y` + Lock de Aspect Ratio (`CandidatePreviewModal.tsx`)
1. **Estado y Controles UI:**
   - `lockOutputAspectRatio` (`boolean`, default `true`, persistido en `localStorage["autoshorts_lock_out_ar"]`).
   - Toggle candado **"Mantener Proporción"** en cabecera de `3. Composición en Lienzo 9:16` (nota tooltip: *Shift libera temporalmente*).
   - Botones en Facecam y Gameplay:
     - `Centrar X`: `makeEvenCoord((1080 - w) / 2)`
     - `Centrar Y`: `makeEvenCoord((1920 - h) / 2)`
2. **Fórmula Segura de `resize_br`:**
   - `effMaxW = makeEvenCoord(Math.max(0, 1080 - session.initialX))`
   - `effMaxH = makeEvenCoord(Math.max(0, 1920 - session.initialY))`
   - `keepAspect = (lockOutputAspectRatio && !e.shiftKey) || (!lockOutputAspectRatio && e.shiftKey)`
   - Si `!keepAspect`:
     - `newW = makeEven(Math.min(effMaxW, Math.max(Math.min(minW, effMaxW), session.initialWidth + deltaX)))`
     - `newH = makeEven(Math.min(effMaxH, Math.max(Math.min(minH, effMaxH), session.initialHeight + deltaY)))`
   - Si `keepAspect`:
     - `crop = session.target === "camera" ? cameraCrop : gameplayCrop`
     - `targetRatio = crop.height > 0 ? crop.width / crop.height : session.initialWidth / Math.max(1, session.initialHeight)`
     - `ratioMinW = Math.max(minW, minH * targetRatio)`
     - `ratioMaxW = Math.min(effMaxW, effMaxH * targetRatio)`
     - `candidateW = Math.abs(deltaX) >= Math.abs(deltaY) ? session.initialWidth + deltaX : (session.initialHeight + deltaY) * targetRatio`
     - Si `ratioMinW <= ratioMaxW`: `clampedW = Math.max(ratioMinW, Math.min(ratioMaxW, candidateW))`
     - Si `ratioMinW > ratioMaxW`: `clampedW = Math.max(2, Math.min(effMaxW, effMaxH * targetRatio))`
     - `newW = Math.min(effMaxW, Math.max(2, makeEven(clampedW)))`
     - `newH = Math.min(effMaxH, Math.max(2, makeEven(newW / targetRatio)))`
   - Incluir `lockOutputAspectRatio`, `cameraCrop` y `gameplayCrop` en las dependencias del `useEffect` de `stageDragSessionRef`.
   - En los sliders numéricos `Ancho` / `Alto`, si `lockOutputAspectRatio` está activo, ajustar el eje complementario proporcionalmente (con clamp `[2, 1080 - outX]` / `[2, 1920 - outY]`).

### 2.3 Persistencia `bit_rate_bps` + VBR Min / Target / Max (`db.py`, `project_service.py`, `api.py`, `media.py`, `useMediaPipeline.ts`, `types.ts`, `CandidatePreviewModal.tsx`)
1. **Backend SQLite (`python_backend/db.py`):**
   - Añadir nueva versión en `SCHEMA_MIGRATIONS` (`ALTER TABLE projects ADD COLUMN bit_rate_bps INTEGER`, verificando `PRAGMA table_info(projects)` por seguridad idempotente).
   - Añadir `bit_rate_bps: Optional[int] = None` a `create_project(...)` y `upsert_project_record(...)`.
   - Añadir `update_project_bit_rate(self, project_id: str, bit_rate_bps: Optional[int])`.
   - Actualizar `relink_project(..., source_bit_rate: Optional[int] = None)` para actualizar `bit_rate_bps` si se provee.
   - Exponer `"bitRate": row["bit_rate_bps"]` y `"bitRateMbps": round(row["bit_rate_bps"] / 1_000_000, 2) if row["bit_rate_bps"] else None` en `get_project`, `list_projects` y `get_project_detail`.
2. **Serialización y API (`project_service.py`, `api.py`):**
   - `serialize_project`: incluir `"bitRate": proj.get("bitRate")`.
   - `restore_project_from_disk`: pasar `bit_rate_bps=data.get("bitRate")` a `db.upsert_project_record(...)`.
   - `api.create_project_from_path`: inicializar `bit_rate_bps = None` antes del `try:` de `probe_media_cached` y pasarlo como `bit_rate_bps=bit_rate_bps` a `db.create_project(...)`.
   - `api.get_project_detail`: reutilizar `probe.get("bitRate")` ya obtenido en `L276`; si `detail["project"].get("bitRate")` es `None` y `probe.get("bitRate")` existe, persistir con `db.update_project_bit_rate(project_id, probe["bitRate"])` y reflejar `bitRate` / `bitRateMbps` en `detail["project"]`.
   - `api.relink_project_video`: al validar la nueva ruta con `probe_media_cached`, extraer `probe.get("bitRate")` y pasarlo a `db.relink_project(...)`.
3. **FFmpeg & IPC (`media.py`, `api.py`, `useMediaPipeline.ts`, `types.ts`):**
   - `src/types.ts`: agregar `bitRate?: number | null; bitRateMbps?: number | null;` a `Project`.
   - `src/hooks/useMediaPipeline.ts`: añadir `minBitrateK?: number; maxBitrateK?: number;` a `CutClipOptions` y reenviarlos en `invoke("render_flat_clip_for_candidate", { ... })`.
   - `api.py` (`render_flat_clip_for_candidate`): parsear `min_bitrate_k` y `max_bitrate_k` de forma defensiva (`int(round(float(val)))` si truthy y `> 0`) y pasarlos a `render_flat_clip(...)`.
   - `media.py` (`render_flat_clip`): añadir `min_bitrate_k: Optional[int] = None, max_bitrate_k: Optional[int] = None`. Cuando `target_bitrate_k and target_bitrate_k > 0`:
     - `eff_min_k = min(min_bitrate_k, target_bitrate_k)` si `min_bitrate_k and min_bitrate_k > 0` else `None`
     - `eff_max_k = max(max_bitrate_k, target_bitrate_k)` si `max_bitrate_k and max_bitrate_k > 0` else `int(target_bitrate_k * 1.2)`
     - `bufsize_k = max(int(eff_max_k * 1.5), int(target_bitrate_k * 2))`
     - Aplicar `["-b:v", f"{target_bitrate_k}k", "-maxrate", f"{eff_max_k}k", "-bufsize", f"{bufsize_k}k"]` (+ `["-minrate", f"{eff_min_k}k"]` si `eff_min_k`) de forma idéntica en single-pass, Pase 1 y Pase 2.
4. **UI Música & Bitrate (`CandidatePreviewModal.tsx`):**
   - En `L4084`, usar `{(bgmPath || bgmBlobUrl) && ...}` y en `L4145` corregir texto a `"Probar Música"` (sin `"▶ "` duplicado).
   - Mostrar siempre badge del original (`Original: {origBitrateMbps} Mbps` o `Original: No detectado`).
   - Permitir `twoPass` también cuando `bitrateMode === "original"` si `origBitrateMbps !== null` (eliminando `&& bitrateMode !== "original"` en `L4482`); si `origBitrateMbps === null` en modo `original`, deshabilitar 2-Pass con nota de `-crf 19`.
   - Estados `vbrMinMbps` y `vbrMaxMbps` (persistidos en `localStorage`): al activar `twoPass` con bitrate objetivo válido (`10` en `recommended`, `origBitrateMbps` en `original`, o `customBitrateMbps` en `custom`), renderizar 3 inputs numéricos (**Mínimo**, **Objetivo**, **Máximo** en Mbps) + validación/clamp en `onBlur` (`1 <= min <= target <= max <= 80`). Editar **Objetivo** conmuta a `bitrateMode = "custom"` y actualiza `customBitrateMbps`. Botón rápido *"Referencia Original"* cuando `origBitrateMbps` esté disponible.

### 2.4 Rediseño NLE 3 Zonas (`CandidatePreviewModal.tsx`, `modals.css`)
- **Modal (`.clip-studio-modal`):** `width: min(1320px, 96vw); height: 92vh; max-height: 920px;` con 4 filas flex: Header + Workspace Central (`flex: 1; min-height: 0`) + Timeline Dock + Footer.
- **Header (`.clip-studio-header`):** Título del clip, rango temporal, badge `Score IA`, selector segmentado `Original / 16:9 / 9:16` + dimensión lienzo, botón cerrar `X`.
- **Workspace Central (`.clip-studio-body`):** `grid-template-columns: minmax(380px, 44%) 1fr; min-height: 0;`
  - **Monitor Izquierdo (`.clip-studio-preview-col`):** quitar `maxHeight`/`maxWidth` inline de `.clip-phone-stage`; en CSS usar `flex: 1 1 auto; min-height: 0; max-height: min(520px, 100%); width: auto; max-width: 100%; aspect-ratio: 9 / 16` (y `16 / 9` en horizontal) + barra de transporte compacta abajo para evitar clipping en pantallas `768p–900p`.
  - **Inspector Derecho (`.clip-studio-tools-col`):** `.studio-tabs-bar` con `overflow-x: auto; scrollbar-width: none;` y `.studio-tab-btn` con `white-space: nowrap; flex-shrink: 0; padding: 6px 10px;` para etiquetas en **1 línea** (`Recorte`, `Subtítulos`, `CTA`, `Formato`, `Audio & Export`).
- **Timeline Dock Persistente (`.clip-studio-timeline-dock`):** siempre visible entre Workspace y Footer (`max-height: 145px`), con toolbar (`Dividir`, `Eliminar/Restaurar`, `Restablecer`, duración neta), pista interactiva de Jump Cuts con click-to-seek del cabezal, y pista compacta de BGM cuando haya música activa. En `@media (max-width: 860px)`, apilar cuerpo con scroll y mantener el dock compacto (`max-height: 120px`).
- **Footer (`.clip-studio-footer`):** estado de progreso / VBR, `Descartar Momento`, `Cerrar`, `Guardar Ajuste` (cuando haya `onSaveTrim`) y `Cortar y Exportar Clip`.
