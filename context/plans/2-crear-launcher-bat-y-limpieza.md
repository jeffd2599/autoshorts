# Plan de Acción 2: Creación de Lanzador Batch (.bat) y Limpieza de Empaquetado Antiguo

## 1. Diagnóstico

Actualmente, para ejecutar AutoShorts el usuario debe abrir una terminal manualmente y escribir `python run.py`. Para simplificar el flujo de trabajo y evitar la fricción en el día a día, se requiere un archivo de inicio por lotes (`.bat`) de un solo clic que:
- Detecte automáticamente si existe un entorno virtual (`venv`, `.venv`, `env`) o utilice el Python del sistema en el `PATH`.
- Se posicione automáticamente en el directorio del proyecto (`%~dp0`).
- Ejecute `run.py` mostrando información clara de inicio.
- Si ocurre algún error o cierre inesperado, mantenga la ventana abierta con una pausa para que el usuario pueda inspeccionar el mensaje de error en lugar de cerrarse abruptamente.

Adicionalmente, el script de empaquetado previo `build_exe.py` y su archivo de configuración `AutoShorts.spec` resultaron ineficaces y obsoletos, generando carpetas residuales (`build_tmp/` y `release/`). El usuario solicitó prescindir de ellos, reservando la creación de una versión portable real para un hito futuro orientado a releases de GitHub.

---

## 2. Alcance

### Archivos a crear
- `AutoShorts.bat`: Lanzador ejecutable con un clic para Windows.

### Archivos y carpetas a eliminar / limpiar
- `build_exe.py`: Script antiguo de PyInstaller que no funcionaba correctamente.
- `AutoShorts.spec`: Configuración obsoleta de PyInstaller.
- `build_tmp/`: Carpeta temporal generada por compilaciones anteriores.
- `release/`: Carpeta con artefactos fallidos de compilación anterior.

### Archivos a modificar
- `README.md`: Actualizar la sección de ejecución para documentar el nuevo lanzador `AutoShorts.bat` y retirar las instrucciones obsoletas de `build_exe.py`, anotando el roadmap hacia una release portable en GitHub.
- `DECISIONS.md`: Registrar la decisión de prescindir de `build_exe.py` y adoptar `AutoShorts.bat`.

---

## 3. Paso a Paso Técnico

1. **Creación de `AutoShorts.bat`**:
   - Configuración de encabezados y título de consola.
   - Posicionamiento seguro en el directorio del archivo (`cd /d "%~dp0"`).
   - Detección secuencial del intérprete: `venv\Scripts\python.exe` -> `.venv\Scripts\python.exe` -> `env\Scripts\python.exe` -> `python` en PATH.
   - Mensaje de diagnóstico si no se encuentra ningún intérprete de Python disponible.
   - Ejecución de `run.py`.
   - Control de retorno: si el código de salida es distinto de cero (`%errorlevel% neq 0`), pausar para visualización del stacktrace.

2. **Eliminación de Artefactos Obsoletos de Compilación**:
   - Eliminar `build_exe.py` y `AutoShorts.spec`.
   - Limpiar los directorios residuales `build_tmp/` y `release/`.

3. **Actualización de Documentación y Decisiones**:
   - Actualizar `README.md` sustituyendo la sección de `build_exe.py` por la guía de inicio rápido con `AutoShorts.bat` y el roadmap de versión portable.
   - Añadir entrada concisa en `DECISIONS.md`.

---

## 4. Riesgos e Implicaciones

| Riesgo / Implicación | Impacto | Mitigación |
| :--- | :--- | :--- |
| **Rutas con espacios en Windows** | Bajo | En `AutoShorts.bat`, todas las rutas y variables se encerrarán entre comillas (`"%PYTHON_EXE%"` y `cd /d "%~dp0"`). |
| **Eliminación de archivos que puedan necesitarse más adelante** | Bajo | La creación de una release portable futura utilizará un enfoque más moderno y limpio (como un paquete portable con runtime integrado o un pipeline de GitHub Actions limpio), por lo que eliminar los archivos rotos actuales previene confusiones. |
