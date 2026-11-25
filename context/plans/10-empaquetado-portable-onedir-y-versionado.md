# Plan de Acción 10: Ramas de Release, Archivos de Proyecto Autónomos (Auto-Migración), Visor de Logs en UI y Empaquetado Portable (PyInstaller onedir)

## 1. Diagnóstico y Entendimiento del Problema

El usuario ha enriquecido la visión arquitectónica de AutoShorts con cuatro pilares fundamentales para una entrega de nivel profesional:

1. **Gestión de Ramas Git y Versionado Semántico:**
   - Ramas de release existentes verificadas: `release-v1.0`, `release-v1.5`, `release-v2.0`.
   - Siguiendo la secuencia de incrementos de 0.5, la siguiente rama de release a partir de `main` es **`release-v2.5`**.
   - El versionado se unificará en **`v2.5.0`** (`python_backend/version.py`, `package.json`), generando el artefacto portable final `AutoShorts-v2.5.0-windows-x64-portable.zip`.

2. **Archivos de Proyecto Autónomos (`autoshorts.project` estilo Premiere / CapCut) y Auto-Migración:**
   - Las carpetas de grabación (por ejemplo en `E:\Disco OLD\Streaming\01_Grabaciones\LIVE-2026-10-09/`) ya contienen `audio/`, `clips/`, `summary/` y el video fuente.
   - Guardar dentro de cada carpeta el archivo autónomo `autoshorts.project` con el estado completo (metadata, duración, transcripción con timestamps y marcas acústicas, y candidatos virales).
   - **Auto-Migración Transparente:** Los proyectos existentes en la base de datos o en disco que aún no cuenten con `autoshorts.project` serán detectados automáticamente por AutoShorts al iniciar y se generará su archivo de proyecto al vuelo sin intervención del usuario.
   - **Apertura e Importación Bidireccional:**
     - En *"Importar Grabación"*: si la carpeta seleccionada ya tiene `autoshorts.project`, se recupera al instante la transcripción y candidatos, evitando minutos de GPU innecesarios con Whisper o LLM.
     - Botón *"Abrir Proyecto"* en el Dashboard: permite abrir directamente cualquier carpeta de grabación o archivo `autoshorts.project` desde cualquier disco o pendrive.

3. **Visor de Logs y Terminal Integrada en la Interfaz (Frontend Logs Viewer):**
   - Al distribuir la versión portable sin consola negra CMD visible (`console=False`), el usuario pierde la visibilidad en tiempo real de lo que ocurre en el backend (liberación de VRAM, estado de CTranslate2, tokens LLM, errores, etc.).
   - Se implementará un **Visor de Terminal / Logs en vivo** accesible desde el Sidebar y la StatusBar:
     - En el backend: interceptor y buffer circular de logs con rotación en `autoshorts.log` y emisión de eventos en tiempo real hacia WebView2.
     - En el frontend: modal/panel estilo terminal oscura con resaltado de sintaxis (`[ADAPTIVE]`, `[CUDA]`, `[VRAM]`, `[INFO]`, `[ALERTA]`, `[ERROR]`), auto-scroll, botón de copiar al portapapeles y botón para limpiar pantalla.

4. **Arquitectura Portable Real para Windows (`--onedir` + ZIP):**
   - Empaquetado PyInstaller en modo carpeta (`--onedir`), arranque veloz sin descompresión en `%TEMP%`.
   - Separación de rutas mediante `paths.py` (`RESOURCE_DIR` para solo lectura vs `USER_DATA_DIR` para datos mutables o modo pendrive `data/`).
   - `multiprocessing.freeze_support()` en `run.py`.
   - Script de automatización `build_portable.py` (`pnpm.cmd run build` + PyInstaller + ZIP con SHA-256).

---

## 2. Alcance (Archivos Afectados)

### Ramas y Control de Versión:
- Creación de la rama **`release-v2.5`** a partir de `main` tras recibir `PLAN APROBADO`.

### Archivos Nuevos a Crear:
- `python_backend/version.py`: Definición única de versión (`__version__ = "2.5.0"`, `APP_NAME = "AutoShorts"`).
- `python_backend/paths.py`: Resolución de rutas portables (`RESOURCE_DIR`, `USER_DATA_DIR`, `get_ffmpeg_path()`).
- `python_backend/logger.py`: Interceptor de salida estándar, buffer circular en memoria y escritura rotativa en `autoshorts.log`.
- `src/components/modals/LogsModal.tsx`: Componente de terminal con estética oscura, resaltado de sintaxis, copia al portapapeles y auto-scroll.
- `AutoShorts.spec`: Especificación PyInstaller en modo `onedir` (`COLLECT`) con assets web, iconos y dependencias.
- `build_portable.py`: Script automatizado para compilar frontend, compilar backend con PyInstaller y empaquetar `.zip` con SHA-256.
- `scratch/test_project_file_unit.py`: Tests unitarios de serialización, deserialización y migración automática de `autoshorts.project`.
- `scratch/test_portable_paths_unit.py`: Tests unitarios de resolución de rutas en modo normal y frozen.
- `scratch/test_logger_unit.py`: Tests unitarios para el capturador y buffer de logs.
- `scratch/test_project_sync_integration.py`: Test de integración del ciclo completo de proyectos y restauración sin re-transcripción.

### Archivos a Modificar:
- `python_backend/services/project_service.py`:
  - `save_project_file()`, `load_project_file()`, `sync_project_to_disk()`, `migrate_existing_projects_to_disk()`.
- `python_backend/api.py`:
  - Sincronización automática de `autoshorts.project` en eventos del ciclo de vida del proyecto.
  - Auto-detección en `create_project_from_path` para restaurar transcripción y momentos si ya existen.
  - Nuevos endpoints de API: `import_existing_project(path)` y `get_system_logs()`, `clear_system_logs()`.
- `python_backend/stream_server.py`:
  - Usar `get_resource_dir()` para resolver `dist/` en modo congelado.
- `run.py`:
  - `multiprocessing.freeze_support()` y conexión con `logger.py` y `paths.py`.
- `src/components/panels/HomeDashboard.tsx`:
  - Botón *"Abrir Proyecto"* en cabecera junto a *"Importar Grabación"*.
- `src/components/panels/Sidebar.tsx`:
  - Botón *"Terminal / Logs"* con icono `Terminal` en la sección inferior.
- `src/components/common/StatusBar.tsx`:
  - Acceso directo a logs desde la barra de estado.
- `src/hooks/useProjectActions.ts` y `src/App.tsx`:
  - Estado global del modal de logs (`showLogsModal`).
  - Lógica para importar/abrir proyecto y restaurar estado sin re-ejecutar Whisper.
- `package.json`:
  - Actualizar versión a `"2.5.0"`.
- `README.md` y `DECISIONS.md`:
  - Documentar arquitectura de proyectos autónomos, visor de terminal y registrar D-013.

---

## 3. Paso a Paso Técnico

### Fase 1: Branching en Git y Versionado Semántico
1. Crear y cambiar a la rama `release-v2.5` a partir de `main`:
   `git checkout -b release-v2.5`
2. Crear `python_backend/version.py`:
   `__version__ = "2.5.0"`
   `APP_NAME = "AutoShorts"`
3. Sincronizar `package.json` con `"version": "2.5.0"`.

### Fase 2: Sistema de Archivo de Proyecto Autónomo (`autoshorts.project`) y Auto-Migración
1. **Módulo de Proyecto (`project_service.py`):**
   - Definir constante `PROJECT_FILE_NAME = "autoshorts.project"`.
   - `serialize_project(db, project_id) -> Dict[str, Any]`: empaqueta metadata, transcripción completa y lista de candidatos.
   - `save_project_file(project_dir: Path, data: Dict[str, Any]) -> Path`: escribe el archivo de forma atómica (archivo temporal + reemplazo seguro).
   - `load_project_file(path_or_dir: Path) -> Optional[Dict[str, Any]]`: localiza y parsea el archivo de proyecto.
   - `restore_project_to_db(db, file_or_dir: Path) -> Dict[str, Any]`: inserta o actualiza registros en SQLite (`projects`, `transcripts`, `candidates`) vinculando automáticamente la ruta de video existente.
   - `auto_migrate_legacy_projects(db, data_dir: Path)`: recorre proyectos registrados y genera su `autoshorts.project` si aún no existe en su carpeta.
2. **Integración en `api.py`:**
   - Invocar `auto_migrate_legacy_projects` al iniciar la API.
   - En `create_project_from_path`: verificar si en la carpeta del video existe `autoshorts.project`. Si existe, restaurar la transcripción y candidatos al instante en lugar de crear un proyecto en blanco.
   - En `save_transcript` y `replace_candidates`: sincronizar de inmediato al archivo de disco.
   - Añadir método `import_project_dialog()` / `import_existing_project(path)`: permite al usuario seleccionar una carpeta o archivo `.project` y cargarlo al listado.

### Fase 3: Visor de Logs y Terminal Integrada en la Interfaz
1. **Backend (`python_backend/logger.py`):**
   - Crear `SystemLogBuffer`: buffer circular de las últimas 1,000 líneas con timestamp `[HH:MM:SS]`.
   - Redireccionar `sys.stdout` y `sys.stderr` manteniendo salida dual a archivo rotativo `autoshorts.log` y emisión en vivo vía WebView2 (`log-event`).
   - Métodos en `Api`: `get_system_logs()` y `clear_system_logs()`.
2. **Frontend (`LogsModal.tsx` y `App.tsx`):**
   - Crear modal de terminal con tema oscuro obsidiana (`#090d16`), tipografía monospace (`JetBrains Mono`, `Consolas`), coloreado semántico de líneas (`[ADAPTIVE]`, `[CUDA]`, `[VRAM]`, `[INFO]`, `[WARNING]`, `[ERROR]`).
   - Botón *"Copiar Logs"* para soporte o depuración rápida.
   - Botón *"Auto-scroll"* y *"Limpiar"*.
   - Integrar botón *"Terminal / Logs"* en `Sidebar.tsx` (al lado de Configuración) y en `StatusBar.tsx`.

### Fase 4: Integración en Experiencia de Usuario (UI de Proyectos)
1. En `HomeDashboard.tsx`:
   - Añadir botón *"Abrir Proyecto"* (icono `FolderOpen`) junto a *"Importar Grabación"*.
2. En `useProjectActions.ts`:
   - Al detectar un proyecto existente con transcripción previa, omitir la fase de Whisper y mostrar notificación de éxito: *"Proyecto y transcripción restaurados desde disco"*.

### Fase 5: Arquitectura de Rutas Portables (`paths.py`) y `run.py`
1. Crear `python_backend/paths.py`:
   - `get_resource_dir()`: resuelve `sys._MEIPASS` en modo congelado o raíz del proyecto en desarrollo.
   - `get_user_data_dir()`: si existe `data/` o `portable.mode` junto a `sys.executable`, usa esa ruta (USB portátil estricto); de lo contrario `Documents/AutoShorts`.
   - `get_ffmpeg_path()` y `get_ffprobe_path()`: prioriza binarios empaquetados en `_internal/bin/` y luego PATH.
2. Actualizar `run.py`:
   - Invocar `multiprocessing.freeze_support()` en la primera línea.
   - Configurar `logger.init_logging(get_user_data_dir())`.
   - Apuntar `stream_server` a `get_resource_dir() / "dist"`.

### Fase 6: Empaquetado PyInstaller (`--onedir`) y Script de Distribución ZIP
1. Crear `AutoShorts.spec`:
   - Modo `onedir` (`COLLECT`).
   - Copiar `dist/`, `icon.ico`, `icon.png` y binarios de `ffmpeg` si están disponibles.
   - Declarar `hiddenimports` para faster-whisper, ctranslate2, torch, webview.
2. Crear `build_portable.py`:
   - Compila el frontend con `pnpm.cmd run build`.
   - Ejecuta `pyinstaller --clean AutoShorts.spec`.
   - Comprime `dist/AutoShorts` en `dist/AutoShorts-v2.5.0-windows-x64-portable.zip`.
   - Imprime el hash criptográfico SHA-256.

---

## 4. Riesgos e Implicaciones

- **Rutas de Video en Unidades Cambiadas (ej. de `D:\` a `E:\` o USB):**
  - *Mitigación:* Si la ruta absoluta grabada en `autoshorts.project` no existe al abrirlo en otra PC, el cargador buscará automáticamente en la misma carpeta del proyecto si hay un archivo con el mismo nombre base o extensión multimedia (`.mp4`, `.mkv`, `.mov`) y re-vinculará la ruta silenciosamente.
- **Sobrecarga de Eventos de Log hacia el WebView:**
  - *Mitigación:* El backend agrupa o limita el envío de eventos de logs para no saturar el canal IPC de WebView2 durante operaciones intensivas de Whisper.
- **Rendimiento de Escritura Atómica:**
  - *Mitigación:* La escritura de `autoshorts.project` se hace únicamente al finalizar fases clave (transcripción completada, candidatos detectados, renombrado), sin afectar el rendimiento de inferencia.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Tests Unitarios (`scratch/test_project_file_unit.py`, `scratch/test_logger_unit.py`, `scratch/test_portable_paths_unit.py`):**
  - Serialización y deserialización de `autoshorts.project` (metadata + transcripción + candidatos).
  - Auto-migración de proyectos existentes sin archivo previo.
  - Re-vinculación inteligente de video cuando la ruta absoluta no existe.
  - Buffer de logs y formato de timestamps.
  - Resolución de rutas en desarrollo vs `sys.frozen = True`.
  - Sincronización de versión `2.5.0` entre `version.py` y `package.json`.
- **Tests de Integración (`scratch/test_project_sync_integration.py`):**
  - Flujo de creación de proyecto -> transcripción -> detección de momentos -> validación de archivo en disco.
  - Apertura/importación de proyecto desde disco sin repetir Whisper.
  - Compilación exitosa del frontend con `pnpm.cmd run build`.
- **Tests E2E / Distribución:**
  - Validación sintáctica y de dependencias de `AutoShorts.spec`.
  - Validación de la estructura interna del archivo `.zip` resultante.
- **Criterio de Aceptación:**
  - 100% de los tests en verde antes de dar por cerrada la tarea.
