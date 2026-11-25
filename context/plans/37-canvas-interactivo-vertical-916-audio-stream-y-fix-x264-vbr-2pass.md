# Plan 37: Lienzo 9:16 Interactivo con Mouse, Fix Fatal x264 VBR 2-Pass y Audio Drag & Drop

**Estado:** APROBADO (En fase de implementación tras auditoría EGM)  
**Diseño Técnico Aprobado:** `context/designs/37-canvas-interactivo-vertical-916-audio-stream-y-fix-x264-vbr-2pass.md`  
**Reporte de Auditoría EGM:** `context/egm/goldfish_review_report.md`  

## 1. Diagnóstico del Problema y Antecedentes
Tras la prueba en desarrollo con `AutoShorts.bat`, se identificaron con precisión los fallos reportados en el log y las necesidades del usuario:

1. **Fallo Fatal de libx264 en VBR 2-Pass (`different weightp setting than first pass (2 vs 1)`):**
   - El log de FFmpeg reveló:
     `[libx264] different weightp setting than first pass (2 vs 1)`
     `Error while opening encoder`
   - **Causa:** En x264, el preset `veryfast` asigna `--weightp 1` y el preset `medium` asigna `--weightp 2`. x264 rechaza estrictamente abrir el encoder en el Pase 2 si el análisis estadístico del Pase 1 utilizó una configuración de `weightp` distinta.
   - **Solución:** Utilizar el mismo preset (`medium` o `fast`) en ambos pases. Como el Pase 1 ya incluye `"-t", dur_str` y `os.devnull`, el Pase 1 dura apenas 10-14 segundos y los parámetros de compresión quedan 100% sincronizados.

2. **Error `AttributeError: 'SystemLogBuffer' object has no attribute 'append'`:**
   - En `python_backend/api.py`, varias llamadas invocaban `log_buffer.append(...)` cuando `SystemLogBuffer` implementa `push(...)`. Esto provocó la advertencia en el footer del modal y enmascaró detalles de errores.
   - **Solución:** Definir `append = push` en `SystemLogBuffer` (`python_backend/logger.py`).

3. **Música (BGM) no se escucha al probarla tras Drag & Drop:**
   - **Causa:** En Chromium / WebView2, el objeto `File` arrastrado desde el explorador de Windows no expone `file.path` por seguridad del navegador (`(file as any).path` es `undefined`). El estado guardaba únicamente `file.name` (ej. `cancion.mp3`), haciendo que `http://127.0.0.1:1422/stream?file=cancion.mp3` devolviera **404 Not Found**.
   - **Solución:**
     - En frontend: al soltar el archivo, crear `URL.createObjectURL(file)` para que el `<audio>` nativo reproduzca de inmediato en local con 0ms de latencia.
     - En backend: implementar RPC `save_project_bgm(project_id, filename, data_base64)` para persistir la pista en el disco dentro de la carpeta del proyecto y retornar la ruta absoluta real para FFmpeg.

4. **Interacción con Mouse Directamente en el Lienzo 9:16 (Phone Stage):**
   - El usuario solicita poder manipular directamente con el puntero del mouse los recuadros de la Facecam y del Gameplay sobre la pantalla del teléfono 9:16 (Phone Stage), exactamente igual a cómo funciona el lienzo 16:9.
   - **Solución:**
     - Dotar a los recuadros de Facecam y Gameplay en el Phone Stage de punteros de arrastre (`handleStagePointerDown(target, "move")`) para mover su posición vertical $Y$ sobre el video vertical.
     - Dotar a la esquina inferior de una manija de redimensión (`handleStagePointerDown(target, "resize")`) para agrandar o achicar la altura/escala de la cámara y del gameplay directamente con el mouse.
     - Mantener los sliders sincronizados en tiempo real mientras se mueve el mouse.

---

## 2. Alcance de Archivos Modificados
- `python_backend/media.py`: Configurar `-preset medium` idéntico en ambos pases de 2-pass para garantizar paridad de `weightp=2`.
- `python_backend/logger.py`: Añadir alias `append = push` en `SystemLogBuffer`.
- `python_backend/api.py`: Añadir endpoint RPC `save_project_bgm`.
- `src/components/modals/CandidatePreviewModal.tsx`:
  - Phone Stage interactivo con mouse (arrastrar y redimensionar Facecam y Gameplay).
  - Manejo de audio con `createObjectURL` y persistencia de ruta real vía `save_project_bgm`.
- `scratch/test_plan37_unit.py`: Tests unitarios para `weightp` homogéneo y buffer alias.

---

## 3. Paso a Paso Técnico
1. **Fix 2-Pass x264 en Backend (`python_backend/media.py`):**
   - En `cmd_pass1`, cambiar `-preset veryfast` a `-preset medium` para coincidir con `cmd_pass2` y evitar el fallo `different weightp setting than first pass`.
2. **Fix `SystemLogBuffer` (`python_backend/logger.py`):**
   - Añadir `append = push` en la clase `SystemLogBuffer`.
3. **Endpoint de Guardado de BGM (`python_backend/api.py`):**
   - Crear `save_project_bgm(project_id: str, file_name: str, data_base64: str) -> str` que decodifica y escribe en `data/projects/{project_id}/bgm/{file_name}` y retorna la ruta absoluta.
4. **Lienzo 9:16 Interactivo con Mouse (`CandidatePreviewModal.tsx`):**
   - Implementar `handleStageBoxPointerDown` y sesión de arrastre en el Phone Stage 9:16:
     - Modo `move`: ajusta `camOutY` y `gameOutY` de acuerdo al movimiento vertical del mouse.
     - Modo `resize`: ajusta `camOutHeight` y `gameOutHeight` según el arrastre de la manija inferior derecha.
   - En `handleAudioDrop`:
     - Generar `const blobUrl = URL.createObjectURL(file)`.
     - Leer archivo con `FileReader` a base64 e invocar `save_project_bgm` para obtener la ruta absoluta física.
5. **Validación:**
   - Compilación con `tsc --noEmit` y `vite build`.
   - Ejecución de pruebas unitarias.

---

## 4. Riesgos e Implicaciones
- **Límites del Phone Stage:** El arrastre en el Phone Stage debe respetar los límites del lienzo vertical (1080x1920) y aplicar `make_even` y `make_even_coord`.
- **Memoria de Object URLs:** Liberar URLs de blob anteriores al cambiar de pista para prevenir fugas de memoria.

---

## 5. Estrategia de Testing
- **Unit Testing (`scratch/test_plan37_unit.py`):**
  - Validar que ambos pases de 2-pass comparten idéntico preset x264.
  - Validar que `log_buffer.append(...)` funcione sin excepciones.
- **Frontend Typecheck & Build:** `tsc --noEmit` y `vite build` deben completarse con 0 errores.
- **Prueba Funcional:** Verificación en `AutoShorts.bat`.

---

## 6. 🚦 Recomendación EGM (Semáforo de Complejidad y Tokens)
- 🟢 **Tarea Pequeña / Acotada (No requiere EGM):**  
  Las causas de los 3 problemas están 100% identificadas en los logs:
  1) `weightp` x264 se resuelve unificando el preset en 2-pass.
  2) `SystemLogBuffer.append` se soluciona con el alias.
  3) BGM drag & drop se resuelve con `URL.createObjectURL` y persistencia en disco.
  4) El control con mouse en el Phone Stage reutiliza la lógica probada del lienzo 16:9.  
  Recomendación: responder **`PLAN APROBADO`** para avanzar directamente y ahorrar tokens.
