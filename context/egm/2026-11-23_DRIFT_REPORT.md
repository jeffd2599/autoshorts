# Reporte de Auditoría EGM Drift

**Documento Auditado:** [context/designs/38-dimensiones-2d-canvas-916-y-fix-unconnected-audio-vbr2.md](file:///c:/Users/JEFF/Desktop/autoshorts/context/designs/38-dimensiones-2d-canvas-916-y-fix-unconnected-audio-vbr2.md)  
**Código Fuente Evaluado:**  
- [python_backend/media.py](file:///c:/Users/JEFF/Desktop/autoshorts/python_backend/media.py)  
- [src/types.ts](file:///c:/Users/JEFF/Desktop/autoshorts/src/types.ts)  
- [src/components/modals/CandidatePreviewModal.tsx](file:///c:/Users/JEFF/Desktop/autoshorts/src/components/modals/CandidatePreviewModal.tsx)  
**Fecha:** 2026-11-23  

---

## 1. Verificación de Desacoplamiento de Filtergraphs en FFmpeg (`python_backend/media.py`)

- **Estructura de Grafos Separados:**
  - `video_filter_parts: List[str] = []` (L1490) y `audio_filter_parts: List[str] = []` (L1491) inicializadas de forma estrictamente desacoplada.
  - El ensamble de filtergraphs genera `v_fc = "; ".join(video_filter_parts)` (L1644) y `full_fc = "; ".join(video_filter_parts + audio_filter_parts)` (L1645).
- **Multi-segment Concat:**
  - Video: `concat=n={N}:v=1:a=0[vjoined]` (L1500) — No emite ningún stream de audio no conectado.
  - Audio: `concat=n={N}:v=0:a=1[ajoined]` (L1509) — Filtra y concatena exclusivamente audio si `has_audio = True`.
- **Aislamiento en Pase 1 (`cmd_pass1`):**
  - Utiliza `cmd_pass1 = list(base_video_inputs)` (L1653).
  - La lista `base_video_inputs` (L1407-1421) incluye únicamente FFmpeg, flags de hebras, `-ss`, `-i source_path` y el loop de CTA badge si existe. **No incluye `-i bgm_path`** (éste reside exclusivamente en `base_inputs`, L1422-1428).
  - Pasa únicamente `-filter_complex v_fc -map [vout]` (L1655) y `-an` (L1674).
  - Cero pads de audio, cero nodos de audio (`alimiter`/`amix`) en el Pase 1. No existe riesgo de fallos de pads desconectados.
- **Pase 2 y Single-Pass:**
  - Utiliza `cmd_pass2 = list(base_inputs)` (L1690) y `full_fc` (L1692) mapeando `out_audio_map` (`[aout]` o `a_in`/`0:a?`) o `-an` en ausencia de audio.

---

## 2. Verificación de Composición 2D en `gaming_split` (`python_backend/media.py`)

- **Parámetros y Clamping Seguro:**
  - Extrae y valida `cam_out_w`, `cam_out_h`, `cam_out_x`, `cam_out_y` (L1541-1544) respetando límites mínimos de 180px y máximos de 1080x1920.
  - Extrae y valida `game_out_w`, `game_out_h`, `game_out_x`, `game_out_y` (L1548-1552) respetando límites mínimos de 360px y máximos de 1080x1920.
  - Aplica estrictamente `make_even` en anchos/altos y `make_even_coord` en coordenadas X/Y para garantizar compatibilidad con `yuv420p`.
- **Filtergraph y Overlays:**
  - Facecam escalada con Lanczos: `scale={cam_out_w}:{cam_out_h}:flags=lanczos[vcam]` (L1556).
  - Gameplay escalado con Lanczos: `scale={game_out_w}:{game_out_h}:flags=lanczos[vgame]` (L1557).
  - Superposición en orden correcto: fondo blur + gameplay en `(game_out_x, game_out_y)` generando `[vtmp]`, y luego Facecam encima en `(cam_out_x, cam_out_y)` generando `[vbase]` (L1559-1560).

---

## 3. Verificación de Tipos TypeScript (`src/types.ts`)

- `CropRect` (L189-198) define correctamente:
  ```typescript
  export type CropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
    outWidth?: number;
    outHeight?: number;
    outX?: number;
    outY?: number;
  };
  ```

---

## 4. Verificación de Frontend e Interacción 2D (`src/components/modals/CandidatePreviewModal.tsx`)

- **Estados y Persistencia:**
  - Se definen `camOutWidth`, `camOutHeight`, `camOutX`, `camOutY` (L127-173) y `gameOutWidth`, `gameOutHeight`, `gameOutX`, `gameOutY` (L175-221) inicializándose desde `localStorage.getItem("autoshorts_crop_" + detail.project.id)`.
  - Se persisten bidireccionalmente en `useEffect` (L225-241).
- **Phone Stage 9:16:**
  - Contenedor de Facecam (L1461-1473): utiliza `top: ${(camOutY / 1920) * 100}%`, `left: ${(camOutX / 1080) * 100}%`, `width: ${(camOutWidth / 1080) * 100}%`, `height: ${(camOutHeight / 1920) * 100}%`. Se eliminó completamente `right: 0`.
  - Contenedor de Gameplay (L1552-1563): utiliza `top: ${(gameOutY / 1920) * 100}%`, `left: ${(gameOutX / 1080) * 100}%`, `width: ${(gameOutWidth / 1080) * 100}%`, `height: ${(gameOutHeight / 1920) * 100}%`.
  - Manijas interactivas de redimensión `resize_br` en esquina inferior derecha para ambas capas (L1527-1544, L1617-1634).
  - Puntero global (`handleStageGlobalPointerMove`, L500-536) escala con `scaleX = 1080.0 / rect.width` y `scaleY = 1920.0 / rect.height`, clampeando coordenadas y dimensiones de forma par (`makeEvenCoord`, `makeEven`).
- **Sección 3 de Formato (Composición 2D):**
  - Panel "3. Composición en Lienzo 9:16 (Salida Renderizada 2D)" (L3730-3920).
  - Incluye sliders y campos numéricos para Ancho, Alto, Posición X y Posición Y para Facecam y Gameplay.
  - Implementa auto-clamp en tiempo real para evitar desbordamientos del lienzo (`if (camOutX + w > 1080) setCamOutX(makeEvenCoord(1080 - w))`).
  - Botones "Centrar X" para Facecam (L3761-3767) y Gameplay (L3846-3852) que centran perfectamente respecto al ancho actual.
  - Botón "Restablecer Composición" (L3735-3750).
- **Envío a Backend (`onCutCandidate`):**
  - L4471: `cameraCrop: videoLayout === "gaming_split" ? { ...cameraCrop, outWidth: camOutWidth, outHeight: camOutHeight, outX: camOutX, outY: camOutY } : undefined`
  - L4472: `gameplayCrop: videoLayout === "gaming_split" ? { ...gameplayCrop, outWidth: gameOutWidth, outHeight: gameOutHeight, outX: gameOutX, outY: gameOutY } : undefined`

---

## Conclusión

Todos los puntos definidos en el diseño técnico aprobado `context/designs/38-dimensiones-2d-canvas-916-y-fix-unconnected-audio-vbr2.md` coinciden con fidelidad total contra la implementación en el código fuente.

**Status: No drift detected**
