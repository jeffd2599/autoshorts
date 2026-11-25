# Plan de Acción 5: Detección Dinámica de VRAM/GPU, Ordenamiento Inteligente de Modelos Whisper y Rediseño Visual de la Configuración

## 1. Diagnóstico y Entendimiento del Problema

Tras la auditoría del panel de ajustes y la revisión del reporte visual del usuario:

### Problemas identificados:
1. **Hardware Hardcodeado a RTX 2060 (12GB):**
   - En `python_backend/transcription.py` (línea 14): La descripción de `large-v3-turbo` tiene texto fijo: `"Máxima velocidad + Altísima precisión (Recomendado para RTX 2060 12GB)"`.
   - En `src/components/modals/StyleModal.tsx` (línea 549): El texto de recomendación está fijado a `"Recomendado para tu NVIDIA RTX 2060 (12GB)"`.
   - En `src/components/common/ModelBadge.tsx` (línea 47): La nota de tráfico asume un límite fijo de 12GB: `"Excede 12GB VRAM, ralentizará el sistema"`, y tiene valores predeterminados de `vramTotalMb = 12288` en vez de adaptarse a la GPU real (4GB, 6GB, 8GB, 16GB o CPU sin GPU dedicada).
2. **Desorden en la Lista de Modelos Whisper:**
   - Los modelos Whisper en el selector aparecen en orden fijo arbitrario, sin diferenciar visualmente los que ya están descargados en el disco local (`~/.cache/huggingface/hub`) de los que requerirán descarga al usarse.
   - No se ordenan de mayor conveniencia (Óptimo) a mayor peso (Pesado) según la VRAM real disponible en la máquina del usuario.
3. **Colapso Visual y Deficiencias de Responsive en SettingsPanel:**
   - La disposición en rejilla automática (`repeat(auto-fit, minmax(280px, 1fr))`) distribuye 3 campos de forma desigual (2 arriba, 1 abajo a la izquierda con un hueco a la derecha).
   - En la tarjeta de `MODELO WHISPER`, el título, el badge `• ÓPTIMO` y el texto de VRAM compiten en una sola línea estrecha de 280px, provocando saltos de línea antiestéticos que se solapan con el selector.
   - El texto dentro del `<select>` (`large-v3-turbo (~3.2 GB (Faster) VRAM) — Óptimo [Descargado]`) excede el ancho del control y se trunca.
   - Los textos descriptivos en mayúsculas sostenidas generan fatiga visual y rigidez.
4. **Requisito de Testing Exhaustivo (Regla Global):**
   - El usuario enfatizó la obligación estricta de ejecutar los 3 niveles de verificación: Tests Unitarios, Tests de Integración y Tests E2E (End-to-End) con 100% de éxito antes del cierre.

---

## 2. Alcance (Archivos Afectados)

### Backend (Python):
- `python_backend/transcription.py`:
  - Limpiar descripciones fijas en `WHISPER_SPECS` eliminando menciones a la RTX 2060 o GPUs específicas.
  - Devolver especificaciones neutrales con consumo estimado de VRAM.

### Frontend (React / TypeScript):
- `src/components/common/ModelBadge.tsx`:
  - Adaptar `getWhisperTrafficLevel` y `getOllamaTrafficLevel` para calcular dinámicamente la clasificación (`optimal`, `moderate`, `heavy`) y las notas explicativas en función de la VRAM real (`telemetry?.vramTotalMb`) y si existe GPU activa (`telemetry?.hasGpu`).
  - Si no hay GPU o la VRAM es 0 (modo CPU), clasificar los modelos según su viabilidad en procesador (tiny/base óptimos, turbo/large pesados).
- `src/components/modals/SettingsPanel.tsx`:
  - Rediseñar por completo la interfaz visual con una estructura limpia de 3 secciones en tarjetas independientes:
    1. **Transcripción de Audio (Faster-Whisper):** Selector de motor, chip de GPU detectada en vivo, selector de modelos ordenado con `<optgroup>` (descargados primero, luego no descargados; ambos ordenados de óptimo a pesado) y nota dinámica basada en el hardware real.
    2. **Motor de IA Local (Detección de Momentos):** Selector con botones o tabs visuales entre Ollama y LM Studio con estado de conexión en vivo, selector de modelos y opciones avanzadas.
    3. **Instrucciones del Sistema (Prompt de Extracción):** Textarea con estilo monospace profesional, contador de caracteres y botón de restablecer.
  - Corregir el responsive: evitar rejillas auto-fit rotas; usar diseño fluido en columnas proporcionales con flexbox y padding equilibrado.
- `src/components/modals/StyleModal.tsx`:
  - Reemplazar la mención fija de RTX 2060 por la GPU detectada dinámicamente (`telemetry?.gpuName || "tu equipo"`).
  - Aplicar el mismo ordenamiento inteligente en el selector de Whisper (descargados primero, óptimos primero).

---

## 3. Paso a Paso Técnico

### Fase 1: Limpieza de Referencias Estáticas en Backend
1. En `python_backend/transcription.py`:
   - Modificar `WHISPER_SPECS`:
     - `large-v3-turbo`: `"desc": "Alta precisión con velocidad máxima optimizada (Faster Turbo)"`.
     - `large-v3`: `"desc": "Máxima precisión absoluta en acentos y jerga compleja"`.
     - `medium`: `"desc": "Excelente equilibrio entre precisión y velocidad"`.
     - `small`: `"desc": "Equilibrado para transcripción ágil en hardware estándar"`.
     - `base`: `"desc": "Rápido y ligero para pruebas o equipos modestos"`.
     - `tiny`: `"desc": "Ultrarrápido con mínimo consumo de recursos"`.

### Fase 2: Detección Dinámica de VRAM en ModelBadge
1. En `src/components/common/ModelBadge.tsx`:
   - Reescribir `getWhisperTrafficLevel(modelId, vramTotalMb, hasGpu)`:
     - Extraer `vramGb = (hasGpu && vramTotalMb > 0) ? vramTotalMb / 1024 : 0`.
     - Si `vramGb === 0`: evaluar idoneidad para CPU (tiny/base = óptimo, small = moderado, medium/turbo/large = pesado).
     - Si `vramGb >= 10`: todos los modelos son óptimos.
     - Si `vramGb >= 7` (GPUs de 8GB): turbo/medium/small = óptimo; large-v3 = moderado.
     - Si `vramGb >= 5` (GPUs de 6GB): medium/small = óptimo; turbo = moderado; large-v3 = pesado.
     - Si `vramGb < 5` (GPUs de 4GB o menos): small/base/tiny = óptimo; turbo/medium = moderado; large-v3 = pesado.
     - Generar notas dinámicas: `"Fluido en tu GPU de X GB"`, sin valores estáticos de 12GB.
   - En `getOllamaTrafficLevel`:
     - Reemplazar la nota fija `"Excede 12GB VRAM"` por `"Excede la VRAM disponible (X GB)"`.

### Fase 3: Algoritmo de Ordenamiento Inteligente de Modelos
1. Implementar función utilitaria de ordenamiento de modelos Whisper:
   - Criterio 1: Modelos ya descargados (`downloaded: true`) van al primer grupo; no descargados van al segundo grupo.
   - Criterio 2: Dentro de cada grupo, ordenar por idoneidad (`optimal` > `moderate` > `heavy`).
   - Criterio 3: Dentro del mismo nivel, ordenar por capacidad o calidad recomendada.
2. Renderizar los modelos en `<select>` usando `<optgroup label="Modelos Descargados en tu PC">` y `<optgroup label="Disponibles para Descargar">`.

### Fase 4: Rediseño Visual y Responsive de SettingsPanel
1. Rediseñar el contenedor del modal:
   - Cabecera con título, subtítulo e indicador de hardware detectado: chip con nombre de GPU y VRAM total (`telemetry?.gpuName`, `(X.X GB VRAM)`).
   - Estructurar el cuerpo en 3 tarjetas limpias y delimitadas con borde sutil (`border: 1px solid var(--border-default)`):
     - Tarjeta 1: Motor y Modelo de Transcripción (Faster-Whisper). Header horizontal sin colisiones, select con optgroups y texto descriptivo en minúsculas legibles.
     - Tarjeta 2: Motor de IA (Ollama / LM Studio). Selector tipo pestañas con estado en vivo y opciones dedicadas según el motor activo.
     - Tarjeta 3: Instrucciones del Sistema (Prompt de Extracción de Momentos).
   - Pie con acciones alineadas: botón de restablecer valores a la izquierda, botón de guardar/cerrar a la derecha.

### Fase 5: Actualización de StyleModal
1. Adaptar el selector de modelos Whisper en `StyleModal.tsx` con el mismo ordenamiento dinámico.
2. Reemplazar la mención fija de RTX 2060 en `StyleModal.tsx` por la GPU detectada.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** Si el usuario no tiene tarjeta gráfica NVIDIA (ej: gráficos integrados Intel/AMD o solo CPU), `telemetry.hasGpu` será `false` y `vramTotalMb` será 0.
  - **Mitigación:** La función de idoneidad contempla explícitamente el caso de CPU (`vramGb === 0`) indicando con claridad qué modelos son ligeros y advirtiendo que los modelos grandes tardarán considerablemente en CPU.
- **Riesgo:** Si un modelo descargado no coincide exactamente con el ID de la lista.
  - **Mitigación:** La comprobación de descarga en backend ya contempla equivalencias (`large-v3-turbo` y `turbo`), y el frontend conserva un respaldo seguro.

---

## 5. Estrategia de Testing (Validación Obligatoria en 3 Niveles)

Conforme a la regla obligatoria y la petición expresa del usuario:

### Nivel 1: Tests Unitarios
- **TypeScript y Frontend:**
  - Compilación limpia con `pnpm.cmd run build` verificando cero errores de sintaxis y tipado estricto.
  - Test unitario de la función de idoneidad de VRAM (`getWhisperTrafficLevel` y `getOllamaTrafficLevel`) para GPUs de 4GB, 6GB, 8GB, 12GB, 16GB y modo CPU (0GB).
- **Backend Python:**
  - `python -m py_compile python_backend/transcription.py python_backend/api.py`.

### Nivel 2: Tests de Integración
- **Simulación de Detección de Hardware y Modelos:**
  - Script en `scratch/test_whisper_sorting.py` que valide:
    1. Que `get_installed_whisper_models` entrega la estructura correcta sin strings hardcodeados.
    2. Que el algoritmo de ordenamiento agrupa primero los descargados y ordena de óptimo a pesado.
    3. Que las notas dinámicas reflejan exactamente la GPU y VRAM simulada.

### Nivel 3: Tests E2E (End-to-End)
- **Flujo Completo de Configuración y Guardado:**
  - Ejecutar script que invoque el ciclo completo RPC: lectura de telemetría de hardware -> obtención de configuración -> cambio de modelo Whisper -> guardado persistente en `config.json` -> recarga y verificación de consistencia.
  - Inspección visual del layout renderizado mediante `browser_subagent` para confirmar que no hay desbordamientos de texto ni elementos truncados en la ventana de configuración.
