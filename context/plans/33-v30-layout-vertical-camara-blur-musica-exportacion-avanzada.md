# Plan 33: AutoShorts v3.0 — Conversión Vertical con Mapeo de Cámara y Gaussian Blur, Música de Fondo Drag & Drop, y Control Avanzado de Bitrate y FPS

## 1. Diagnóstico y Contexto
AutoShorts ha alcanzado una sólida estabilidad en la versión v2.9.0. Sin embargo, al importar grabaciones de gaming en formato panorámico horizontal (16:9, ej. 1920x1080), la conversión actual a vertical (9:16) se limita a un recorte directo centrado (`crop=1080:1920`), lo cual en streams de videojuegos presenta dos problemas graves:
1. **Pérdida de la cámara del creador (Facecam):** La cámara suele estar en una esquina y queda fuera de encuadre.
2. **Espacio muerto o recorte claustrofóbico:** Si no se recorta la acción principal, quedan barras negras verticales sin contenido estético.

Además, los creadores de contenido para TikTok, YouTube Shorts e Instagram Reels requieren:
- **Fondo con desenfoque gaussiano (Gaussian Blur / Box Blur):** Rellenar el lienzo vertical 9:16 con la misma partida difuminada de fondo con alto rendimiento de CPU.
- **Mapeo de cámara gaming (Split Screen):** Recortar la cámara del streamer en la parte superior y el gameplay en la parte inferior.
- **Música de fondo personalizable (Drag & Drop):** Arrastrar una pista musical a cada clip con control de volumen independiente (ducking / slider de 0% a 100%) sin atenuar la voz del creador ni generar clipping digital.
- **Exportación con control avanzado de Bitrate y FPS:** Visualizar el bitrate y los FPS originales de la grabación fuente y permitir al usuario elegir el bitrate de salida, codificación en 2 pases (tipo Premiere Pro VBR 2-Pass) y framerate a 30, 60 o 120 FPS con Nivel H.264 calibrado a 5.1.

---

## 2. Alcance

### A. Migración de Memoria Histórica a `context/` (Protocolo Maestro EGM)
- Migrar `DECISIONS.md` a `context/DECISIONS.md` y los planes 1 al 32 a `context/plans/`.
- Crear rama `release-v3.0` y actualizar versión a `3.0.0` en `python_backend/version.py` y `package.json`.

### B. Módulo de Transformación de Video Horizontal a Vertical 9:16
- **Backend (`python_backend/media.py`):**
  - Implementar nuevos modos de layout para `render_flat_clip`:
    1. `crop` (modo clásico actual: crop centrado 1080x1920).
    2. `blur` (Downscale Blur 180x320 + Fast Bilinear Upscale para 95% de ahorro en CPU):
       - Capa de fondo: `scale=180:320:force_original_aspect_ratio=increase,crop=180:320,boxblur=10:2,scale=1080:1920:flags=fast_bilinear[vbg]`
       - Capa frontal: video horizontal escalado al ancho `scale=1080:-2:flags=lanczos[vfg]` centrado verticalmente.
    3. `gaming_split` (Cámara + Gameplay + Fondo desenfocado):
       - Mapeo de región de cámara ($X, Y, W, H$) y gameplay ($X, Y, W, H$) sanitizados a números pares (`// 2 * 2`).
       - Cámara arriba con aspect ratio preservado + Gameplay abajo/centro sobre fondo desenfocado.
- **Frontend (`src/components/modals/CandidatePreviewModal.tsx`):**
  - Selector visual de Layout: `Recorte Centrado` | `Fondo Blur (Difuminado)` | `Gaming Split (Cámara + Juego)`.
  - Herramienta interactiva de mapeo visual para "Gaming Split" con coordenadas normalizadas.

### C. Sistema de Música de Fondo (Drag & Drop + Control de Volumen)
- **Frontend (`CandidatePreviewModal.tsx`):**
  - Zona de arrastre (Dropzone) y botón selector de archivos `.mp3`, `.wav`, `.aac`, `.m4a`, `.ogg`.
  - Slider de volumen de música: 0% a 100% (por defecto 15%).
- **Backend (`python_backend/media.py` y `api.py`):**
  - Entrada `-stream_loop -1 -i bgm_path`.
  - Mezcla con `amix=inputs=2:duration=first:dropout_transition=0:normalize=0` seguido de limitador de picos `alimiter=limit=0.95:attack=5:release=50:asc=1` para evitar pérdida de volumen vocal y clipping.
  - Soporte para videos mudos (mapeo directo de música) y sincronización con cortes CapCut.

### D. Control Avanzado de Exportación (Bitrate y Framerate)
- **Extracción de Metadatos (`python_backend/media.py`):**
  - `probe_media` y `probe_media_cached` reportan `bitRate` (bits/s y Mbps) y `fps`.
- **Frontend (`CandidatePreviewModal.tsx`):**
  - Panel colapsable de "Exportación Avanzada":
    - **Bitrate:** Recomendado (10 Mbps), Original o Personalizado.
    - **Modo:** 1 Paso (CRF 19 con VBV) vs 2 Pases (VBR estilo Premiere Pro).
    - **Framerate:** Original, 30 fps, 60 fps o 120 fps (con aviso sobre recompresión en redes móviles).
- **Backend (`python_backend/media.py`):**
  - Elevación automática a `-level:v 5.1` y buffer ampliado (`-maxrate 15M -bufsize 24M`) al exportar a 120 FPS.
  - Ejecución en 2 pases con archivo temporal `-passlogfile` y limpieza en `finally:`.

---

## 3. Paso a Paso Técnico
1. **Fase 1: Ramas y Migración:** Crear rama `release-v3.0`, migrar `DECISIONS.md` y `plans/` a `context/`, bump a `3.0.0` en `version.py` y `package.json`.
2. **Fase 2: Filtergraphs de Video:** Implementar `layout="blur"` (Downscale + Boxblur) y `layout="gaming_split"` en `media.py`.
3. **Fase 3: Mezcla de Audio y Música:** Integrar entrada BGM, bucle continuo y cadena `amix` + `alimiter`.
4. **Fase 4: Control de Bitrate y 120 FPS:** Calibración de Level H.264 5.1 para 120 FPS, 2 pases VBR y extracción de bitrate en `probe_media`.
5. **Fase 5: Interfaz de Usuario:** Controles de layout, dropzone de audio, sliders y panel avanzado en `CandidatePreviewModal.tsx`.
6. **Fase 6: Pruebas y Validación:** Tests unitarios e integración en `scratch/test_plan33_v30_unit.py` y validación de suite completa (100% verde).

---

## 4. Estrategia de Testing (Validación Obligatoria)
1. **Tests Unitarios (`scratch/test_plan33_v30_unit.py`):**
   - Validación de sintaxis de filtergraphs para `blur` y `gaming_split` con dimensiones pares.
   - Validación de comandos de audio con `amix` y `alimiter`.
   - Validación de selección dinámica de Level 5.1 para 120 FPS y Level 4.2 para 60 FPS.
   - Validación de extracción de bitrate y fps en `probe_media`.
2. **Suite Completa de Regresión:** Comprobar que los 39 tests existentes continúen pasando al 100%.

---

## 5. Decisiones de Arquitectura Registradas
- Se documenta `D-033` en `DECISIONS.md`.
