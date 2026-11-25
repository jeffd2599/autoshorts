# Plan de Acción 9: Cancelación Inmediata de Transcripción/VRAM, Chunks Dinámicos Adaptativos para LLMs y Ajuste Visual del Logo

## 1. Diagnóstico y Entendimiento del Problema

1. **Retención de Memoria y Falta de Cancelación Inmediata en Transcripción:**
   - **Causa Raíz:**
     - En `python_backend/transcription.py`, al detectar `is_cancelled()`, se ejecuta `del model`, pero el generador `segments_gen` (que contiene referencias internas al runtime de CTranslate2 y memoria GPU) permanece en el ámbito local, impidiendo la recolección inmediata de basura.
     - Falta la invocación forzada de `gc.collect()` y `torch.cuda.empty_cache()` tanto en la captura de excepciones como en el método `cancel_transcription` de `api.py`.
     - Además, `inject_acoustic_cues_into_transcript` en `python_backend/media.py` procesa streams extensos (grabaciones de varias horas con cientos de MB en WAV) sin verificar el flag `is_cancelled`, bloqueando el hilo de ejecución durante miles de iteraciones de cálculo RMS.
     - En `cancel_transcription` (`api.py`), se omite la llamada a `unload_all_lmstudio_models()`, a diferencia de `cancel_candidate_generation`.

2. **Fallas por Desbordamiento de Contexto (Context Window 8192 tokens en LM Studio/Ollama) y Bucles Inútiles:**
   - **Causa Raíz:**
     - La partición de segmentos en `python_backend/llm.py` (`detect_moments_with_llm`) utiliza una duración fija de 600 segundos (10 minutos) o 900 segundos (15 minutos).
     - En directos con locución constante y múltiples anotaciones acústicas de disparos/gritos, un bloque de 10 minutos puede alcanzar fácilmente más de 9.000 tokens de prompt.
     - Al superar el límite de contexto (`n_ctx = 8192` en LM Studio o modelos locales con 4096 tokens), LM Studio responde con HTTP 400 (`exceed_context_size_error`).
     - El bucle actual en `llm.py` atrapa la excepción con un simple `print(...)` y continúa ciegamente ejecutando los 23 bloques siguientes, fallando en cada uno de ellos y saturando la consola.
     - Si el usuario descarga el modelo en LM Studio (`Model unloaded by user or API request`), el pipeline tampoco se detiene.
   - **Solución Requerida:**
     - **Detección Dinámica de Contexto:** Consultar el contexto disponible en LM Studio (`/api/v1/models` o inspección de `n_ctx` en error) y dimensionar los chunks con un margen de seguridad (ej. 70% del contexto para el prompt, dejando 30% para razonamiento y salida JSON).
     - **Sub-partición Adaptativa (Bisección):** Si un bloque excede el presupuesto de tokens o genera un error de contexto, dividir automáticamente dicho bloque a la mitad (ej. de 10 min a 5 min, o de 5 min a 2.5 min) y reintentar, en lugar de descartarlo y perder los momentos virales.
     - **Circuit Breaker (Parada Temprana):** Si se detecta un error irrecuperable (modelo descargado, servidor caído o fallo fatal de conexión), detener inmediatamente la iteración, liberar recursos y notificar al frontend.

3. **Ajuste Visual del Logo en Sidebar y README:**
   - En `src/components/panels/Sidebar.tsx`, el logo está configurado con un estilo inline forzado de `width: 22, height: 22`, lo cual resulta pequeño respecto a la columna de 36px del `.brand-row` en `src/styles/layout.css`.
   - Se ajustará a 36x36 px con bordes suaves de 8px para que luzca con presencia y balance visual junto a "AutoShorts".
   - En `README.md`, se verificará y consolidará la cabecera visual y la documentación de las nuevas capacidades.

---

## 2. Alcance (Archivos Afectados)

### Backend Python:
- `python_backend/transcription.py`:
  - Liberación rigurosa de memoria CTranslate2 (`del segments_gen`, `del model`, `gc.collect()`, `torch.cuda.empty_cache()`).
  - Chequeo de cancelación en cada iteración y liberación inmediata de memoria en `finally`/`except`.
- `python_backend/media.py`:
  - Añadir soporte para `is_cancelled` en `inject_acoustic_cues_into_transcript` para detener inmediatamente el escaneo de energía RMS.
- `python_backend/api.py`:
  - En `cancel_transcription`: invocar `unload_all_lmstudio_models()`, `gc.collect()`, `torch.cuda.empty_cache()` y emitir evento de cancelación al frontend.
  - En `transcribe_project`: pasar `is_cancelled` a `inject_acoustic_cues_into_transcript`.
- `python_backend/llm.py`:
  - Implementar estimación de tokens y dimensionamiento adaptativo de chunks.
  - Mecanismo de reintento con sub-partición (bisección) ante errores de desbordamiento de contexto (`exceed_context_size_error`).
  - Detección y corte inmediato (Circuit Breaker) si el modelo es descargado o no responde.

### Frontend React & Estilos:
- `src/components/panels/Sidebar.tsx`:
  - Ampliar el logo a 36x36 px en `.brand-row`.
- `src/styles/layout.css`:
  - Asegurar que `.brand-logo` y `.brand-row` se alineen perfectamente sin saltos ni desbordamientos.

### Documentación y Registro:
- `README.md`: Actualizar documentación con la gestión adaptativa de contexto y cancelación inmediata.
- `DECISIONS.md`: Registrar decisión D-012.

---

## 3. Paso a Paso Técnico

1. **Refactorización de Liberación de Memoria y Cancelación en Whisper:**
   - En `transcribe_local`, envolver la iteración en un bloque con manejo explícito de limpieza:
     - Si `is_cancelled()` es verdadero: borrar `segments_gen`, borrar `model`, llamar a `gc.collect()`, vaciar caché CUDA y lanzar `InterruptedError`.
     - En bloque `finally`: asegurar que cualquier referencia a `model` y generadores sea eliminada y la caché de PyTorch liberada si ocurrió una interrupción.
   - En `inject_acoustic_cues_into_transcript`, aceptar `is_cancelled: Optional[Callable[[], bool]] = None` y chequearlo cada 50 chunks (0.05s) para salir de inmediato si se cancela.

2. **Ampliación de `cancel_transcription` en `Api`:**
   - Integrar descarga de modelos de LM Studio y Ollama.
   - Forzar recolección de basura con `gc.collect()` y limpieza de memoria en CUDA.
   - Emitir `transcription-progress` con mensaje `Transcripción cancelada` y porcentaje 0.

3. **Partición Dinámica y Sub-chunking Adaptativo en `llm.py`:**
   - Crear función `estimate_prompt_tokens(text: str) -> int` para calcular la carga aproximada de tokens antes de enviar al modelo.
   - Implementar función para obtener el límite de contexto (`get_context_window_limit(provider, model_name)`), usando `/api/v1/models` en LM Studio o por defecto seguro de 8192 / 4096.
   - Si el chunk estimado excede el 70% del contexto disponible, subdividir automáticamente en intervalos temporales más cortos (ej. de 10 min a 5 min o 3 min).
   - En el bloque de llamada (`call_lmstudio` / `call_ollama`):
     - Si se captura `exceed_context_size_error` o HTTP 400 por tokens:
       - Extraer `n_ctx` si viene en el error.
       - Subdividir el bloque actual a la mitad y procesar recursivamente las dos mitades.
     - Si se detecta `Model unloaded` o error crítico de servidor:
       - Levantar `RuntimeError` y cortar el bucle inmediatamente para evitar 20+ llamadas fallidas consecutivas.

4. **Ajuste del Logo en la Barra Lateral (`Sidebar.tsx` y `layout.css`):**
   - Modificar las dimensiones de `img.brand-logo` de 22x22 a 36x36 px con `borderRadius: 8`.
   - Verificar la alineación vertical con el título y subtítulo en `.brand-row`.

5. **Compilación y Construcción del Frontend:**
   - Ejecutar `pnpm.cmd run build` para asegurar la integridad de la compilación.

6. **Estrategia de Testing Integral (Gate de Cierre):**
   - Ejecutar tests unitarios de cancelación y de estimación/partición de chunks.
   - Ejecutar test de integración simulando respuesta de error de contexto y verificando la subdivisión adaptativa.
   - Verificación visual E2E en navegador con el subagente para comprobar el nuevo tamaño del logo en el menú lateral.

---

## 4. Riesgos e Implicaciones

- **Sobrecarga de llamadas si los chunks se vuelven demasiado pequeños:** Se establece un piso mínimo de duración de chunk (ej. 90 segundos) para que un bloque no se subdivida infinitamente si el texto es anómalo.
- **Raza de condiciones en hilos de PyWebView:** Los flags `_cancel_transcription_flag` y `_cancel_candidates_flag` son atómicos en lectura booleana, pero la limpieza de GPU debe hacerse de forma sincronizada con try/except para evitar fallos de PyTorch.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Tests Unitarios (`scratch/test_cancellation_and_chunks_unit.py`):**
  - Validar que `inject_acoustic_cues_into_transcript` se detiene inmediatamente cuando `is_cancelled` devuelve `True`.
  - Validar que `transcribe_local` libera `WhisperModel`, invoca `gc.collect()` y vacía CUDA al cancelarse.
  - Validar que `estimate_prompt_tokens` calcula adecuadamente la carga.
  - Validar que el algoritmo de bisección divide un bloque que excede tokens en sub-bloques más pequeños.
  - Validar que errores como `"Model unloaded"` activan el Circuit Breaker y detienen el proceso.
- **Tests de Integración (`scratch/test_pipeline_resilience_integration.py`):**
  - Simular un flujo de detección de candidatos donde un bloque lanza `exceed_context_size_error` y verificar que el pipeline se auto-recupera procesando las mitades sin fallar.
  - Compilación frontend con `pnpm.cmd run build`.
- **Tests E2E Visuales (Browser Subagent):**
  - Abrir la interfaz en `http://127.0.0.1:1420/` y verificar que el logo en la barra lateral ahora mide 36x36 px y luce visualmente integrado y destacado.
