# Design Draft — Plan 40: Studio NLE v3.0 (Sync Video, Aspect Ratio + Centrado 2D, Bitrate Original / VBR Min-Max y Layout NLE)

**Plan Asociado:** `context/plans/40-auditoria-ux-studio-nle-vbr-aspect-ratio-y-sync-video.md`  
**Rama:** `release-v3.0`  
**Fecha:** 2026-11-24

---

## 1. Objetivos y Alcance

Resolver 4 deficiencias auditadas en el editor de momentos (`CandidatePreviewModal.tsx`) y su pipeline backend:
1. **Arranque fluido y sincronizado de reproducción** al abrir un momento (eliminando la necesidad de pausar y volver a dar Play).
2. **Composición 2D en Lienzo 9:16:** añadir `Centrar Y` junto a `Centrar X` para Facecam y Gameplay, y bloqueo de relación de aspecto al redimensionar con el mouse (`resize_br`) con opción de desbloqueo (`Shift` o toggle).
3. **Música & Bitrate:** corregir el botón duplicado `▶ ▶ Probar Música`, persistir y mostrar el **bitrate del video original (`Original: X Mbps`)**, y añadir controles de **Bitrate Mínimo / Objetivo / Máximo (Mbps)** al activar **VBR 2-Pass** (`-minrate`, `-b:v`, `-maxrate`, `-bufsize` en FFmpeg).
4. **Rediseño NLE Estilo CapCut / Premiere Pro:** reorganizar `CandidatePreviewModal.tsx` y `src/styles/modals.css` en un layout NLE de 3 zonas amplias (~95vw × 92vh), pestañas de 1 sola línea, monitor amplio y **Timeline NLE inferior persistente** (Jump Cuts + pista visual BGM).

---

## 2. Diseño Técnico por Subsistema

### 2.1 Sincronización Determinista de Arranque Multi-`<video>` (`CandidatePreviewModal.tsx`)
- **Problema raíz:** En `gaming_split`, se montan 4 `<video>` simultáneos (`videoRef`, `bgVideoRef`, `camVideoRef`, `gameVideoRef`) sobre el mismo stream HTTP `:1422`. `videoRef` (`autoPlay`) hace seek a `trimStart` en `onLoadedMetadata` e invoca `.play()` antes de completar el seek (`onSeeked`), mientras las capas secundarias arrancan desde `0.0s` generando contención de rangos HTTP y saltos de drift.
- **Diseño:**
  1. Quitar `autoPlay` de los elementos `<video>` secundarios (`bgVideoRef`, `camVideoRef`, `gameVideoRef`); el maestro único de transporte es `videoRef`.
  2. Mantener un estado `isInitialSeekReady` (inicializado en `false` por `candidate.id` / `exportedPath`).
  3. En `videoRef.onLoadedMetadata`: fijar `videoRef.current.currentTime = isExported ? 0 : trimStart` **sin** llamar `.play()` aún; pre-posicionar también `bgVideoRef`, `camVideoRef`, `gameVideoRef` y `bgmAudioRef` en sus offsets iniciales (`trimStart` / `bgmStartSec`) si ya tienen `readyState >= 1`.
  4. En `videoRef.onSeeked` (solo para el arranque inicial mientras `!isInitialSeekReady`): marcar `isInitialSeekReady = true`, alinear las capas activas que tengan `readyState >= 1` a `videoRef.current.currentTime`, y llamar a `videoRef.current.play()` una sola vez de forma coordinada.
  5. Cada `<video>` secundario (`bgVideoRef`, `camVideoRef`, `gameVideoRef`) implementará `onLoadedMetadata` para posicionarse en `videoRef.current?.currentTime ?? trimStart` (y sincronizar `play()` únicamente si `!videoRef.current?.paused`).
  6. Eliminar el `useEffect` que reasignaba `mappingVideoRef.current.currentTime = videoRef.current.currentTime` en cada `currentPlayTime` mientras el usuario no esté pausado o solo actualizarlo cuando la pestaña `Encuadre` esté activa y haya drift > `0.25s` (evitando decodificación redundante de un quinto `<video>`).

### 2.2 Composición 9:16: `Centrar X` / `Centrar Y` + Lock de Relación de Aspecto (`CandidatePreviewModal.tsx`)
- **Estado y UI:**
  - Añadir estado `lockOutputAspectRatio` (`boolean`, default `true`, persistido en `localStorage` bajo `"autoshorts_lock_out_ar"`).
  - Mostrar un toggle compacto **"Bloquear Proporción"** (candado) en la cabecera de la sección `3. Composición en Lienzo 9:16`, indicando que mantener `Shift` durante el arrastre invierte temporalmente el modo.
  - En Facecam y Gameplay, añadir el botón **`Centrar Y`** al lado de **`Centrar X`**:
    - Facecam: `Centrar X` -> `makeEvenCoord((1080 - camOutWidth) / 2)`; `Centrar Y` -> `makeEvenCoord((1920 - camOutHeight) / 2)`.
    - Gameplay: `Centrar X` -> `makeEvenCoord((1080 - gameOutWidth) / 2)`; `Centrar Y` -> `makeEvenCoord((1920 - gameOutHeight) / 2)`.
- **Geometría de `resize_br` con Aspect Ratio Lock:**
  - Proporción objetivo `targetRatio`:
    - Si `target === "camera"`: `Math.max(0.1, camCrop.width / Math.max(1, camCrop.height))` (fallback `session.initialWidth / session.initialHeight`).
    - Si `target === "gameplay"`: `Math.max(0.1, gameCrop.width / Math.max(1, gameCrop.height))` (fallback `session.initialWidth / session.initialHeight`).
  - Cuando `(lockOutputAspectRatio && !e.shiftKey) || (!lockOutputAspectRatio && e.shiftKey)`:
    - Tomar el desplazamiento dominante (`Math.abs(deltaX) >= Math.abs(deltaY)` -> calcular `rawW = initialWidth + deltaX`, `rawH = rawW / targetRatio`; si domina Y -> `rawH = initialHeight + deltaY`, `rawW = rawH * targetRatio`).
    - Aplicar clamp estricto dentro del lienzo restante `maxW = 1080 - initialX`, `maxH = 1920 - initialY` y mínimos `minW`/`minH` manteniendo `targetRatio`: si `rawW > maxW`, escalar `rawW = maxW; rawH = maxW / targetRatio`; si `rawH > maxH`, escalar `rawH = maxH; rawW = maxH * targetRatio`; luego redondear con `makeEven(...)` asegurando paridad y límites `[min, max]`.

### 2.3 Bitrate Original Persistido + Rango VBR Min / Target / Max (`db.py`, `project_service.py`, `api.py`, `media.py`, `CandidatePreviewModal.tsx`, `types.ts`)
1. **Esquema SQLite y Persistencia (`python_backend/db.py`, `services/project_service.py`, `api.py`):**
   - En `db.py` (`migrate()`): añadir migración idempotente:
     ```python
     cols = [r[1] for r in conn.execute("PRAGMA table_info(projects)").fetchall()]
     if "bit_rate_bps" not in cols:
         conn.execute("ALTER TABLE projects ADD COLUMN bit_rate_bps INTEGER")
     ```
   - `create_project(..., source_bit_rate: Optional[int] = None)` guarda `bit_rate_bps`.
   - Añadir helper `update_project_bit_rate(project_id: str, bit_rate_bps: Optional[int])`.
   - En `get_project()` y `get_project_detail()`: mapear `bitRate: row["bit_rate_bps"]` y `bitRateMbps: round(row["bit_rate_bps"] / 1_000_000, 2) if row["bit_rate_bps"] else None`.
   - En `api.py` (`create_project_from_path`, `import_existing_project` y `get_project_detail`):
     - Al crear proyecto desde ruta, pasar `bit_rate_bps=probe.get("bitRate")` a `db.create_project(...)`.
     - En `get_project_detail(project_id)`: si `project.get("bitRate")` es `None` y `sourcePath` existe en disco, ejecutar `probe_media(sourcePath)` lazy una vez, guardar `bit_rate_bps` en SQLite con `db.update_project_bit_rate(...)` y devolverlo en `detail["project"]` (garantizando retrocompatibilidad con proyectos creados antes de v3.0).
   - En `src/types.ts`: añadir `bitRate?: number | null; bitRateMbps?: number | null;` a `Project`.

2. **FFmpeg VBR 2-Pass con `-minrate` / `-b:v` / `-maxrate` (`python_backend/media.py`, `api.py`):**
   - Extender firma de `render_flat_clip(...)` con:
     - `min_bitrate_k: Optional[int] = None`
     - `max_bitrate_k: Optional[int] = None`
   - Regla de normalización y validación segura en `render_flat_clip`:
     - Si `target_bitrate_k` está definido (`> 0`):
       - `effective_min_k = min(min_bitrate_k, target_bitrate_k)` si `min_bitrate_k and min_bitrate_k > 0` else `None`.
       - `effective_max_k = max(max_bitrate_k, target_bitrate_k)` si `max_bitrate_k and max_bitrate_k > 0` else `int(target_bitrate_k * 1.2)`.
       - `bufsize_k = max(int(effective_max_k * 1.5), int(target_bitrate_k * 2))`.
       - Aplicar `["-b:v", f"{target_bitrate_k}k", "-maxrate", f"{effective_max_k}k", "-bufsize", f"{bufsize_k}k"]` + si `effective_min_k`: `["-minrate", f"{effective_min_k}k"]` tanto en **1-pass CBR/VBR** como en **ambos pases de 2-Pass** (`pass 1` y `pass 2`, manteniendo simetría exacta de parámetros exigida por `libx264`).
   - En `api.py` (`render_flat_clip_for_candidate`): leer `minBitrateK` y `maxBitrateK` de `args` y pasarlos a `render_flat_clip`.

3. **UI Música & Bitrate (`CandidatePreviewModal.tsx`):**
   - Corregir L4145: quitar el `"▶ "` manual dentro del `<span>` -> `<span>{isPlayingBgmPreview ? "Pausar" : "Probar Música"}</span>` (ya tiene `<Play size={12} />`).
   - Mostrar badge visible del bitrate original (`Original: {origBitrateMbps} Mbps` o `Original: No detectado` si falla probe) junto con sugerencia rápida cuando `twoPass` está activo.
   - Añadir estados `vbrMinMbps` y `vbrMaxMbps` (persistidos en `localStorage` con defaults inteligentes relativos al objetivo/original: p.ej. `min = Math.max(1, Math.round(target * 0.6))`, `max = Math.min(80, Math.round(target * 1.4))`).
   - Cuando `twoPass === true` y `bitrateMode !== "original"`, mostrar panel compacto de rango VBR con inputs numéricos **Mínimo (Mbps)**, **Objetivo (Mbps)** y **Máximo (Mbps)** (y botón rápido *"Usar ref. Original"* cuando `origBitrateMbps` exista), pasando `minBitrateK` y `maxBitrateK` a `api.renderFlatClip(...)`.

### 2.4 Rediseño NLE Estilo CapCut / Premiere Pro (`CandidatePreviewModal.tsx`, `src/styles/modals.css`)
- **Principios UI (`ui-ux-pro-max` + `antislop-ui`):** paleta matte oscura existente (`--bg-surface`, `--bg-surface-raised`, `--bg-panel-header`, `--border-default`), jerarquía clara por contraste y bordes de `1px`, sin gradientes neón ni blurs decorativos innecesarios.
- **Estructura NLE de 3 Zonas:**
  1. **Top Bar (`.clip-studio-header`):** Título del clip, rango original, badge `Score IA`, selector segmentado `Original / 16:9 / 9:16` + dimensión del lienzo, y botón cerrar (`X`).
  2. **Workspace Central (`.clip-studio-body` — 2 columnas amplias en modal `width: min(1320px, 96vw); height: 92vh; max-height: 920px;`):**
     - **Columna Izquierda — Monitor Program (`.clip-studio-preview-col`, ~`minmax(420px, 44%)`):**
       - Stage del video centrado y con mayor altura (`max-height: 520px` en 9:16, `width: 100%` en 16:9).
       - Barra de transporte limpia justo debajo del visor (Play/Pause, tiempo actual / duración del clip, tiempo origen, indicador de BGM activo).
     - **Columna Derecha — Inspector (`.clip-studio-tools-col`):**
       - Barra de pestañas de **1 sola línea sin wrap** (`white-space: nowrap`, iconos compactos + etiqueta corta): `Recorte`, `Subtítulos`, `CTA`, `Encuadre`, `Audio & Export`.
       - Contenido scrolleable limpio de la pestaña seleccionada.
  3. **Dock Inferior Persistente — Timeline NLE (`.clip-studio-timeline-dock`):**
     - Visible **en todo momento** sin importar la pestaña activa del Inspector (entre el Workspace Central y el Footer).
     - Contiene:
       - Barra de herramientas del timeline: `Dividir en cabezal`, `Eliminar / Restaurar fragmento`, `Restablecer cortes`, resumen de duración neta tras Jump Cuts.
       - Pista visual de Video / Segmentos Jump Cut interactivos + scrubber de cabezal sincronizado.
       - Pista visual compacta de BGM (cuando haya música cargada) mostrando nombre, volumen `%` e inicio `bgmStartSec`.
  4. **Footer de Acciones (`.clip-studio-footer`):** Progreso VBR/Exportación cuando aplique, botón `Descartar`, `Cerrar`, `Guardar Ajuste` y CTA primario `Cortar y Exportar Clip`.

---

## 3. Estrategia de Verificación (TDD + Gate)

- **Tests en `tests/test_v30_regression.py`:**
  1. Unitario: `render_flat_clip` con `two_pass=True`, `min_bitrate_k=4000`, `target_bitrate_k=8000`, `max_bitrate_k=12000` verifica `-minrate 4000k`, `-b:v 8000k`, `-maxrate 12000k`, `-bufsize 18000k` idénticos en Pase 1 y Pase 2, además de clamping si `min > target` o `max < target`.
  2. Integración: `db.py` + `project_service.py` persisten `bit_rate_bps` al crear proyecto y recuperan `bitRate` / `bitRateMbps` (incluyendo backfill lazy en `get_project_detail` si `bit_rate_bps` estaba `NULL`).
  3. E2E sintético: render FFmpeg con `two_pass=True`, `min_bitrate_k`, `target_bitrate_k`, `max_bitrate_k`.
- **Frontend:** `tsc --noEmit --noUnusedLocals --noUnusedParameters` (0 errores) y `vite build` limpio.
