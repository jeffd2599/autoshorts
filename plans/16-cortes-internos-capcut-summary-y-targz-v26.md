# Plan 16: v2.6.0 — Editor de Cortes Internos CapCut, Optimización de Export para TikTok, Detección Dinámica de Contexto LM Studio, Summary Automático y Portable tar.gz

## 1. Diagnóstico

### Objetivos y Problemas Identificados para la Versión 2.6.0

1. **Optimización de Exportación de Clips para TikTok / Redes Verticales (Inflado de Bitrate Detectado):**
   - **Problema:** El pipeline actual infla artificialmente el bitrate al exportar: toma videos fuente de ~7.6 Mbps (1080x1920 a 60 fps) y los exporta a ~21.8 Mbps.
   - **Causa Raíz en el Código:** En `python_backend/media.py` (líneas 1126-1135 y 1153-1162), `render_flat_clip` tiene cableados parámetros agresivos de alta tasa:
     - `-crf 15` (nivel cuasi-lossless que genera archivos gigantescos).
     - `-b:v 16M` (obliga a la tasa promedio a buscar 16 Mbps como base).
     - `-maxrate 24M` y `-bufsize 30M` (permite picos de hasta 24 Mbps).
     - `-b:a 320k` (audio innecesariamente pesado para streaming móvil).
   - **Impacto Negativo:** Un bitrate de ~22 Mbps en un clip vertical no crea calidad nueva (solo recodifica artefactos del video fuente original). Cuando el usuario sube ese clip a TikTok, el motor de ingesta de TikTok aplica una recompresión extremadamente agresiva para reducirlo a sus límites móviles, provocando pixelación y artefactos severos en la app. Además, triplica el peso en disco y alarga el tiempo de render.
   - **Solución Estándar para TikTok:**
     - Cambiar la estrategia de rate control a **Constrained CRF (CRF limitado con VBV)**: `-crf 19 -maxrate 10M -bufsize 16M`.
     - Eliminar `-b:v 16M` y `-maxrate 24M`: Sin piso forzado de bitrate, un video de 7.6 Mbps se codificará de manera natural entre 7 y 9 Mbps, sin superar jamás el techo de 10 Mbps.
     - Preset: `-preset medium` (o `slow`), `-pix_fmt yuv420p` (8-bit estándar para compatibilidad universal de decodificadores móviles iOS y Android), `-profile:v high`, `-level:v 4.2`.
     - Audio: `-c:a aac -b:a 192k` embebido en el contenedor MP4.
     - Contenedor: MP4 con `-movflags +faststart` para reproducción en streaming instantánea.
     - Escalado y nitidez: Si la entrada ya es 1080x1920, se omite reescalado; si proviene de fuente horizontal, se usa recorte al centro 9:16 con `scale=1080:1920:flags=lanczos` sin sharpening artificial.

2. **Detección Dinámica del Contexto Real en LM Studio (Validado Experimentalmente):**
   - **Problema:** En las ejecuciones recientes, el log indicaba:
     `Dividing stream into 50 chunk(s) of 5 min for gaming detection (Context: 8192 tokens)...`
     incluso cuando el usuario tenía cargado un modelo en LM Studio con 16k tokens (16.384).
   - **Causa Raíz:** En `python_backend/llm.py`, `get_available_context_size` consultaba `/api/v1/models` y buscaba `inst.get("context_length")`. En LM Studio v1, esa propiedad está anidada en `inst["config"]["context_length"]`, mientras que en la API nativa v0 (`GET /api/v0/models`) se expone directamente a nivel de modelo bajo el campo **`loaded_context_length`** cuando `"state" == "loaded"`. Al no encontrarla en la raíz, caía en el fallback por defecto de `8192`.
   - **Pruebas en Vivo Ejecutadas:** Se realizaron pruebas reales con la CLI `lms`:
     - `qwen3.8-4b-distill` cargado a 16.384 tokens: `GET /api/v0/models` reportó `"loaded_context_length": 16384`.
     - `gemma-4-e4b` cargado a 8.192 tokens: `GET /api/v0/models` reportó `"loaded_context_length": 8192`.
   - **Impacto:** Con 16k tokens reales detectados, la duración de cada bloque pasa de 5 min a 10 min (`chunk_dur = 600.0`), reduciendo los bloques de 50 a ~25 (50% menos llamadas al LLM), procesando streams largos en la mitad del tiempo con mayor coherencia contextual.

3. **Cortes Internos en Clips (Jump Cuts / Split & Delete estilo CapCut):**
   - **Problema:** Actualmente AutoShorts solo permite recortar el inicio y fin general (`trimStart` y `trimEnd`). Cuando un momento detectado dura 60 segundos pero contiene 10 o 15 segundos intermedios de silencio, pantallas de carga o momentos aburridos, el usuario no puede remover esos fragmentos intermedios.
   - **Solución:** Implementar en el modal de previsualización (`CandidatePreviewModal.tsx`) una barra interactiva de segmentos con botones "Dividir aquí" (Split) en la posición actual del cabezal de reproducción y "Eliminar fragmento" (Papelera).
   - **Ventaja de AutoShorts:** AutoShorts re-codifica los momentos en vertical 9:16 con subtítulos kinetic ASS palabra por palabra. Por lo tanto, no sufrimos las limitaciones de LosslessCut (que depende de keyframes para stream-copy). Se realizan cortes a nivel de fotograma exacto (*frame-accurate*) mediante filtros `trim`/`setpts` + `concat` (o `xfade` para transición suave) en un solo pase de FFmpeg.
   - **Sincronización de Subtítulos:** Se calcularán las marcas de tiempo desplazadas para que las palabras conservadas en los segmentos posteriores no se desfasen con el video recortado.

4. **Poblado Automático de la Carpeta `summary/`:**
   - **Problema:** La carpeta `summary/` dentro del directorio del proyecto se creaba en disco pero no se llenaba.
   - **Solución:** Escribir automáticamente al finalizar la transcripción y al sincronizar candidatos:
     - `transcripcion_completa.txt`: Texto continuo limpio con marcas de tiempo `[MM:SS]` y hablante.
     - `subtitulos_completos.srt`: Subtítulos en formato estándar SRT listos para importar en CapCut, DaVinci o Premiere.
     - `transcripcion_detallada.json`: Estructura JSON completa con segmentos y palabras.
     - `momentos_virales.txt`: Lista clasificada de los mejores clips detectados con hooks, puntuación y tiempos.

5. **Empaquetado Portable `.tar.gz`:**
   - **Problema:** Reemplazar la distribución `.zip` por `.tar.gz` para maximizar la compresión sólida de PyInstaller (usando compresión Gzip nivel 9) y generar su checksum SHA-256.

6. **Flujo de Versionado Git:**
   - Crear la rama `release-v2.6` siguiendo la convención histórica del proyecto (`release-v1.0` ... `release-v2.5`), elevando la versión a `v2.6.0`.

---

## 2. Alcance

### Componentes y Archivos a Modificar
- `python_backend/media.py`:
  - En `render_flat_clip`:
    - Reemplazar flags de codificación infladas (`-crf 15`, `-b:v 16M`, `-maxrate 24M`, `-bufsize 30M`, `-b:a 320k`) por la especificación calibrada para TikTok/Shorts:
      - `-c:v libx264`
      - `-preset medium` (o `slow`)
      - `-crf 19`
      - `-maxrate 10M`
      - `-bufsize 16M`
      - `-profile:v high`
      - `-level:v 4.2`
      - `-pix_fmt yuv420p`
      - `-c:a aac -b:a 192k`
      - `-movflags +faststart`
    - Detección inteligente de dimensiones: Si el video ya tiene resolución 1080x1920, evitar reescalados innecesarios. Si requiere crop horizontal a 9:16, usar `scale=1080:1920:flags=lanczos` sin sharpening artificial.
    - Soporte de `sub_ranges: Optional[List[Dict[str, float]]]` y `transition: Optional[str]` construyendo el grafo de filtros `trim`/`setpts` + `concat`/`xfade`.
    - Adaptar la generación de subtítulos ASS desplazando marcas de tiempo de las palabras conservadas según la duración de los fragmentos eliminados.
- `package.json` y `python_backend/version.py`:
  - Incrementar versión a `2.6.0`.
- `python_backend/llm.py`:
  - En `get_available_context_size`:
    - Consultar primero `GET {root_url}/api/v0/models`.
    - Filtrar modelos con `"state" == "loaded"`.
    - Si se pasa `model_name`, buscar coincidencia por ID; de lo contrario tomar el primer modelo cargado.
    - Extraer `loaded_context_length`.
    - Como fallback secundario, consultar `GET {root_url}/api/v1/models` inspeccionando `inst["config"]["context_length"]`.
  - En `get_loaded_models_status`:
    - Incluir el campo `contextLength` obtenido de `loaded_context_length` para visualización en terminal/logs y frontend.
  - En `detect_candidates_pipeline`:
    - Pasar `model_name` a `get_available_context_size(provider=provider, model_name=model_name)`.
- `python_backend/services/project_service.py` y `python_backend/api.py`:
  - Implementar `export_project_summary_files(project_dir, transcript, candidates)` para escribir `transcripcion_completa.txt`, `subtitulos_completos.srt`, `transcripcion_detallada.json` y `momentos_virales.txt`.
  - En `render_flat_clip_for_candidate`, recibir `subRanges` y `transition` y delegarlos a `media.py`.
- `src/components/modals/CandidatePreviewModal.tsx`:
  - Barra de tiempo multi-segmento con botón **"Dividir aquí" (Split)** y botón **"Eliminar fragmento" (Papelera)** estilo CapCut.
  - Indicador visual interactivo de segmentos conservados (activos) y eliminados.
  - Checkbox para "Transición suave" entre cortes.
  - Botón "Restablecer" para volver al clip original completo.
- `src/hooks/useMediaPipeline.ts`:
  - Pasar `subRanges` y `transition` al invocar `render_flat_clip_for_candidate`.
- `build_portable.py`:
  - Generar el paquete `AutoShorts-v2.6.0-windows-x64-portable.tar.gz` con compresión Gzip nivel 9 y hash SHA-256.

### Archivos Protegidos
- `analizarrepos/`: No tocar ni modificar.

---

## 3. Paso a Paso Técnico

1. **Paso 1: Rama Git y Versionado v2.6.0:**
   - Crear y cambiar a la rama `release-v2.6` desde `main`.
   - Actualizar versión a `2.6.0` en `python_backend/version.py` y `package.json`.

2. **Paso 2: Optimización de Parámetros de Video para TikTok en `python_backend/media.py`:**
   - Reemplazar en los bloques de renderizado (con y sin CTA) los parámetros de video:
     - Cambiar `-crf 15` por `-crf 19`.
     - Eliminar `-b:v 16M` (evitar inflación forzada de bitrate).
     - Ajustar `-maxrate 10M` y `-bufsize 16M` (tope estricto para evitar picos que provoquen recompresión agresiva de TikTok).
     - Ajustar `-b:a 192k` (audio balanceado y liviano).
     - Verificar que no exista sharpening artificial ni upscale de resolución si la entrada ya es 1080x1920.

3. **Paso 3: Detección Dinámica de Contexto en `python_backend/llm.py`:**
   - Implementar consulta prioritaria a `/api/v0/models` leyendo `loaded_context_length` cuando `state == "loaded"`.
   - Implementar fallback a `/api/v1/models` (`inst["config"]["context_length"]`).
   - Pasar `model_name` en `detect_candidates_pipeline` para enlazar el modelo exacto.
   - Enriquecer `get_loaded_models_status` con `contextLength`.

4. **Paso 4: Generación Automática de Archivos en `summary/`:**
   - Implementar `export_project_summary_files(project_dir, transcript, candidates)` en `project_service.py`.
   - Generar `transcripcion_completa.txt`, `subtitulos_completos.srt`, `transcripcion_detallada.json` y `momentos_virales.txt`.
   - Invocar la función al finalizar `transcribe_project` y al actualizar candidatos en `api.py`.

5. **Paso 5: Motor de Concatenación Multi-Segmento y Subtítulos en `python_backend/media.py`:**
   - Agregar parámetro `sub_ranges` y `transition` a `render_flat_clip`.
   - Si `sub_ranges` está presente y tiene múltiples rangos:
     - Construir los filtros FFmpeg `trim`/`setpts` y concatenar con `concat` o `xfade`.
     - Recortar las palabras de los subtítulos que caigan en segmentos eliminados.
     - Calcular el offset acumulado de tiempo para ajustar los tiempos de inicio y fin de las palabras de subtítulos subsiguientes.

6. **Paso 6: Editor de Cortes Internos en `CandidatePreviewModal.tsx`:**
   - Gestionar el estado de segmentos: `Array<{ id: string, start: number, end: number, deleted: boolean }>`.
   - Permitir dividir en la posición actual de reproducción.
   - Permitir marcar un segmento intermedio como eliminado (y restaurarlo si se desea).
   - Enviar `subRanges` (los segmentos no eliminados) y `transition` al ejecutar `onCutCandidate`.

7. **Paso 7: Migración a `.tar.gz` en `build_portable.py`:**
   - Crear archivo comprimido con `tarfile.open(..., "w:gz", compresslevel=9)`.
   - Generar el archivo hash `.sha256`.

8. **Paso 8: Pruebas Exhaustivas (Unitarias, Integración, E2E):**
   - Ejecutar `scratch/test_video_export_bitrate_unit.py` (validando que los flags de FFmpeg contengan `-crf 19`, `-maxrate 10M`, `-bufsize 16M`, `-b:a 192k` y que NO contengan `-b:v 16M` ni `-crf 15`).
   - Ejecutar `scratch/test_lmstudio_context_unit.py` (validando lectura de `/api/v0/models` y cálculo de chunks de 10 min vs 5 min).
   - Ejecutar `scratch/test_sub_ranges_render_unit.py` (validando cálculo de offsets de subtítulos y filtros FFmpeg).
   - Ejecutar `scratch/test_project_summary_integration.py` (validando creación física de los 4 archivos en `summary/`).
   - Compilación completa de frontend (`pnpm run build`).
   - Suite completa de regresión (`test_*.py`).

9. **Paso 9: Reconstrucción Portable y Sincronización:**
   - Ejecutar `python build_portable.py`.
   - Sincronizar binarios y assets a `C:\Users\JEFF\Desktop\AutoShorts - Portable`.

10. **Paso 10: Registro de Decisión y Git Sync:**
    - Registrar D-018 en `DECISIONS.md`.
    - Commit en `release-v2.6`, merge a `main` y push de ambas ramas a origin.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** Pérdida de calidad percibida al bajar de `-crf 15` a `-crf 19`.
  - *Mitigación:* En video H.264 para redes sociales y pantallas móviles de 1080p, CRF 19 es visualmente transparente (indistinguible del original para el ojo humano). Al no forzar un bitrate de 22 Mbps, TikTok no activará su recompresión agresiva de castigo, por lo que el video final en la app de TikTok se verá más nítido y sin artefactos de macrobloque.
- **Riesgo:** Si LM Studio no tiene ningún modelo cargado o está apagado.
  - *Mitigación:* Fallback robusto a 8192 tokens con timeout corto (1.5s), garantizando que el sistema nunca se bloquee ni falle.
- **Riesgo:** Desincronización de subtítulos en clips con saltos de tiempo (jump cuts).
  - *Mitigación:* Cálculo matemático preciso de tiempos acumulados de los huecos eliminados (`gap_offset`), recalculando el `start` y `end` de cada palabra en el archivo `.ass`.

---

## 5. Estrategia de Testing (Gate de Cierre Obligatorio)

1. **Tests Unitarios:**
   - `scratch/test_video_export_bitrate_unit.py`: Inspeccionar el comando generado en `render_flat_clip` comprobando la presencia exacta de `-crf 19`, `-maxrate 10M`, `-bufsize 16M`, `-pix_fmt yuv420p`, `-c:a aac`, `-b:a 192k` y la ausencia total de `-b:v 16M` y `-crf 15`.
   - `scratch/test_lmstudio_context_unit.py`: Simular respuestas de `/api/v0/models` y `/api/v1/models` para verificar que `get_available_context_size` extrae correctamente 16384, 8192 y activa la duración de bloque correspondiente (10 min vs 5 min).
   - `scratch/test_sub_ranges_render_unit.py`: Validar la lógica matemática de sincronización de palabras ASS y la estructura de los filtros `trim`/`concat`/`xfade`.
2. **Tests de Integración:**
   - `scratch/test_project_summary_integration.py`: Crear un proyecto temporal, simular transcripción y verificar la creación física y contenido de los 4 archivos en `summary/` (`transcripcion_completa.txt`, `subtitulos_completos.srt`, `transcripcion_detallada.json`, `momentos_virales.txt`).
3. **Tests E2E:**
   - Compilación exitosa de React con Vite (`pnpm run build`).
   - Suite completa de regresión (`test_*.py`) con 100% de tests en verde.
   - Generación y verificación del paquete `AutoShorts-v2.6.0-windows-x64-portable.tar.gz` con su hash SHA-256.

---

## 6. Skills Aplicadas

- `senior-code-craft`: Calibración de parámetros de códec H.264/FFmpeg, cálculo de rate control VBV, arquitectura de filtros de video y robustez de llamadas a APIs locales.
- `ui-ux-pro-max`: Interfaz de edición intuitiva estilo CapCut con interacción fluida en línea de tiempo.
- `antislop`: Código directo, sin textos de relleno ni caracteres superfluos.
