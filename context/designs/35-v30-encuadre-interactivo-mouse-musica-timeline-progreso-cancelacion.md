# Especificación Técnica Aprobada: AutoShorts v3.0
## Gaming Split Interactivo, Fondo Blur Integral, BGM en Vivo, Progreso y Cancelación Atómica

**Documento:** `context/designs/35-v30-encuadre-interactivo-mouse-musica-timeline-progreso-cancelacion.md`  
**Fecha:** 2026-11-23  
**Estado:** APROBADO (Post-Auditoría EGM)  
**Ref. Decisión:** `D-035`

---

## 1. Mapeo Gaming Split con Fondo Blur Integral (Layout 9:16)

### 1.1 Estructura Visual del Lienzo 1080x1920
Para videos gaming horizontales (shooters, streams de Twitch/Kick/YouTube), el lienzo vertical 9:16 se compone de 3 capas obligatorias:
1. **Capa 0 (Fondo Desenfoque Cinemático Completo):**
   - El video completo horizontal se reescala para llenar los 1080x1920 completos con desenfoque bokeh rápido (downscale a 270x480 + `boxblur=12:2` + upscale bilineal a 1080x1920). Elimina totalmente las barras negras.
2. **Capa 1 (Facecam / Cámara Streamer - Superior):**
   - Recorte de la cámara (`cameraCrop`: `x, y, width, height`) reescalado a ancho 1080px.
   - Posición vertical: `cam_y` (por defecto `y = 0`).
   - Altura: `cam_h = min(make_even((ch / max(1, cw)) * 1080), 720)`.
3. **Capa 2 (Gameplay Principal - Centro):**
   - Recorte del gameplay (`gameplayCrop`: `x, y, width, height`) reescalado a ancho 1080px.
   - Posición vertical: `game_y` (por defecto centrado debajo de la cámara o centrado en el espacio restante).
   - Altura: `game_h = min(make_even((gh / max(1, gw)) * 1080), 1920 - cam_h)`.
4. **Capa 3 (Insignia CTA Follow / Like - Inferior):**
   - Posicionada sobre el fondo difuminado en la parte inferior (`y = 1550` aprox.).

### 1.2 Filtergraph de FFmpeg (`python_backend/media.py`)
```python
# vbg: fondo blur completo
filter_parts.append(f"{v_in}split=3[vbg_raw][vcam_raw][vgame_raw]")
filter_parts.append("[vbg_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear[vbg]")

# vcam: Facecam recortada y escalada a 1080 de ancho
filter_parts.append(f"[vcam_raw]crop={cw}:{ch}:{cx}:{cy},scale=1080:{cam_h}:flags=lanczos[vcam]")

# vgame: Gameplay recortado y escalado a 1080 de ancho
filter_parts.append(f"[vgame_raw]crop={gw}:{gh}:{gx}:{gy},scale=1080:{game_h}:flags=lanczos[vgame]")

# Superposición en capas
filter_parts.append(f"[vbg][vcam]overlay=x=0:y={cam_y}[vlayer1]")
filter_parts.append(f"[vlayer1][vgame]overlay=x=0:y={game_y}[vbase]")
```

### 1.3 Control Interactivo de Encuadre con Mouse (Frontend)
- En `CandidatePreviewModal.tsx`, cuando `layout === "gaming_split"`:
  - Se proyecta el encuadre interactivo calculando el rectángulo real del `<video>` (`getRenderedVideoRect`):
    - `renderedW = video.clientWidth`, `renderedH = video.clientHeight`
    - `scaleX = nativeW / renderedW`, `scaleY = nativeH / renderedH`
  - Dos recuadros arrastrables e interactivos (Cámara en azul cian, Gameplay en verde neón):
    - Arrastre con mouse (`mousedown` -> `mousemove` -> `mouseup`).
    - Inputs numéricos sincronizados bidireccionalmente.
    - Clamping defensivo dentro de los límites del video nativo.
  - El fondo de la vista previa vertical refleja el desenfoque bokeh en tiempo real.

---

## 2. BGM en Tiempo Real y Selector de Inicio (`bgm_start_sec`)

### 2.1 Backend (`python_backend/media.py` y `python_backend/api.py`)
- Parámetro añadido: `bgm_start_sec: float = 0.0`.
- Grafo de audio:
  ```python
  if valid_bgm:
      filter_parts.append(
          f"[{bgm_idx}:a]atrim=start={bgm_start_sec:.3f},asetpts=PTS-STARTPTS,volume={bgm_vol:.2f}[bgm]"
      )
  ```
  Esto preserva el bucle `-stream_loop -1` sin truncamiento ni desincronización de PTS.

### 2.2 Sincronización en Frontend (`CandidatePreviewModal.tsx`)
- Elemento `<audio ref={bgmAudioRef}>` conectado a `bgmPath` (vía `http://127.0.0.1:1422/media?path=...` o blob).
- Sincronización continua:
  - `onPlay`: `bgm.currentTime = bgmStartSec + (video.currentTime - trimStart) * video.playbackRate; bgm.play();`
  - `onPause`: `bgm.pause()`
  - `onWaiting`: `bgm.pause()`
  - `onSeeked`: `bgm.currentTime = bgmStartSec + Math.max(0, video.currentTime - trimStart)`
  - Control de deriva (drift check) en `onTimeUpdate` (si desvío > 0.25s, reajustar).
  - Al desmontar el modal o al exportar (`isExported`), pausar inmediatamente el audio.
- Control visual: Slider "Punto de Inicio de Música (segundos)" y preescucha en vivo.

---

## 3. Línea de Progreso Porcentual y Cancelación Atómica de Renderizado

### 3.1 Backend: Monitoreo con `-progress pipe:1`
- Firma de `render_flat_clip`: acepta `progress_callback: Optional[Callable[[int, str], None]] = None`.
- Inyección de `-progress`, `pipe:1` en el comando FFmpeg.
- Subproceso gestionado vía `subprocess.Popen`:
  - `stdout=subprocess.PIPE` (modo texto, `encoding="utf-8", errors="replace"`).
  - `stderr=subprocess.PIPE` con hilo daemon consumidor para evitar deadlocks de buffer en Windows.
  - Parseo en vivo de `out_time_us=` / `out_time_ms=`.
  - Ponderación de porcentaje:
    - 1 Pase: `percent = min(99, max(0, int((out_sec / dur_sec) * 100)))`
    - 2 Pases: Pase 1 (`0% - 45%`), Pase 2 (`45% - 99%`).
    - Al finalizar con éxito: `100%`.

### 3.2 Cancelación Atómica en Windows
- Variable protegida: `_active_render_lock = threading.Lock()`, `_active_render_process: Optional[subprocess.Popen] = None`.
- Función `cancel_active_render() -> bool`:
  1. Con el lock adquirido, si `_active_render_process is None` o `proc.poll() is not None`, retornar `False`.
  2. Ejecutar `subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, **get_no_window_kwargs())`.
  3. `proc.kill()` como fallback.
  4. Esperar salida `proc.wait(timeout=2.0)`.
  5. Eliminar archivo de salida incompleto defensivamente.
  6. Resetear `_active_render_process = None`.
- Método RPC en `python_backend/api.py`: `cancel_render(_args=None) -> bool`.

### 3.3 Barra de Progreso y UX de Cancelación en Frontend
- Evento PyWebView emitido: `render-progress` con payload `{ candidateId: string, percent: number, stage: string }`.
- En `CandidatePreviewModal.tsx`:
  - Barra de progreso porcentual visible en el footer (`0% - 100%`) con efecto de brillo y texto dinámico (ej. `Renderizando clip (48% - Codificando video)...`).
  - Botón visible `Cancelar Exportación` (rojo/peligro):
    - Al presionar, invoca `invoke("cancel_render")`.
    - Activa `isCancellingRef.current = true` para evitar alertas de error espurias en el bloque `catch`.
  - Listener `window.addEventListener("beforeunload", ...)` que invoca `cancel_render` si se cierra la ventana durante un render.
