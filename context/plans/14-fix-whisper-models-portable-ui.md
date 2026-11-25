# Plan 14: Corrección Integral de Detección y Carga de Modelos Faster-Whisper en Versión Portable (UI y Backend)

## 1. Diagnóstico

### El Problema Reportado
El usuario descomprimió la versión portable (`AutoShorts - Portable`), abrió `AutoShorts.exe`, fue a importar un proyecto y el selector de modelos de Faster-Whisper en el modal de importación (`StyleModal.tsx`) apareció completamente vacío (sin opciones). Sin embargo, al iniciar la aplicación mediante `AutoShorts.bat` desde el repositorio fuente, los modelos sí se mostraban correctamente.

### Análisis de Causa Raíz
Tras una exhaustiva investigación de solo lectura del frontend React y del backend empaquetado, se identificaron **dos causas principales**:

1. **Desconexión de Estado y Carrera en Frontend (`useAppSettings.ts`, `apiBridge.ts`, `StyleModal.tsx`, `SettingsPanel.tsx`):**
   - **Estado Inicial Vacío:** En `src/hooks/useAppSettings.ts`, `whisperModelsList` se inicializaba como un array vacío: `useState<WhisperModel[]>([])`.
   - **Timeout demasiado estricto en el Bridge:** En `src/apiBridge.ts`, `getPyWebViewApi()` tenía un timeout de apenas `2500ms` (2.5 segundos). En la versión portable (`AutoShorts.exe`), el runtime de Python + PyWebView + Edge WebView2 en arranque en frío (cold start) tarda típicamente entre 2.5 y 4 segundos en inicializar e inyectar `window.pywebview.api`. Al expirar el timeout, la llamada inicial a `refreshEnv()` fallaba silenciosamente y nunca se reintentaba.
   - **Falta de reactividad entre `environment` y `whisperModelsList`:** En `src/App.tsx`, `projectActions.refresh()` ejecuta `environment_status` y llama a `setEnvironment(env)`. Sin embargo, en `useAppSettings.ts` no existía ningún `useEffect` que sincronizara `whisperModelsList` cuando `environment.whisperModels` se actualizaba.
   - **Ausencia de Fallback Estático:** Ni `StyleModal.tsx` ni `SettingsPanel.tsx` contaban con un fallback de modelos por defecto (`DEFAULT_WHISPER_MODELS`). Si `whisperModelsList` era `[]`, la función `sortWhisperModels` retornaba `{ downloaded: [], available: [] }`, dejando la etiqueta `<select>` con **cero opciones** en el DOM.
   - **Por qué funcionaba en `.bat`:** En modo desarrollo con `.bat`, los archivos se sirven en caliente (o con Vite) con el sistema ya en memoria, por lo que el bridge respondía en <1 segundo y la lista se cargaba antes de abrir el modal.

2. **Empaquetado Incompleto de Hooks en PyInstaller (`AutoShorts.spec`):**
   - `AutoShorts.spec` incluía `'faster_whisper'` y `'ctranslate2'` solo en `hiddenimports`, omitiendo `collect_data_files('faster_whisper')` (que contiene el modelo VAD `silero_vad_v6.onnx`), `collect_data_files('ctranslate2')` y `collect_dynamic_libs('ctranslate2')` (que incluye `cudnn64_9.dll` y `libiomp5md.dll`).
   - Esto provocaba que en el portable faltaran binarios y datos críticos requeridos durante la inferencia local.

---

## 2. Alcance

### Archivos a Modificar
- `src/types.ts`: Definición y exportación de la constante global inmutable `DEFAULT_WHISPER_MODELS: WhisperModel[]`.
- `src/apiBridge.ts`: Aumento del timeout del handshake de PyWebView de 2.5s a 12s para arranque en frío en Windows, con resolución inmediata si ya existe la API.
- `src/hooks/useAppSettings.ts`:
  - Inicializar `whisperModelsList` con `DEFAULT_WHISPER_MODELS` (evita lista vacía desde el frame 0).
  - Sincronización automática de `whisperModelsList` ante cambios en `environment?.whisperModels`.
  - Mecanismo de reintento automático (retry con backoff) para `refreshEnv` si el backend tarda en responder al iniciar.
- `src/components/modals/StyleModal.tsx`:
  - Uso de fallback resiliente `whisperModelsList.length > 0 ? whisperModelsList : DEFAULT_WHISPER_MODELS`.
  - Renderizado garantizado de opciones en caso de lista vacía imprevista.
- `src/components/modals/SettingsPanel.tsx`:
  - Mismo fallback resiliente para garantizar que los modelos siempre sean visibles en la pestaña de configuración.
- `python_backend/api.py`:
  - Manejo de excepciones con log detallado en `autoshorts.log` ante fallos en `invoke()` y `environment_status()`.
  - Blindaje en `environment_status()` con fallback a los 6 modelos estándar.
- `AutoShorts.spec`:
  - Recolección automática de datos (`collect_data_files`), submódulos (`collect_submodules`) y librerías dinámicas (`collect_dynamic_libs`) para `faster_whisper` y `ctranslate2`.

### Archivos Protegidos
- `analizarrepos/`: No tocar ni modificar bajo ninguna circunstancia.

---

## 3. Paso a Paso Técnico

1. **Paso 1: Definir `DEFAULT_WHISPER_MODELS` en `src/types.ts`:**
   - Incorporar los 6 modelos oficiales Faster-Whisper (`large-v3-turbo`, `large-v3`, `medium`, `small`, `base`, `tiny`) con sus etiquetas de VRAM, descripciones y especificaciones correspondientes.
2. **Paso 2: Robustecer el Bridge en `src/apiBridge.ts`:**
   - Extender el timeout a 12000 ms (12 s) e intervalos de sondeo de 50 ms.
3. **Paso 3: Blindar el Hook `useAppSettings.ts`:**
   - Inicializar `whisperModelsList` con `DEFAULT_WHISPER_MODELS`.
   - Agregar `useEffect` dependiente de `environment?.whisperModels` para actualizar `whisperModelsList`.
   - Agregar sondeo de inicialización en los primeros segundos si el backend no ha reportado estado.
4. **Paso 4: Fallback Defensivo en `StyleModal.tsx` y `SettingsPanel.tsx`:**
   - Garantizar que si `whisperModelsList` llegara a ser `[]`, se utilicen los modelos por defecto y se muestren las opciones en el `<select>`.
5. **Paso 5: Blindar `AutoShorts.spec`:**
   - Importar `collect_data_files`, `collect_submodules`, `collect_dynamic_libs` de `PyInstaller.utils.hooks`.
   - Incorporar datos de `faster_whisper` (`silero_vad_v6.onnx`) y librerías dinámicas de `ctranslate2` (`cudnn64_9.dll`, `libiomp5md.dll`).
6. **Paso 6: Logging y Blindaje en `python_backend/api.py`:**
   - Capturar y registrar errores en `invoke()` hacia `autoshorts.log`.
7. **Paso 7: Ejecutar Suite de Tests y Compilación:**
   - Ejecutar suite de pruebas unitarias, de integración y E2E.
   - Compilar frontend con `pnpm run build`.
8. **Paso 8: Reconstruir Paquete Portable:**
   - Ejecutar `python build_portable.py` para generar la nueva distribución onedir y el ZIP con SHA-256 actualizado.
9. **Paso 9: Registrar Decisión y Git Sync:**
   - Registrar D-016 en `DECISIONS.md`.
   - Commit y push en ramas `release-v2.5` y `main`.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** Aumento en el tamaño del paquete portable al incluir binarios de `ctranslate2` y VAD.
  - *Mitigación:* Se verificará que el ZIP final permanezca muy por debajo del límite de GitHub Releases (habitualmente <400 MB).
- **Riesgo:** Incompatibilidad en equipos sin GPU dedicada.
  - *Mitigación:* Los modelos `tiny`, `base` y `small` están marcados como óptimos/moderados para CPU, y `ctranslate2` cuenta con ejecución multi-hilo en CPU vía `libiomp5md.dll`.

---

## 5. Estrategia de Testing (Gate de Cierre Obligatorio)

Conforme a la regla `RULE[user_global]`, ningún cambio se dará por cerrado sin el 100% de tests en verde en los 3 niveles:

1. **Tests Unitarios (`scratch/test_whisper_models_unit.py`):**
   - Validar que `get_installed_whisper_models()` retorne los 6 modelos con sus especificaciones exactas.
   - Validar que el fallback estático contenga las 6 claves obligatorias (`id`, `name`, `vram`, `downloaded`, `recommended`, `desc`).
   - Validar que `faster_whisper_available()` opere sin excepciones.
2. **Tests de Integración (`scratch/test_whisper_models_integration.py`):**
   - Probar que `Api.environment_status()` retorne un diccionario con `whisperModels` poblado (longitud = 6) y `hasLocalWhisperModel: True`.
   - Simular la llamada RPC `Api.invoke('environment_status')` y verificar la integridad de la estructura devuelta.
   - Verificar la presencia de `silero_vad_v6.onnx` y librerías de `ctranslate2` en los hooks de PyInstaller.
3. **Tests E2E (`scratch/test_whisper_models_e2e.py`):**
   - Compilación completa de React (`pnpm run build`) verificando cero errores TypeScript/Vite.
   - Prueba de simulación end-to-end del flujo de carga de configuración e inicialización de modelos emulando la respuesta de PyWebView hacia el componente frontend.
   - Verificación de la compilación exitosa y tamaño del ZIP portable con `build_portable.py`.

---

## 6. Skills Aplicadas

- `senior-code-craft`: Arquitectura defensiva, eliminación de condiciones de carrera en el bridge, refactorización desacoplada de hooks y tipado estricto.
- `antislop`: Código limpio sin comentarios innecesarios, sin texto de relleno ni caracteres prohibidos como em dashes (`—`).

