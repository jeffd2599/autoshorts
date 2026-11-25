# Especificación Técnica Aprobada: AutoShorts v3.0
## Composición Vertical Libre 9:16, Audio BGM en Vivo y Optimización VBR 2-Pass

**Documento:** `context/designs/36-composicion-vertical-libre-bgm-audio-fix-y-optimizacion-vbr-2pass.md`  
**Fecha:** 2026-11-23  
**Estado:** APROBADO (Post-Auditoría EGM)  
**Ref. Decisión:** `D-036`  

---

## 1. Composición en Lienzo 9:16 (Facecam & Gameplay)

### 1.1 Controles y Tipos en Frontend (`src/types.ts` & `CandidatePreviewModal.tsx`)
1. **Extensión de `CropRect`:**
   ```typescript
   export type CropRect = {
     x: number;
     y: number;
     width: number;
     height: number;
     outHeight?: number;
     outY?: number;
   };
   ```
2. **Estados en `CandidatePreviewModal.tsx`:**
   - `camOutHeight`: Slider (180px - 720px, defecto 340px).
   - `camOutY`: Slider (0px - 600px, defecto 0px).
   - `gameOutHeight`: Slider (360px - 1400px, defecto 700px o calculado proporcional).
   - `gameOutY`: Slider (0px - 1400px, defecto centrado debajo de la cámara).
   - Botón "Restablecer Composición" y presets de recorte 16:9 ("16:9 Completo", "Centrar Recuadro").
3. **Phone Stage (Reproductor 9:16 en Vivo):**
   - Facecam container: `height: ${(camOutHeight / 1920) * 100}%`, `top: ${(camOutY / 1920) * 100}%`, `zIndex: 4`.
   - Gameplay container: `height: ${(gameOutHeight / 1920) * 100}%`, `top: ${(gameOutY / 1920) * 100}%`, `zIndex: 3`.

### 1.2 Filtergraph en Backend (`python_backend/media.py`)
1. **Helpers de Coordenadas y Dimensiones:**
   - `make_even(val)`: para dimensiones `max(2, (int(round(float(val))) // 2) * 2)`.
   - `make_even_coord(val)`: para posiciones $X, Y$ `max(0, (int(round(float(val))) // 2) * 2)`.
2. **Cálculo de Variables:**
   ```python
   default_cam_h = min(make_even((ch / max(1, cw)) * 1080), 720)
   cam_out_h = make_even(min(720, max(180, c_crop.get("outHeight", default_cam_h))))
   cam_out_y = make_even_coord(max(0, min(1920 - cam_out_h, c_crop.get("outY", 0))))

   max_game_h = 1920 - cam_out_h
   default_game_h = min(make_even((gh / max(1, gw)) * 1080), max_game_h)
   game_out_h = make_even(min(1920, max(360, g_crop.get("outHeight", default_game_h))))
   default_game_y = max(cam_out_y + cam_out_h, (1920 - game_out_h) // 2)
   game_out_y = make_even_coord(max(0, min(1920 - game_out_h, g_crop.get("outY", default_game_y))))
   ```
3. **Orden de Superposición Invertido (Cámara al Frente):**
   ```python
   filter_parts.append(f"{v_in}split=3[vbg_raw][vcam_raw][vgame_raw]")
   filter_parts.append("[vbg_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear[vbg]")
   filter_parts.append(f"[vcam_raw]crop=w={cw}:h={ch}:x={cx}:y={cy},scale=1080:{cam_out_h}:flags=lanczos[vcam]")
   filter_parts.append(f"[vgame_raw]crop=w={gw}:h={gh}:x={gx}:y={gy},scale=1080:{game_out_h}:flags=lanczos[vgame]")
   filter_parts.append(f"[vbg][vgame]overlay=x=0:y={game_out_y}[vtmp]")
   filter_parts.append(f"[vtmp][vcam]overlay=x=0:y={cam_out_y}[vbase]")
   ```

---

## 2. BGM Audio en Tiempo Real (Tag Nativo en DOM y Streaming)

1. **Tag en JSX (`CandidatePreviewModal.tsx`):**
   ```tsx
   {bgmPath && (
     <audio
       ref={bgmAudioRef}
       src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(bgmPath)}`}
       preload="auto"
       loop
       onLoadedMetadata={() => {
         if (bgmAudioRef.current && videoRef.current) {
           const offset = Math.max(0, videoRef.current.currentTime - trimStart);
           bgmAudioRef.current.currentTime = bgmStartSec + offset;
           bgmAudioRef.current.volume = Math.max(0, Math.min(1, bgmVolume / 100));
         }
       }}
     />
   )}
   ```
2. **Controles Reactivos en Tiempo Real:**
   - Slider de volumen: actualiza inmediatamente `bgmAudioRef.current.volume`.
   - Slider de inicio: actualiza inmediatamente `bgmAudioRef.current.currentTime`.
   - Botón "▶ Probar Música" / "⏸ Pausar Música" para preescucha independiente.
   - Si `isExported = true`, pausar de inmediato el `<audio>`.
3. **MIME Types en `python_backend/stream_server.py`:**
   - Registrar explícitamente `audio/mpeg`, `audio/wav`, `audio/aac`, `audio/mp4`.

---

## 3. Corrección y Aceleración VBR 2-Pass

1. **Inyección de Duración `-t` en Pase 1 (`python_backend/media.py`):**
   - Se agrega obligatoriamente `"-t", dur_str` antes de `-pass 1` en `cmd_pass1`.
2. **Dispositivo Nulo Estándar:**
   - `"-f", "null", os.devnull` (resuelve a `NUL` en Windows).
3. **Preset Asimétrico Acelerado:**
   - Pase 1: `"-preset", "veryfast"` (análisis estadístico 3x más rápido).
   - Pase 2: `"-preset", "medium"` (codificación de alta fidelidad con `passlogfile`).
4. **Watchdog contra Busy-Loop en `_run_ffmpeg_monitored`:**
   - Si `not line and proc.poll() is None`, ejecutar `time.sleep(0.01)`.
