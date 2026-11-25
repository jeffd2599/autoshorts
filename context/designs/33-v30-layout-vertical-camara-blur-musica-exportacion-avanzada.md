# Diseño Técnico Definitivo: AutoShorts v3.0 (EGM Approved Design)

**ID:** 33-v30-layout-vertical-camara-blur-musica-exportacion-avanzada  
**Estado:** Blindado tras Auditoría Goldfish Integral (EGM Resolve)  

---

## 1. Helper de Paridad Universal (`python_backend/media.py`)
Para garantizar que nunca ocurra el error `height not divisible by 2` ni fallos en `yuv420p` (`libx264`):
```python
def make_even(val: float or int) -> int:
    """Garantiza dimensiones pares estrictas >= 2 para compatibilidad yuv420p."""
    return max(2, (int(round(val)) // 2) * 2)
```

---

## 2. Filtergraphs de Layout de Video (`python_backend/media.py`)

### 2.1 Abstracción de Fuente de Video
Si el usuario realizó cortes CapCut (`has_multi_segment = True`), la entrada al pipeline de layout es `[vjoined]`. Si no hay cortes, la entrada es `[0:v]`.
```python
v_in = "[vjoined]" if has_multi_segment else "[0:v]"
```

### 2.2 Modo `blur` (Downscale 270x480 + Fast Bilinear Upscale)
95% de ahorro de CPU frente a desenfoque a 1080p nativo:
```text
{v_in}split=2[vbg_raw][vfg_raw];
[vbg_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear[vbg];
[vfg_raw]scale=w=1080:h=1920:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[vfg];
[vbg][vfg]overlay=x=(W-w)/2:y=(H-h)/2[vbase]
```

### 2.3 Modo `gaming_split` (Facecam Superior + Gameplay Centrado)
Coordenadas sanitizadas y delimitadas (*clamped*):
```python
in_w = vid_w if vid_w > 0 else 1920
in_h = vid_h if vid_h > 0 else 1080

cw = make_even(min(camera_crop.get("width", in_w), in_w))
ch = make_even(min(camera_crop.get("height", in_h), in_h))
cx = make_even(max(0, min(camera_crop.get("x", 0), in_w - cw)))
cy = make_even(max(0, min(camera_crop.get("y", 0), in_h - ch)))

gw = make_even(min(gameplay_crop.get("width", in_w), in_w))
gh = make_even(min(gameplay_crop.get("height", in_h), in_h))
gx = make_even(max(0, min(gameplay_crop.get("x", 0), in_w - gw)))
gy = make_even(max(0, min(gameplay_crop.get("y", 0), in_h - gh)))

cam_h = min(make_even((ch / cw) * 1080), 720)
game_h = min(make_even((gh / gw) * 1080), 1920 - cam_h)
```
Filtergraph:
```text
{v_in}split=3[vbg_raw][vcam_raw][vgame_raw];
[vbg_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=12:2,scale=1080:1920:flags=fast_bilinear[vbg];
[vcam_raw]crop=w={cw}:h={ch}:x={cx}:y={cy},scale=1080:{cam_h}:flags=lanczos[vcam];
[vgame_raw]crop=w={gw}:h={gh}:x={gx}:y={gy},scale=1080:{game_h}:flags=lanczos[vgame];
[vbg][vcam]overlay=x=0:y=0[vtmp];
[vtmp][vgame]overlay=x=0:y={cam_h}[vbase]
```
*(Protección CTA: En `gaming_split`, si el CTA está en `top`, se desplaza defensivamente a `y = cam_h + 30` para no tapar la cara del creador).*

---

## 3. Cadena de Audio y Música de Fondo (`python_backend/media.py`)

### 3.1 Manejo Condicional y Protección de Volumen
```python
valid_bgm = bool(bgm_path and os.path.isfile(str(bgm_path)))
if valid_bgm:
    cmd.extend(["-stream_loop", "-1", "-i", str(bgm_path)])
    bgm_idx = 1 if not has_cta else 2
    bgm_vol = max(0.0, min(float(bgm_volume), 1.0))

    if has_audio:
        vocal_track = "[ajoined]" if has_multi_segment else "[0:a]"
        filter_parts.append(
            f"{vocal_track}volume=1.0[vocal]; "
            f"[{bgm_idx}:a]volume={bgm_vol:.2f}[bgm]; "
            f"[vocal][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix_raw]; "
            f"[amix_raw]alimiter=limit=0.95:attack=5:release=50:asc=1[aout]"
        )
    else:
        # Video sin audio original: BGM directo recortado a la duración
        filter_parts.append(f"[{bgm_idx}:a]atrim=0:{dur_sec:.3f},asetpts=PTS-STARTPTS,volume={bgm_vol:.2f}[aout]")
```

---

## 4. Control de Bitrate, 2-Pass y Nivel H.264 Dinámico

### 4.1 Calibración de Nivel y Exclusión Mutua de Rate Control
```python
h264_level = "5.2" if target_fps == 120 else "4.2"
maxrate_str = "15M" if target_fps == 120 else "10M"
bufsize_str = "24M" if target_fps == 120 else "16M"

if target_bitrate_k:
    maxrate_str = f"{int(target_bitrate_k * 1.2)}k"
    bufsize_str = f"{int(target_bitrate_k * 2)}k"

enc_flags = [
    "-threads", "0",
    "-c:v", "libx264",
    "-preset", "medium",
    "-profile:v", "high",
    "-level:v", h264_level,
    "-pix_fmt", "yuv420p"
]

if target_bitrate_k and not two_pass:
    # ABR / VBV puro sin CRF contradictorio
    enc_flags.extend(["-b:v", f"{target_bitrate_k}k", "-maxrate", maxrate_str, "-bufsize", bufsize_str])
elif not target_bitrate_k:
    # Constrained CRF 19
    enc_flags.extend(["-crf", "19", "-maxrate", maxrate_str, "-bufsize", bufsize_str])

if target_fps:
    enc_flags.extend(["-r", str(target_fps), "-fps_mode", "cfr"])
```

### 4.2 Codificación en 2 Pases Multiplataforma
Si `two_pass == True` y `target_bitrate_k`:
1. Crear directorio temporal con `tempfile.TemporaryDirectory()`.
2. Pase 1: Compilar solo la rama de video del filtergraph (`[vout]`), `-pass 1`, `-passlogfile "{temp_dir}/x264_pass"`, `-f null -`.
3. Pase 2: Filtergraph completo con audio, `-pass 2`, `-passlogfile "{temp_dir}/x264_pass"`, escribiendo en `output_path`.
4. Cláusula `finally:` que elimina el directorio temporal y sus archivos `.log` y `.mbtree`.

---

## 5. Extracción de Metadatos en `probe_media`
En `python_backend/media.py`:
```python
bit_rate_raw = data.get("format", {}).get("bit_rate") or (video.get("bit_rate") if video else None)
bit_rate_mbps = round(float(bit_rate_raw) / 1_000_000, 2) if bit_rate_raw else None

# Añadir a diccionario retornado:
"bitRate": bit_rate_raw,
"bitRateMbps": bit_rate_mbps,
```

---

## 6. Persistencia y Frontend
- En `CandidatePreviewModal.tsx`:
  - `localStorage.setItem("autoshorts_crop_" + detail.project.id, JSON.stringify({ cameraCrop, gameplayCrop }))`
  - Controles con simulación visual en CSS sin lag.
