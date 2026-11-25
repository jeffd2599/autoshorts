# Plan 35: Encuadre Interactivo con Mouse, Fondo Blur en Vivo, Música en Tiempo Real con Timeline y Progreso/Cancelación de Renderizado

## 1. Diagnóstico y Necesidades Reales del Creador
Tras las pruebas del usuario sobre la versión v3.0.0 con `AutoShorts.bat`, se identifican cuatro requerimientos indispensables para el flujo de trabajo:
1. **Encuadre Interactivo con Mouse (Facecam y Gameplay)**:
   - Actualmente las cajas sobre el video eran elementos estáticos y no respondían al mouse ni reflejaban visualmente los valores de los inputs.
   - El creador necesita interactuar directamente con el mouse sobre el lienzo: arrastrar los recuadros para mover ($X, Y$) y usar manijas en esquinas/bordes para redimensionar ($Ancho, Alto$). Los inputs y el lienzo deben estar sincronizados bidireccionalmente en tiempo real.
2. **Fondo Blur del Mismo Video en Gaming Split**:
   - En Gaming Split y modo Blur, el fondo vertical debe mostrar el mismo video fuente estirado y difuminado (`blur(20px) brightness(0.65)`) en tiempo real en la UI, tal como lo hace FFmpeg en la exportación final.
3. **Música en Tiempo Real con Selector de Inicio (Timeline de Música)**:
   - Actualmente la música no se escuchaba al reproducir el clip en el modal.
   - Se debe instanciar un elemento `<audio>` sincronizado con la reproducción y pausa del `<video>`, vinculado al slider de volumen para monitoreo en vivo.
   - Se requiere un control de inicio de pista (`bgmStartSec`) para poder elegir en qué momento de la canción entra la música y pasar `-ss {bgm_start_sec}` a FFmpeg.
4. **Línea de Progreso Porcentual (0% - 100%) y Cancelación Inmediata de Renderizado**:
   - Actualmente la exportación es una caja negra con un spinner indefinido. Si el usuario se desespera o cierra la ventana, el proceso de FFmpeg continúa ejecutándose huérfano en segundo plano consumiendo 100% de CPU.
   - Se debe capturar el progreso de FFmpeg en tiempo real (`-progress pipe:1`) y emitir eventos de porcentaje (`render_progress`) a la barra de la UI.
   - Se debe incorporar un botón "Cancelar Exportación" que invoque `cancel_render()` y termine de inmediato el subproceso de FFmpeg de forma atómica (`taskkill` / `proc.kill()`).

---

## 2. Alcance
- **Modificar:** `python_backend/media.py`
  - Soporte de parámetro `bgm_start_sec: float = 0.0` con `-ss {bgm_start_sec}` para la pista BGM.
  - Reemplazar `subprocess.run` por `subprocess.Popen` con `-progress pipe:1` para emitir porcentaje real (0-100%).
  - Implementar gestión de proceso activo global `_active_render_proc` y función `cancel_active_render()`.
- **Modificar:** `python_backend/api.py`
  - Inyectar callback de progreso que llame a `self.emit("render_progress", {"percent": p, "stage": desc})`.
  - Exponer método RPC `cancel_render()` para abortar la exportación activa.
  - Propagar `bgmStartSec` a `render_flat_clip`.
- **Modificar:** `src/types.ts` y `src/hooks/useMediaPipeline.ts`
  - Extender `CutClipOptions` con `bgmStartSec?: number`.
  - Escuchar evento `render_progress` y exponer `renderProgress: number | null` y `cancelRender: () => Promise<void>`.
- **Modificar:** `src/components/modals/CandidatePreviewModal.tsx`
  - **Crop Box Interactivo con Mouse**: Componente de selección rectangular arrastrable y redimensionable con puntero del mouse para Facecam (#f43f5e) y Gameplay (#3b82f6) sobre el reproductor de video.
  - **Fondo Blur en Vivo**: Elemento de video de fondo con filtro CSS blur y sincronización de tiempo.
  - **Audio BGM en Vivo**: `<audio>` sincronizado con el video de previsualización que refleja el volumen y `bgmStartSec`.
  - **Timeline de Música**: Slider/input para definir el punto de inicio de la canción.
  - **Barra de Progreso y Botón Cancelar**: Barra de progreso animada con porcentaje exacto (ej. `48%`) y botón visible `Cancelar Exportación` que aborta el proceso de inmediato.

---

## 3. Paso a Paso Técnico

### Fase 1: Backend de Progreso, Cancelación y Offset Musical
1. En `python_backend/media.py`:
   - Añadir variable global protegida `_active_render_process: Optional[subprocess.Popen] = None`.
   - Implementar `cancel_active_render()`: si hay proceso activo, ejecutar terminación forzada en Windows (`taskkill /F /T /PID {pid}` y `proc.kill()`).
   - En `render_flat_clip`, añadir argumento `progress_callback: Optional[Callable[[int, str], None]] = None` y `bgm_start_sec: float = 0.0`.
   - Si `valid_bgm` y `bgm_start_sec > 0`, inyectar `-ss {bgm_start_sec:.3f}` antes de `-i {bgm_path}`.
   - En la ejecución de FFmpeg, usar `subprocess.Popen` con `-progress`, `pipe:1`. En un hilo de lectura continuo, parsear `out_time_ms` o `out_time_us`, calcular `percent = int((t_sec / dur_sec) * 100)` e invocar `progress_callback(percent, stage)`.
2. En `python_backend/api.py`:
   - Exponer `cancel_render(self, _args)` y enlazar `progress_callback` con `self.emit("render_progress", ...)`.

### Fase 2: Sincronización y Audio en Frontend
3. En `CandidatePreviewModal.tsx`:
   - Instanciar `<audio ref={bgmAudioRef}>` conectado a `http://127.0.0.1:1422/stream?file={bgmPath}`.
   - Sincronizar eventos `onPlay`, `onPause`, `onSeeked`, `onTimeUpdate` del video con el audio respetando `bgmStartSec` y `bgmVolume`.
   - Control de inicio de música en la pestaña "Música & Bitrate": slider y campo numérico de `bgmStartSec`.

### Fase 3: Lienzo Interactivo con Mouse (Facecam & Gameplay)
4. En `CandidatePreviewModal.tsx`:
   - Implementar lógica de manipulación con puntero (`onMouseDown`, `onMouseMove`, `onMouseUp`) sobre el contenedor del video.
   - Renderizar dos recuadros con bordes visibles, etiquetas ("Facecam" y "Gameplay"), sombras y manijas (*handles*) en esquinas y bordes.
   - Permitir arrastrar para mover la caja ($X, Y$) y arrastrar manijas para redimensionar ($W, H$) respetando proporciones pares y límites del video.
   - Sincronizar bidireccionalmente con los inputs de la pestaña "Formato & Gaming".
   - Integrar fondo difuminado del mismo video en tiempo real detrás del video centrado.

### Fase 4: UX de Exportación, Progreso y Cancelación
5. En `CandidatePreviewModal.tsx`:
   - Reemplazar el spinner ciego por una barra de progreso porcentual visible en el footer (`0% a 100%`) que escucha el evento `render_progress`.
   - Añadir botón rojo visible `Cancelar Exportación` durante el renderizado.
   - Limpieza automática de procesos ante cierre de ventana (`window.addEventListener('beforeunload', ...)`).

---

## 4. Riesgos e Implicaciones
- **Eventos de mouse y escalado CSS**: Las coordenadas del cursor sobre el elemento visual del video deben proyectarse matemáticamente a la resolución nativa de 1920x1080 para que el recorte sea exacto sin importar el tamaño del monitor o zoom de la ventana.
- **Sincronización de audio webview**: En navegadores con políticas de autoplay, el audio debe activarse únicamente tras interacción del usuario con el botón de reproducción del video.

---

## 5. Estrategia de Testing
- **Test Unitario Backend:** Verificar que `bgm_start_sec` añade `-ss` a la entrada BGM en `render_flat_clip`.
- **Test de Progreso:** Validar la lectura y emisión de porcentajes a partir de la salida de FFmpeg.
- **Test de Cancelación:** Verificar que `cancel_active_render()` termina el subproceso y actualiza el estado a `cancelled` o `error`.
- **Validación Frontend:** `tsc --noEmit` y `vite build` con 0 errores de tipado.

---

## 6. 🚦 Recomendación EGM (Semáforo de Complejidad y Tokens)
🔴 **Tarea Compleja / Arquitectónica (Sí requiere EGM):**  
Involucra manipulación geométrica interactiva con punteros de mouse sobre canvas DOM, streaming asíncrono y control de señales de subprocesos de FFmpeg con cancelación atómica, y sincronización de doble flujo multimedia (audio BGM + video). Usar la auditoría de subagentes Goldfish blindará la interacción contra fugas de procesos y desincronizaciones.  
**Recomendación:** Responder **`EGM APROBADO`** o **`PLAN APROBADO - EGM`**.
