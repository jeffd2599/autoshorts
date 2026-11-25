# Diseño Técnico Definitivo: AutoShorts v3.0 (Plan 38)
## Composición 2D Completa en Lienzo 9:16 (Ancho, Alto, X, Y) y Desacoplamiento de Filtergraphs en FFmpeg

**Identificador:** `context/designs/38-dimensiones-2d-canvas-916-y-fix-unconnected-audio-vbr2.md`  
**Plan Asociado:** `context/plans/38-dimensiones-2d-canvas-916-y-fix-unconnected-audio-vbr2.md`  
**Estado:** APROBADO TRAS AUDITORÍA EGM GOLDFISH  
**Fecha:** 2026-11-23  

---

## 1. Desacoplamiento Puro de Filtergraphs en `python_backend/media.py`

### 1.1 Estructura de Filtros
- `video_filter_parts: List[str] = []`
- `audio_filter_parts: List[str] = []`

### 1.2 Multi-segmentos (`has_multi_segment = True`)
```python
if has_multi_segment:
    N = len(sorted_ranges)
    for i, r in enumerate(sorted_ranges):
        rs = max(0.0, float(r.get("start", 0.0)) - first_start)
        re_ = max(rs + 0.05, float(r.get("end", 0.0)) - first_start)
        video_filter_parts.append(f"[0:v]trim=start={rs:.3f}:end={re_:.3f},setpts=PTS-STARTPTS[vseg{i}]")
    vconcat_in = "".join(f"[vseg{i}]" for i in range(N))
    video_filter_parts.append(f"{vconcat_in}concat=n={N}:v=1:a=0[vjoined]")
    v_in = "[vjoined]"

    if has_audio:
        for i, r in enumerate(sorted_ranges):
            rs = max(0.0, float(r.get("start", 0.0)) - first_start)
            re_ = max(rs + 0.05, float(r.get("end", 0.0)) - first_start)
            audio_filter_parts.append(f"[0:a]atrim=start={rs:.3f}:end={re_:.3f},asetpts=PTS-STARTPTS[aseg{i}]")
        aconcat_in = "".join(f"[aseg{i}]" for i in range(N))
        audio_filter_parts.append(f"{aconcat_in}concat=n={N}:v=0:a=1[ajoined]")
        a_in = "[ajoined]"
    else:
        a_in = None
else:
    v_in = "[0:v]"
    a_in = None
```

### 1.3 Composición 2D Gaming Split
```python
# Facecam 2D
cam_out_w = make_even(min(1080, max(180, c_crop.get("outWidth", 1080))))
cam_out_h = make_even(min(1920, max(180, c_crop.get("outHeight", default_cam_h))))
cam_out_x = make_even_coord(max(0, min(1080 - cam_out_w, c_crop.get("outX", (1080 - cam_out_w) // 2))))
cam_out_y = make_even_coord(max(0, min(1920 - cam_out_h, c_crop.get("outY", 0))))

# Gameplay 2D
game_out_w = make_even(min(1080, max(360, g_crop.get("outWidth", 1080))))
game_out_h = make_even(min(1920, max(360, g_crop.get("outHeight", default_game_h))))
game_out_x = make_even_coord(max(0, min(1080 - game_out_w, g_crop.get("outX", 0))))
game_out_y = make_even_coord(max(0, min(1920 - game_out_h, g_crop.get("outY", default_game_y))))

video_filter_parts.append(f"{v_in}split=3[vbg_raw][vcam_raw][vgame_raw]")
video_filter_parts.append("[vbg_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear[vbg]")
video_filter_parts.append(f"[vcam_raw]crop=w={cw}:h={ch}:x={cx}:y={cy},scale={cam_out_w}:{cam_out_h}:flags=lanczos[vcam]")
video_filter_parts.append(f"[vgame_raw]crop=w={gw}:h={gh}:x={gx}:y={gy},scale={game_out_w}:{game_out_h}:flags=lanczos[vgame]")
video_filter_parts.append(f"[vbg][vgame]overlay=x={game_out_x}:y={game_out_y}[vtmp]")
video_filter_parts.append(f"[vtmp][vcam]overlay=x={cam_out_x}:y={cam_out_y}[vbase]")
```

### 1.4 Mezcla de Audio y Mapeo Dinámico
```python
out_audio_map = None
if valid_bgm:
    bgm_vol = max(0.0, min(float(bgm_volume), 1.0))
    bgm_trim = f"atrim=start={bgm_start_sec:.3f},asetpts=PTS-STARTPTS," if bgm_start_sec > 0 else ""
    if has_audio:
        vocal_track = a_in if a_in else "[0:a]"
        audio_filter_parts.append(
            f"{vocal_track}volume=1.0[vocal]; "
            f"[{bgm_idx}:a]{bgm_trim}volume={bgm_vol:.2f}[bgm]; "
            f"[vocal][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix_raw]; "
            f"[amix_raw]alimiter=limit=0.95:attack=5:release=50:asc=1[aout]"
        )
        out_audio_map = "[aout]"
    else:
        audio_filter_parts.append(f"[{bgm_idx}:a]{bgm_trim}atrim=0:{dur_sec:.3f},asetpts=PTS-STARTPTS,volume={bgm_vol:.2f}[aout]")
        out_audio_map = "[aout]"
else:
    if has_audio:
        out_audio_map = a_in if a_in else "0:a?"
```

### 1.5 Ensamblado de Filtergraphs para FFmpeg
- `video_fc = "; ".join(video_filter_parts) if video_filter_parts else None`
- `full_fc = "; ".join(video_filter_parts + audio_filter_parts) if (video_filter_parts or audio_filter_parts) else None`
- **Pase 1:**
  - Inputs: únicamente `base_video_inputs` (sin el flag `-stream_loop -1 -i bgm_path`).
  - Filtergraph: `video_fc` y `-map [vout]`.
  - Flags de codificación: `-threads 0 -c:v libx264 -preset medium -pass 1 -passlogfile ... -an -t dur_str -f null os.devnull`.
  - *Cero pads de audio, cero errores de pads desconectados.*
- **Pase 2 y Single Pass:**
  - Inputs: `base_inputs` (incluyendo BGM si existe).
  - Filtergraph: `full_fc`, `-map [vout]` y `-map out_audio_map` (o `-an` si `out_audio_map` es `None`).

---

## 2. Frontend: Interacción 2D en Phone Stage (`CandidatePreviewModal.tsx`)

### 2.1 Estados React
```typescript
const [camOutWidth, setCamOutWidth] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_cam_out_w_${detail.project.id}`);
  return saved !== null ? Number(saved) : 1080;
});
const [camOutHeight, setCamOutHeight] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_cam_out_h_${detail.project.id}`);
  return saved !== null ? Number(saved) : 340;
});
const [camOutX, setCamOutX] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_cam_out_x_${detail.project.id}`);
  return saved !== null ? Number(saved) : 0;
});
const [camOutY, setCamOutY] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_cam_out_y_${detail.project.id}`);
  return saved !== null ? Number(saved) : 0;
});

const [gameOutWidth, setGameOutWidth] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_game_out_w_${detail.project.id}`);
  return saved !== null ? Number(saved) : 1080;
});
const [gameOutHeight, setGameOutHeight] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_game_out_h_${detail.project.id}`);
  return saved !== null ? Number(saved) : 720;
});
const [gameOutX, setGameOutX] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_game_out_x_${detail.project.id}`);
  return saved !== null ? Number(saved) : 0;
});
const [gameOutY, setGameOutY] = useState<number>(() => {
  const saved = localStorage.getItem(`autoshorts_game_out_y_${detail.project.id}`);
  return saved !== null ? Number(saved) : 360;
});
```

### 2.2 Arrastre y Redimensión 2D con Mouse
```typescript
const handleStageGlobalPointerMove = (e: PointerEvent) => {
  const session = stageDragSessionRef.current;
  if (!session || !phoneStageRef.current) return;
  const rect = phoneStageRef.current.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const scaleX = 1080.0 / rect.width;
  const scaleY = 1920.0 / rect.height;
  const deltaX = (e.clientX - session.startX) * scaleX;
  const deltaY = (e.clientY - session.startY) * scaleY;

  if (session.mode === "move") {
    const newX = makeEvenCoord(Math.max(0, Math.min(1080 - session.initialWidth, session.initialX + deltaX)));
    const newY = makeEvenCoord(Math.max(0, Math.min(1920 - session.initialHeight, session.initialY + deltaY)));
    if (session.target === "camera") {
      setCamOutX(newX);
      setCamOutY(newY);
    } else {
      setGameOutX(newX);
      setGameOutY(newY);
    }
  } else if (session.mode === "resize_br") {
    const minW = session.target === "camera" ? 180 : 360;
    const minH = session.target === "camera" ? 180 : 360;
    const maxW = Math.max(minW, 1080 - session.initialX);
    const maxH = Math.max(minH, 1920 - session.initialY);
    const newW = makeEven(Math.min(maxW, Math.max(minW, session.initialWidth + deltaX)));
    const newH = makeEven(Math.min(maxH, Math.max(minH, session.initialHeight + deltaY)));

    if (session.target === "camera") {
      setCamOutWidth(newW);
      setCamOutHeight(newH);
    } else {
      setGameOutWidth(newW);
      setGameOutHeight(newH);
    }
  }
};
```

### 2.3 CSS en Phone Stage
```tsx
style={{
  position: "absolute",
  left: `${(outX / 1080) * 100}%`,
  top: `${(outY / 1920) * 100}%`,
  width: `${(outWidth / 1080) * 100}%`,
  height: `${(outHeight / 1920) * 100}%`,
  overflow: "hidden",
  cursor: "move",
}}
```
