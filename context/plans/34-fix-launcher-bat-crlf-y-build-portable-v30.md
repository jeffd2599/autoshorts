# Plan 34: Corrección de Saltos de Línea CRLF en Launcher .BAT y Generación de Portable v3.0

## 1. Diagnóstico
1. **Fallo en `AutoShorts.bat`**: Al ejecutar el archivo `.bat`, `cmd.exe` arroja errores sistemáticos:
   ```text
   "etlocal" no se reconoce como un comando...
   "itle" no se reconoce como un comando...
   "d" no se reconoce como un comando...
   "cho" no se reconoce como un comando...
   "et" no se reconoce como un comando...
   [X] ERROR: No se encontro ninguna instalacion de Python.
   ```
   *Causa Raíz:* El archivo tiene saltos de línea Unix (`\n` / LF) en vez de Windows (`\r\n` / CRLF). El motor de procesamiento por lotes de Windows requiere estrictamente `\r\n`; al encontrar sólo `\n`, sufre un desplazamiento de cursor y se traga el primer carácter de cada línea de código. Además, añadiremos como respaldo la ruta explícita al Python 3.11 instalado en el sistema (`%LOCALAPPDATA%\Programs\Python\Python311\python.exe`) para que funcione infaliblemente bajo cualquier circunstancia.
2. **Ausencia de binarios en `dist/`**: En `dist/` sólo residen los assets web generados por Vite (`index.html`, `assets/`), ya que aún no se ha ejecutado el empaquetado de PyInstaller de la v3.0.
   *Solución:* Adaptar `build_portable.py` para usar `node node_modules/vite/bin/vite.js build` (evitando bloqueos de política de ejecución de PowerShell en `pnpm.cmd`) y compilar la distribución portable onedir `dist/AutoShorts/AutoShorts.exe` junto al archivo oficial `AutoShorts-v3.0.0-windows-x64-portable.zip`.

---

## 2. Alcance
- **Modificar:** `AutoShorts.bat` (convertir a saltos de línea CRLF puros y robustecer la detección de Python).
- **Modificar:** `build_portable.py` (invocar build de vite de forma nativa multiplataforma con `node node_modules/vite/bin/vite.js build`).
- **Generar:** Compilación portable `dist/AutoShorts/AutoShorts.exe` y archivo de distribución `dist/AutoShorts-v3.0.0-windows-x64-portable.zip` con su hash SHA-256.

---

## 3. Paso a Paso Técnico
1. **Reparar `AutoShorts.bat`**:
   - Reescribir `AutoShorts.bat` asegurando codificación ANSI / UTF-8 con finales de línea `\r\n` (CRLF) estrictos.
   - En la detección de Python, incluir verificación directa de `%LOCALAPPDATA%\Programs\Python\Python311\python.exe` y `py -3.11` antes de fallar.
2. **Ajustar `build_portable.py`**:
   - Reemplazar `pnpm.cmd run build` por `node node_modules/vite/bin/vite.js build` en el Paso 1 para evitar bloqueos por políticas de ejecución de scripts de Windows.
3. **Generar el ejecutable portable y ZIP v3.0**:
   - Ejecutar `python build_portable.py`.
   - Verificar la creación exitosa de `dist/AutoShorts/AutoShorts.exe` y del archivo comprimido `dist/AutoShorts-v3.0.0-windows-x64-portable.zip`.
   - Validar que la cabecera PE tenga `Subsystem = 2` (sin terminal parásita).
4. **Verificación de prueba**:
   - Probar la ejecución de `AutoShorts.bat` verificando que lance la aplicación de escritorio de forma inmediata.

---

## 4. Riesgos e Implicaciones
- **Tiempo de compilación:** PyInstaller puede tardar 2-3 minutos en recolectar dependencias y binarios CTranslate2 / PyTorch / WebView2.
- **Instancias abiertas:** Si `AutoShorts.exe` estuviera abierto en segundo plano, PyInstaller no podría sobrescribirlo; se validará que no haya procesos activos.

---

## 5. Estrategia de Testing
- **Test 1:** Comprobación binaria de que `AutoShorts.bat` contiene únicamente bytes `\r\n` y no `\n` aislados.
- **Test 2:** Ejecución de `AutoShorts.bat` verificando código de salida 0 y que reconozca Python del sistema sin mensajes de error de comandos truncados.
- **Test 3:** Verificación de existencia de `dist/AutoShorts/AutoShorts.exe`, `dist/AutoShorts-v3.0.0-windows-x64-portable.zip` y su `.sha256`.

---

## 6. 🚦 Recomendación EGM (Semáforo de Complejidad y Tokens)
🟢 **Tarea Pequeña / Acotada (No requiere EGM):**  
Se trata de una corrección de formato de archivo (CRLF) en el script de lanzamiento `.bat` y la ejecución del script de empaquetado portable. No afecta lógica algorítmica ni introduce cambios arquitectónicos. Usar EGM consumiría tokens innecesariamente.  
**Recomendación:** Responder **`PLAN APROBADO`**.
