# Plan 36: Libertad de Composición en Lienzo 9:16, Fix Audio BGM en Vivo y Optimización VBR 2-Pass

**Estado:** APROBADO (Post-Auditoría EGM)  
**Diseño Técnico:** `context/designs/36-composicion-vertical-libre-bgm-audio-fix-y-optimizacion-vbr-2pass.md`  
**Decisión Asociada:** `D-036` (`context/DECISIONS.md`)  

## 1. Diagnóstico del Problema y Antecedentes
En las pruebas reales con `AutoShorts.bat`, el usuario reportó 3 problemas críticos:
1. **Composición Rígida en Lienzo 9:16 (Facecam y Gameplay):**
   - La Facecam en el video vertical se calculaba fija con el aspect ratio del recorte (`(ch/cw) * 1080`), ocupando a veces más de 640px sin dejar achicarla.
   - El orden de superposición ponía el Gameplay sobre la Facecam.
   - Solución: Sliders interactivos de composición (`camOutHeight`, `camOutY`, `gameOutHeight`, `gameOutY`), Facecam en capa superior (`zIndex: 4`) y `make_even_coord` para permitir `y = 0` sin franja negra de 2px.
2. **Audio BGM no se escucha en tiempo real:**
   - El elemento `<audio ref={bgmAudioRef}>` nunca fue insertado en el JSX del modal.
   - Solución: Insertar `<audio loop preload="auto" src={`http://127.0.0.1:1422/stream?file=...`} />` con `onLoadedMetadata`, control en vivo de volumen y botón "▶ Probar Música". Registrar tipos MIME en `stream_server.py`.
3. **VBR 2-Pass congelado en 45% y lentitud excesiva (Hallazgo Mortal Goldfish):**
   - En `python_backend/media.py`, `cmd_pass1` carecía del parámetro `"-t", dur_str`. El Pase 1 codificaba hasta el final absoluto de streams de 2 a 4 horas. Al llegar a los 30s de la telemetría, el porcentaje quedaba en 45% mientras el proceso seguía corriendo en segundo plano.
   - En Windows, `-f null -` colisionaba con `-progress pipe:1` (ambos en stdout).
   - Solución: Inyectar `"-t", dur_str` en `cmd_pass1`, usar `os.devnull` (`NUL` en Windows), y acelerar Pase 1 con `-preset veryfast`.

---

## 2. Alcance de Archivos Modificados
- `python_backend/media.py`
- `python_backend/stream_server.py`
- `src/types.ts`
- `src/hooks/useMediaPipeline.ts`
- `src/components/modals/CandidatePreviewModal.tsx`
- `scratch/test_plan36_unit.py`

---

## 3. Paso a Paso Técnico
1. **Fix Audio BGM en Vivo (`CandidatePreviewModal.tsx`):**
   - Insertar `<audio ref={bgmAudioRef} src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(bgmPath)}`} preload="auto" />` en el JSX.
   - Enlazar cambio de volumen dinámico directo a `bgmAudioRef.current.volume`.
   - Añadir botón de "▶ Escuchar Música" / "⏸ Pausar" con actualización de audio en tiempo real.
2. **Libertad de Composición en Lienzo 9:16 (`CandidatePreviewModal.tsx` & `media.py`):**
   - Crear estado `camOutHeight` (por defecto calculado automático ~360px o ajustable con slider de 180px a 650px).
   - Crear estado `gameOutHeight` o modo proporcional.
   - Actualizar el Phone Stage para que la altura de la cámara y del juego respondan de inmediato a estos valores.
   - Enviar `camOutHeight` al backend para que el filtergraph escale exactamente la Facecam al alto deseado y coloque el gameplay en armonía.
3. **Fix y Optimización de VBR 2-Pass (`media.py`):**
   - Cambiar en Pase 1: `"-f", "null", "NUL" if os.name == "nt" else "/dev/null"`.
   - Cambiar preset en Pase 1 a `-preset veryfast` para un análisis 3x más veloz.
   - Mantener Pase 2 con el preset seleccionado (`medium`/`fast`) y escritura final en el archivo de salida.
4. **Verificación y Build:**
   - Ejecutar `tsc --noEmit` y `vite build`.
   - Ejecutar suite de pruebas unitarias.

---

## 4. Riesgos e Implicaciones
- **Paridad YUV420p:** Cualquier altura personalizada para Facecam o Gameplay debe pasar por `make_even` para evitar errores cromáticos en FFmpeg.
- **Rango de Sliders:** Limitar la suma de alturas para que nunca sobrepase 1920px ni quede fuera de la pantalla.

---

## 5. Estrategia de Testing
- **Unit Testing:** Prueba unitaria en `scratch/test_plan36_unit.py` validando:
  - Generación del comando 2-Pass con `NUL` en Windows.
  - Cálculo de filtergraph con alturas personalizadas `cam_out_h` y `game_out_h`.
- **Compilación Frontend:** `node node_modules/typescript/bin/tsc --noEmit` y `vite build` deben salir con 0 errores.
- **Prueba Funcional:** Verificación de ejecución con `AutoShorts.bat`.

---

## 6. 🚦 Recomendación EGM (Semáforo de Complejidad y Tokens)
- 🟢 **Tarea Pequeña / Acotada (No requiere EGM):**  
  Las causas de los 3 problemas son quirúrgicas y 100% diagnosticadas:
  1) El tag `<audio>` faltaba en el JSX.
  2) En Windows FFmpeg 2-Pass `-f null -` colisionaba con `-progress pipe:1` (se soluciona con `NUL` y preset rápido en Pase 1).
  3) La composición 9:16 requiere sliders de altura para Facecam y Gameplay en lugar de una altura rígida.  
  Recomendación: responder **`PLAN APROBADO`** para aplicar directamente las soluciones y ahorrar tokens.
