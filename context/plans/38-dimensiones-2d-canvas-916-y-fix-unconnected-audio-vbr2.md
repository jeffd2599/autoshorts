# Plan 38: Composición 2D Completa en Lienzo 9:16 (Ancho, Alto, X, Y) y Fix 'alimiter unconnected' en FFmpeg Pase 1

**Estado:** COMPLETADO (Implementado, verificado 100% verde y con egm-drift-report sin desviaciones)  
**Diseño Técnico Aprobado:** `context/designs/38-dimensiones-2d-canvas-916-y-fix-unconnected-audio-vbr2.md`  
**Reporte de Auditoría EGM:** `context/egm/goldfish_review_report.md`  
**Reporte de Drift:** `context/egm/2026-11-23_DRIFT_REPORT.md` (No drift detected)  

## 1. Diagnóstico del Problema y Antecedentes
Tras las pruebas del usuario, se identificaron dos problemas críticos:

1. **Fallo Fatal en FFmpeg Pase 1 VBR (`alimiter:default has output 1 (aout) unconnected`):**
   - **Log real:**
     ```
     [fc#0 @ 00000181cf288980] Filter 'alimiter:default' has output 1 (aout) unconnected
     Error binding filtergraph inputs/outputs: Invalid argument
     ```
   - **Causa Raíz:** En `python_backend/media.py`, la variable `fc` concatenaba todos los filtros (video y audio `[aout]`). Al ejecutar el Pase 1 (`cmd_pass1`), se incluía `"-map", "[vout]"` y `"-an"` (sin audio). FFmpeg construye el filtergraph completo y, al encontrar que el pad `[aout]` generado por `alimiter` o `amix` no está conectado a ninguna salida mapeada, aborta inmediatamente con `Invalid argument`.
   - **Solución:**
     - Separar la construcción de filtros en `video_filter_parts` y `audio_filter_parts`.
     - En `cmd_pass1`: pasar únicamente el grafo de filtros de video (`v_fc`), sin ningún nodo de audio. De este modo, en el Pase 1 no existe `[aout]` y FFmpeg analiza el video a máxima velocidad sin errores de pads desconectados.
     - En `cmd_pass2` y Single Pass: combinar video y audio de manera integral (`fc = "; ".join(video_filter_parts + audio_filter_parts)`).

2. **Composición en Lienzo 9:16 Limitada a 1D (Solo Altura y Posición Y):**
   - **Problema:** En el modo `gaming_split`, el backend forzaba rígidamente `scale=1080:{cam_out_h}` y `overlay=x=0:y={cam_out_y}`, asumiendo que la Facecam y el Gameplay debían ocupar obligatoriamente todo el ancho (1080 px).
   - **Requisito del Usuario:** El streamer necesita poder achicar el cuadro de la cámara (ej. a 600px u 800px de ancho) y ubicarlo en cualquier posición horizontal $X$ y vertical $Y$ (por ejemplo, centrado arriba dejando ver el fondo blur a los costados y alrededor, con su marco neón intacto, tal como en el software de referencia de la imagen). Lo mismo aplica para el Gameplay.
   - **Solución:**
     - Expandir los parámetros de composición en `CropRect` y backend:
       - Facecam: `outWidth`, `outHeight`, `outX`, `outY`.
       - Gameplay: `outWidth`, `outHeight`, `outX`, `outY`.
     - En `python_backend/media.py`:
       `scale={cam_out_w}:{cam_out_h}:flags=lanczos`
       `overlay=x={cam_out_x}:y={cam_out_y}`
       con paridad estricta `make_even` y `make_even_coord`.
     - En `CandidatePreviewModal.tsx`:
       - Phone Stage 9:16 interactivo 2D: la manija inferior derecha redimensiona tanto el ancho (`initialWidth + deltaX`) como la altura (`initialHeight + deltaY`).
       - Arrastre interactivo 2D (`move`): mueve libremente en $X$ e $Y$.
       - En la pestaña de formato: agregar controles para Ancho, Alto, Pos X y Pos Y tanto de Facecam como de Gameplay, con botones rápidos ("Centrar", "Ancho Completo", "Restablecer").

---

## 2. Alcance de Archivos Modificados
- `python_backend/media.py`:
  - Separar `video_filter_parts` y `audio_filter_parts`.
  - En `cmd_pass1`, inyectar únicamente `video_filter_complex`.
  - Soportar `cam_out_w`, `cam_out_h`, `cam_out_x`, `cam_out_y`, `game_out_w`, `game_out_h`, `game_out_x`, `game_out_y`.
- `src/types.ts`:
  - Extender `CropRect` con `outWidth?: number; outHeight?: number; outX?: number; outY?: number;`.
- `src/components/modals/CandidatePreviewModal.tsx`:
  - Interacción bidimensional 2D completa con mouse en Phone Stage 9:16 (mover en X/Y, redimensionar ancho/alto).
  - Panel numérico y sliders completos para Ancho, Alto, Pos X, Pos Y de ambas capas con atajos de centrado horizontal.
- `scratch/test_plan38_unit.py`: Tests unitarios para el filtergraph aislado en Pase 1 y cotas 2D.

---

## 3. Paso a Paso Técnico
1. **Separación de Filtergraph en Backend (`python_backend/media.py`):**
   - Agrupar filtros en `video_filter_parts` y `audio_filter_parts`.
   - `video_fc = "; ".join(video_filter_parts) if video_filter_parts else None`.
   - `full_fc = "; ".join(video_filter_parts + audio_filter_parts) if (video_filter_parts or audio_filter_parts) else None`.
   - `cmd_pass1` utiliza `video_fc` y `-an`.
   - `cmd_pass2` utiliza `full_fc` y `-map [aout]`.
2. **Dimensiones 2D de Facecam y Gameplay (`media.py`):**
   - Extraer `outWidth`, `outHeight`, `outX`, `outY` de `camera_crop` y `gameplay_crop`.
   - Aplicar `make_even` y `make_even_coord` con clamping defensivo en 1080x1920.
3. **Frontend 2D en Phone Stage (`CandidatePreviewModal.tsx`):**
   - Actualizar `stageDragSessionRef` para almacenar `initialOutWidth`, `initialOutHeight`, `initialOutX`, `initialOutY`, `startX`, `startY`.
   - En `move`: actualizar tanto X como Y con `scaleX = 1080 / rect.width` y `scaleY = 1920 / rect.height`.
   - En `resize_br`: actualizar tanto Width como Height con `scaleX` y `scaleY`.
   - Actualizar estilos inline de Facecam y Gameplay en Phone Stage:
     `left: (outX / 1080) * 100%`, `top: (outY / 1920) * 100%`, `width: (outWidth / 1080) * 100%`, `height: (outHeight / 1920) * 100%`.
   - Añadir sliders/inputs de Ancho y Posición X para Facecam y Gameplay en la sección 3 de formato.
4. **Verificación y Compilación:**
   - Validar con TDD en `scratch/test_plan38_unit.py`.
   - Compilar frontend con `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build`.
   - Correr suite de tests de Python.

---

## 4. Riesgos e Implicaciones
- **Desbordamiento de Lienzo:** Al permitir mover y redimensionar en X e Y, debemos asegurar `outX + outWidth <= 1080` y `outY + outHeight <= 1920` para evitar que FFmpeg lance errores por recorte fuera del canvas.
- **Rendimiento:** Separar el filtergraph en el Pase 1 es más rápido y elimina el 100% de los fallos de pads desconectados.

---

## 5. Estrategia de Testing
- **Unit Testing:**
  - Test de aislamiento de filtergraph: verificar que `cmd_pass1` no contenga `alimiter` ni `[aout]`.
  - Test de cotas 2D: verificar que las coordenadas y dimensiones 2D generen siempre números pares y respeten `[0, 1080]` y `[0, 1920]`.
- **Integración y E2E:**
  - Verificación de compilación TypeScript y Vite.
  - Validación con `AutoShorts.bat`.

---

## 6. 🚦 Recomendación EGM (Semáforo de Complejidad y Tokens)
🔴 **Tarea Compleja / Arquitectónica (Sí requiere EGM):**  
Involucra la lógica del motor de renderizado de FFmpeg (filtergraph acoplado vs desacoplado en 2 pases) y la matemática 2D en dos dimensiones de composición vertical con persistencia en proyecto y frontend interactivo.

**Recomendación:** Responder **`PLAN APROBADO - EGM`** para auditar a fondo con subagentes Goldfish y generar el Drift Report antes de programar, o **`PLAN APROBADO`** si prefieres que pase directamente a implementar el código y los tests.
