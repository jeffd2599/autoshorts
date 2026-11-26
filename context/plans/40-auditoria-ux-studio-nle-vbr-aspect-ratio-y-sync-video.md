# Plan 40: Auditoría Studio v3.0 — Sync de Reproducción, Aspect Ratio + Centrado 2D, Bitrate Original / VBR Min-Max y Rediseño NLE Estilo CapCut/Premiere

**Estado:** COMPLETADO (100% tests/build en verde + EGM Drift Report: No drift detected)  
**Rama:** `release-v3.0`  
**Skills Aplicadas:** `ui-ux-pro-max`, `antislop`, `antislop-ui`, `senior-code-craft`  
**Relación con Decisiones (`context/DECISIONS.md`):** Da continuidad a **D-035 / D-038** (Studio 9:16 interactivo 2D, BGM timeline y VBR 2-Pass) y **D-039** (higiene y suite de regresión v3.0).

---

## 1. Diagnóstico (Hallazgos Verificados de la Auditoría)

Al auditar el código fuente actual frente a los 4 puntos reportados y las capturas adjuntas:

1. **Reproducción trabada al abrir un momento hasta pausar y reanudar (`CandidatePreviewModal.tsx` L1389-1652, L327-350):**
   - Al abrir en modo `gaming_split`, se montan **4 elementos `<video>` simultáneos** (`videoRef`, `bgVideoRef`, `camVideoRef`, `gameVideoRef`) apuntando al mismo stream HTTP (`127.0.0.1:1422`), todos intentando decodificar a la vez.
   - `videoRef` tiene `autoPlay` y al recibir `onLoadedMetadata` hace seek a `trimStart` (ej. `5550s`) llamando inmediatamente a `.play()` antes de completar el seek (`onSeeked`). Mientras tanto `bgVideoRef`, `camVideoRef` y `gameVideoRef` arrancan desde `0.0s` sin esperar `readyState`/`seeked`, generando competencia de rangos HTTP y correcciones bruscas de drift (`> 0.3s`) hasta que el usuario pausa y vuelve a dar Play (cuando los buffers ya están listos y alineados).
   - **Solución técnica:** Orquestación determinista de arranque: remover `autoPlay` directo de los `<video>` esclavos, pre-posicionar los 4 streams en `trimStart` al cargar metadata y disparar `play()` coordinado únicamente cuando el stream maestro (`videoRef`) y las capas activas completen su primer `seeked` / `canplay` (o mostrar estado de buffering limpio de milisegundos).

2. **Composición en Lienzo 9:16 (`CandidatePreviewModal.tsx` L477-547, L3764, L3849):**
   - Actualmente solo existe el botón **`Centrar X`** para Facecam y Gameplay; falta **`Centrar Y`** (centrado vertical `(1920 - height) / 2`) para ambos bloques.
   - En `handleStageGlobalPointerMove` (`mode === "resize_br"`, L519-534), el ancho y el alto se recalculan libremente sin respetar la relación de aspecto del encuadre (`camCrop.width / camCrop.height` o `gameCrop.width / gameCrop.height`), deformando o recortando la proporción original al arrastrar con el mouse.
   - **Solución técnica:** Añadir botones **`Centrar X`** y **`Centrar Y`** (y `Centrar X/Y` o toggle de **Bloquear Proporción**) en Facecam y Gameplay; en `resize_br` del lienzo 9:16, mantener la relación de aspecto por defecto usando el eje dominante de arrastre dentro de los límites `1080x1920` (permitiendo liberar temporalmente manteniendo `Shift` o desactivando el candado).

3. **Música & Bitrate Original + Rango Min/Max en VBR 2-Pass (`db.py`, `project_service.py`, `media.py`, `api.py`, `CandidatePreviewModal.tsx` L4145-4273):**
   - **Bug visual en BGM:** En `CandidatePreviewModal.tsx` L4145 se renderiza `<Play size={12} />` junto al texto `"▶ Probar Música"`, duplicando el icono (`▶ ▶ Probar Música`).
   - **Bitrate Original ausente:** `probe_media()` en `python_backend/media.py` L270-271 ya extrae `bitRate` y `bitRateMbps`, pero **no se persiste en `projects` (`db.py`) ni se devuelve en `get_project_detail()` (`project_service.py`)**. Por ello `origBitrateMbps` siempre es `null` en la UI y nunca se muestra `Original: X Mbps`.
   - **VBR 2-Pass sin rango Min/Max:** `media.py` L1515-1517 calcula `maxrate` (`1.2x`) y `bufsize` (`2x`) fijos y no pasa `-minrate`. Cuando el usuario activa **VBR 2-Pass**, necesita ver el bitrate original (como referencia) y poder configurar **Mínimo (Mbps)**, **Objetivo (Mbps)** y **Máximo (Mbps)** (y que FFmpeg aplique `-minrate`, `-b:v`, `-maxrate`, `-bufsize` en Pase 1 y Pase 2).

4. **Rediseño UI/UX del Editor de Momentos — Arquitectura NLE Estilo CapCut / Premiere Pro (`CandidatePreviewModal.tsx`, `modals.css`):**
   - Actualmente el modal ocupa una caja reducida con espacio desperdiciado alrededor, tabs superiores que se parten en 2 líneas (`2. Subtítulos`, `4. Formato & Gaming`, `5. Música & Bitrate`) y el **Timeline de Jump Cuts** escondido dentro de la pestaña `1. Recorte`.
   - Siguiendo `ui-ux-pro-max` y `antislop-ui` (jerarquía NLE limpia, sin gradientes/glow genéricos ni bordes excesivos):
     - **Workspace Studio amplio (`~95vw × 92vh`):** Máximo aprovechamiento del área útil.
     - **Layout NLE clásico de 3 zonas:**
       1. *Barra superior compacta*: título, rango, Score IA, selector `Original / 16:9 / 9:16` y botón cerrar.
       2. *Zona central dividida*: **Monitor de Preview grande** a la izquierda (con controles de transporte Play/Pause, tiempo y volumen de preview) + **Panel Inspector** a la derecha con pestañas compactas de **1 sola línea** (`Recorte`, `Subtítulos`, `CTA`, `Encuadre`, `Audio & Export`).
       3. *Zona inferior persistente*: **Timeline NLE unificado** siempre visible (pista de Video / Jump Cuts con split/delete + pista visual de BGM sincronizada con su offset de inicio), sin depender de en qué pestaña del Inspector estés trabajando.

---

## 2. Alcance Previsto

- **Backend Python (`python_backend/`):**
  - `db.py`: migración aditiva segura (`ALTER TABLE projects ADD COLUMN bit_rate_bps INTEGER` / lectura en `get_project_detail`) y almacenamiento al crear/importar proyecto.
  - `services/project_service.py`: guardar `bitRate` de `probe_media` y exponer `bitRate` / `bitRateMbps` en `detail.project` (incluyendo fallback con `probe_media` si proyectos antiguos no lo tenían en SQLite).
  - `media.py` y `api.py`: aceptar `minBitrateK` y `maxBitrateK` opcionales junto a `targetBitrateK` y `twoPass`, aplicando `-minrate`, `-b:v`, `-maxrate` y `-bufsize` coherentes en Pase 1 y Pase 2.
- **Frontend React / TypeScript / CSS (`src/`):**
  - `src/types.ts`: añadir `bitRate?: number` y `bitRateMbps?: number` a `Project` (si falta).
  - `src/components/modals/CandidatePreviewModal.tsx`:
    - Sincronización determinista de `<video>` (sin trabarse al abrir).
    - Botones `Centrar X` y `Centrar Y` + bloqueo de relación de aspecto al redimensionar en 9:16 (con toggle + `Shift` libre).
    - Corrección `Probar Música` (sin doble `▶`), badge de bitrate original (`Original: X Mbps`) e inputs/rango `Mín / Objetivo / Máx (Mbps)` para VBR 2-Pass.
    - Reorganización NLE 3 zonas (Monitor + Inspector 1-línea + Timeline persistente inferior).
  - `src/styles/modals.css`: estilos NLE limpios para `.clip-studio-modal`, tabs sin wrap, timeline persistente y controles compactos.
- **Tests (`tests/`):**
  - Ampliar `tests/test_v30_regression.py` (unitarios de `-minrate`/`-maxrate`, integración de persistencia `bitRateMbps` en SQLite/proyecto, y E2E sintético con VBR min/max).

---

## 3. Paso a Paso Técnico

1. **Fase 1 (TDD):** Añadir tests unitarios e integración para persistencia de `bitRate`/`bitRateMbps` y parámetros `-minrate`/`-b:v`/`-maxrate` en `render_flat_clip`.
2. **Fase 2 (Backend Bitrate & VBR Min/Max):** Persistir y exponer `bitRate`/`bitRateMbps` en `db.py` + `project_service.py`; soportar `minBitrateK`/`maxBitrateK` en `api.py` + `media.py`.
3. **Fase 3 (Sync Reproducción + Composición 2D):** Arreglar arranque sincronizado de `<video>` en `CandidatePreviewModal.tsx`, agregar `Centrar Y` y lock de aspect ratio en resize 9:16.
4. **Fase 4 (Rediseño NLE + Tab Audio/Bitrate):** Corregir botón `Probar Música`, mostrar `Original: X Mbps`, añadir rango Min/Objetivo/Max Mbps en VBR 2-Pass y reestructurar el Studio al layout NLE de 3 zonas en `CandidatePreviewModal.tsx` y `modals.css`.
5. **Fase 5 (Validación):** `tsc --noEmit --noUnusedLocals --noUnusedParameters`, `vite build`, `unittest` al 100% en verde y `egm-drift-report` si se autoriza EGM.

---

## 4. Riesgos e Implicaciones

- **Migración SQLite:** Proyectos ya creados antes de v3.0 tendrán `bit_rate_bps IS NULL`; se mitigará rellenándolo lazy con `probe_media()` o fallback limpio al abrir el proyecto sin romper la BD existente.
- **Validación FFmpeg VBR 2-Pass:** Si el usuario pone `minrate > target` o `target > maxrate`, `libx264` puede fallar o degradar calidad; hay que validar/clamp `minBitrateK <= targetBitrateK <= maxBitrateK` en UI y backend.
- **Rediseño de `CandidatePreviewModal.tsx` (4532 líneas):** Riesgo de romper bindings de drag 2D o refs al mover JSX al layout NLE; conviene refactorizar por bloques manteniendo los hooks/handlers intactos.

---

## 5. Estrategia de Testing

- **Unitarios (`tests/test_v30_regression.py`):** Verificar flags `-minrate`, `-b:v`, `-maxrate`, `-bufsize` en Pase 1 y Pase 2 de `render_flat_clip` y clamping cuando `min > target` o `max < target`.
- **Integración (`tests/test_v30_regression.py`):** Verificar guardado y lectura de `bitRate` / `bitRateMbps` en SQLite (`db.py` + `project_service.py`).
- **E2E (`tests/test_v30_regression.py`):** Renderizado sintético FFmpeg con `two_pass=True`, `min_bitrate_k`, `target_bitrate_k` y `max_bitrate_k`.
- **Frontend:** `tsc --noEmit --noUnusedLocals --noUnusedParameters` y `vite build` en 0 errores.

---

## 6. 🚦 Recomendación EGM (Semáforo de Complejidad y Tokens)

🔴 **Tarea Compleja / Arquitectónica (Sí requiere EGM)**

Esta tarea modifica sincronización multimedia multi-stream en WebView2, añade migración de esquema SQLite + parámetros críticos de `libx264` VBR 2-Pass (`minrate`/`maxrate`), matemática de aspect ratio 2D y una reestructuración completa del editor NLE en `CandidatePreviewModal.tsx` (~4500 líneas). Un error en el orden de seek, límites de FFmpeg o refs del visor introduciría regresiones visibles.

Recomiendo responder **`EGM APROBADO`** (para auditar el diseño antes de tocar código) o **`PLAN APROBADO - EGM`** (auditoría + implementación + drift report automático).
