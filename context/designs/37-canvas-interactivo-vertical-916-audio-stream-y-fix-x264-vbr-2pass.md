# Diseño Técnico Aprobado: AutoShorts v3.0 (Plan 37)
## Lienzo 9:16 Interactivo con Mouse, Fix Fatal x264 VBR 2-Pass y Audio Drag & Drop

**Identificador:** `context/designs/37-canvas-interactivo-vertical-916-audio-stream-y-fix-x264-vbr-2pass.md`  
**Plan Asociado:** `context/plans/37-canvas-interactivo-vertical-916-audio-stream-y-fix-x264-vbr-2pass.md`  
**Estado:** APROBADO TRAS AUDITORÍA EGM GOLDFISH  
**Fecha:** 2026-11-23  

---

## 1. Arquitectura de Interacción con Mouse en Phone Stage 9:16

### 1.1 Modelo de Datos y Estados en Frontend (`CandidatePreviewModal.tsx`)
```typescript
interface StageDragSession {
  target: "camera" | "gameplay";
  mode: "move" | "resize_br";
  startX: number;
  startY: number;
  initialHeight: number;
  initialY: number;
}
```

### 1.2 Ciclo de Vida de Punteros y Escala
- **Captura:** `(e.target as HTMLElement).setPointerCapture(e.pointerId)`.
- **Aislamiento de Clics:** `e.stopPropagation()` en `onPointerDown` y `onClick` de las capas de Facecam y Gameplay para que manipularlas no pause la reproducción del video vertical.
- **Conversión de Coordenadas:**
  - Altura del Phone Stage en DOM: `h_dom = phoneStageRef.current.clientHeight`.
  - Factor de escala vertical: `scaleY = 1920.0 / h_dom`.
  - En desplazamiento (`move`):
    - `deltaY = (e.clientY - startY) * scaleY`
    - `newY = Math.max(0, Math.min(1920 - initialHeight, initialY + deltaY))`
    - `setCamOutY(makeEvenCoord(newY))` o `setGameOutY(makeEvenCoord(newY))`
  - En redimensión (`resize_br`):
    - `deltaY = (e.clientY - startY) * scaleY`
    - Para Facecam: `newH = Math.max(180, Math.min(720, initialHeight + deltaY))`
    - Para Gameplay: `newH = Math.max(360, Math.min(1920 - initialY, initialHeight + deltaY))`
    - `setCamOutHeight(makeEven(newH))` o `setGameOutHeight(makeEven(newH))`

### 1.3 Manijas y Feedback Visual
- Capa seleccionada: borde perimetral acentuado (`#f43f5e` para Facecam, `#3b82f6` para Gameplay).
- Manija de redimensión: recuadro interactivo de 14x14px en la esquina inferior derecha con `cursor: nwse-resize` y fondo blanco con sombra contrastada.
- Badge flotante en esquina superior derecha mostrando resolución exacta en escala 1080x1920 (ej. `1080x420px (Y: 120)`).

---

## 2. Corrección de Parámetros libx264 en VBR 2-Pass (`python_backend/media.py`)

### 2.1 Causa Raíz
x264 rechaza codificar en el Pase 2 si la tasa de ponderación P (`weightp`) difiere de la calculada en el análisis del Pase 1. Al usar `-preset veryfast` en Pase 1 (`weightp=1`) y `-preset medium` en Pase 2 (`weightp=2`), se genera un error fatal en FFmpeg: `[libx264] different weightp setting than first pass (2 vs 1)`.

### 2.2 Especificación FFmpeg
- En `cmd_pass1`:
  ```python
  "-c:v", "libx264",
  "-preset", "medium",
  "-threads", "0",
  "-b:v", f"{target_bitrate_k}k",
  "-pass", "1",
  "-passlogfile", str(pass_logfile),
  "-an",
  "-f", "null",
  os.devnull
  ```
- En `cmd_pass2`:
  ```python
  "-c:v", "libx264",
  "-preset", "medium",
  "-threads", "0",
  "-b:v", f"{target_bitrate_k}k",
  "-pass", "2",
  "-passlogfile", str(pass_logfile),
  "-map", out_audio_map,
  "-c:a", "aac",
  "-b:a", "192k",
  "-movflags", "+faststart",
  "-t", dur_str,
  str(output_path)
  ```

---

## 3. Compatibilidad Universal en Logging (`python_backend/logger.py`)

### 3.1 Especificación
En la clase `SystemLogBuffer`:
```python
class SystemLogBuffer:
    ...
    def push(self, raw_line: str, level: str = "INFO"):
        ...
    
    append = push  # Alias para compatibilidad universal con api.py
```

---

## 4. Gestión Robusta de Música (BGM) en WebView2 y Guardado en Proyecto

### 4.1 Preescucha Inmediata en Frontend (`CandidatePreviewModal.tsx`)
- Al soltar el archivo de audio:
  ```typescript
  const file = e.dataTransfer.files[0];
  const blobUrl = URL.createObjectURL(file);
  setBgmBlobUrl(blobUrl);
  setBgmFileName(file.name);
  ```
- El reproductor de audio `<audio>` utiliza:
  ```tsx
  <audio
    ref={bgmAudioRef}
    src={bgmBlobUrl || (bgmPath ? `http://127.0.0.1:1422/stream?file=${encodeURIComponent(bgmPath)}` : undefined)}
    preload="auto"
  />
  ```

### 4.2 Guardado en Disco mediante RPC Backend (`python_backend/api.py`)
- Endpoint RPC: `save_project_bgm(args)`:
  - Extrae `projectId`, `fileName`, y `dataBase64`.
  - Limpia el prefijo MIME `data:audio/...;base64,`.
  - Sanitiza el nombre de archivo contra path traversal y caracteres reservados de Windows.
  - Almacena el binario en `{project_dir}/bgm/{safe_fileName}`.
  - Devuelve `{"success": True, "path": str(saved_path.resolve())}`.
- El frontend actualiza `setBgmPath(res.path)` asegurando que FFmpeg tenga la ruta física local absoluta para la exportación final.
