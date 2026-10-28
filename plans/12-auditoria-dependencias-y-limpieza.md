# Plan de Acción 12: Auditoría Integral de Dependencias, Purga de Código Muerto y Sincronización

## 1. Diagnóstico y Entendimiento del Problema

El usuario observó acertadamente que la reducción drástica del paquete portable (de 2.41 GB a 178 MB) se debió a que PyTorch no es requerido por el runtime de inferencia CTranslate2/faster-whisper. A partir de este hallazgo, surge la necesidad de **auditar exhaustivamente todo el proyecto** (frontend y backend) para determinar con precisión matemática:
- **Qué dependencias son estrictamente necesarias** para el funcionamiento de AutoShorts.
- **Qué librerías, módulos o paquetes son código muerto, redundancias o artefactos heredados** que ensucian el proyecto o aumentan el peso innecesariamente.

### Hallazgos de la Auditoría Técnica (Solo Lectura):

1. **Frontend (Ecosistema NPM / React):**
   - **Dependencias Huérfanas de Tauri:** `package.json` todavía incluye `@tauri-apps/api`, `@tauri-apps/plugin-dialog` y `@tauri-apps/cli`, junto con los scripts `"tauri"`, `"tauri:dev"` y `"tauri:build"`. En `src/apiBridge.ts` aún existen bloques `import("@tauri-apps/...")` dentro de comprobaciones `window.__TAURI_INTERNALS__`.
   - *Realidad del Proyecto:* AutoShorts migró completamente a **Python 3 / PyWebView** (Decisiones D-002, D-003). No existe carpeta `src-tauri` ni binarios de Rust. Mantener `@tauri-apps` introduce paquetes muertos en `node_modules`.
   - **Conflicto de Gestor de Paquetes:** Existe `package-lock.json` (de npm) coexistiendo con `pnpm-lock.yaml`, violando la directriz D-006 (Estandarización Obligatoria en `pnpm`).

2. **Backend (Ecosistema Python):**
   - **`requirements.txt` Desactualizado y Engañoso:**
     - Incluye `torch>=2.0.0` y una nota que indica erróneamente que se necesita PyTorch para aceleración CUDA en Whisper. `faster-whisper` corre sobre `ctranslate2`, que ejecuta CUDA FP16 de manera nativa e independiente.
     - **Falta una dependencia real:** `Pillow` (`PIL`) se utiliza en `python_backend/media.py` (`generate_title_sticker_png`) para renderizar tipografías, stickers y overlays gráficos de los shorts, pero no está declarada formalmente en `requirements.txt`.
   - **`AutoShorts.spec`:**
     - Incluye `'psutil'` en `hiddenimports`, pero `psutil` **no se importa en ningún archivo del proyecto** (la telemetría de CPU y memoria se realiza mediante llamadas directas de la API Win32 en `ctypes` y `nvidia-smi` en `python_backend/telemetry.py`).

3. **Archivos y Directorios en la Raíz:**
   - `analizarrepos/`: **SE CONSERVA INTACTA** (el usuario la utilizará para analizar e integrar código posteriormente).
   - `AutoShorts.vbs`: Script VBScript residual de 200 bytes en desuso.

### Skills Aplicadas del Workspace (`.agent/skills`):
- **`senior-code-craft`:**
  - `refactor:clean-code`: Eliminación de código muerto en `src/apiBridge.ts` (eliminación de fallbacks fantasma de Tauri), desvinculación de dependencias no utilizadas en `package.json` y `requirements.txt`.
  - `quality:produccion`: Tipado estricto en la API bridge de PyWebView y blindaje de llamadas asíncronas.
  - `test:estrategia`: Suite de pruebas automatizadas en 3 niveles (unitario de dependencias, compilación de bundle y validación de ejecución portable).
- **`antislop-code`:**
  - Higiene estricta de comentarios en `src/apiBridge.ts` y en `AutoShorts.spec`: mantener comentarios arquitectónicos con propósito, sin notas redundantes ni comentarios obvios de IA.

---

## 2. Alcance (Archivos Afectados)

### Archivos a Modificar:
- `src/apiBridge.ts`:
  - Retirar los bloques muertos de `@tauri-apps/api` y `@tauri-apps/plugin-dialog`.
  - Simplificar el puente para que sea 100% nativo de PyWebView con manejo de errores robusto y tipado estricto.
- `package.json`:
  - Eliminar scripts de tauri (`tauri`, `tauri:dev`, `tauri:build`).
  - Eliminar dependencias: `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/cli`.
- `requirements.txt`:
  - Retirar `torch>=2.0.0` y la nota confusa de PyTorch.
  - Añadir `pillow>=10.0.0` (utilizado por el generador de stickers y títulos en `media.py`).
  - Documentar claramente que la aceleración GPU es gestionada de forma autónoma por `ctranslate2`.
- `AutoShorts.spec`:
  - Retirar `'psutil'` de `hiddenimports`.
- `README.md` y `DECISIONS.md`:
  - Actualizar especificaciones de dependencias y registrar la decisión D-015 de purga de dependencias heredadas.

### Archivos a Eliminar:
- `package-lock.json` (se mantiene exclusivamente `pnpm-lock.yaml`).
- `AutoShorts.vbs` (script residual en desuso).

### Elementos Protegidos (NO se tocan):
- `analizarrepos/` (conservada intacta según instrucción explícita del usuario).

---

## 3. Paso a Paso Técnico

1. **Limpieza del Frontend:**
   - Modificar `src/apiBridge.ts` eliminando las ramas condicionales de Tauri y dejando el puente limpio hacia `window.pywebview.api` y eventos del DOM.
   - Editar `package.json` para retirar las dependencias y scripts de Tauri.
   - Ejecutar `pnpm install` para actualizar `pnpm-lock.yaml` y desinstalar los paquetes eliminados de `node_modules`.
   - Eliminar `package-lock.json`.
   - Validar compilación TypeScript y bundle frontend: `pnpm.cmd run build`.

2. **Actualización de Dependencias del Backend:**
   - Actualizar `requirements.txt`: incorporar `pillow>=10.0.0`, retirar `torch>=2.0.0` y actualizar comentarios técnicos.
   - Actualizar `AutoShorts.spec` retirando `'psutil'` de `hiddenimports`.
   - Eliminar `AutoShorts.vbs` (script residual en desuso).

3. **Verificación y Re-empaquetado:**
   - Ejecutar la suite completa de tests de testing (`scratch/test_*.py`).
   - Crear un test específico (`scratch/test_dependency_audit.py`) que verifique que ningún archivo importe paquetes no declarados o paquetes purgados.
   - Ejecutar `python build_portable.py` para asegurar que el bundle portable se compila de forma limpia y verificar su nuevo tamaño y hash SHA-256.

4. **Sincronización Git:**
   - Commit en `release-v2.5`.
   - Merge a `main`.
   - Push de ambas ramas a GitHub.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** ¿Podría romperse la comunicación entre React y Python al remover Tauri de `apiBridge.ts`?
  - *Mitigación:* AutoShorts se ejecuta exclusivamente sobre WebView2 / PyWebView (`window.pywebview.api`). La condición `__TAURI_INTERNALS__` nunca se cumplía en ejecución real. Se validará mediante build del frontend y pruebas de integración.
- **Riesgo:** ¿Podría fallar la generación de subtítulos/stickers sin Pillow?
  - *Mitigación:* Al agregar explícitamente `pillow>=10.0.0` en `requirements.txt` y en `AutoShorts.spec`, garantizamos que cualquier instalación limpia de Python cuente con la librería necesaria para el procesamiento de imágenes.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Test Unitario de Auditoría de Dependencias (`scratch/test_dependency_audit.py`):**
  - Verificar que ningún archivo en `src/` importe `@tauri-apps/*`.
  - Verificar que ningún archivo en `python_backend/` importe `psutil` ni requiera obligatoriamente `torch`.
  - Verificar que `Pillow` (`PIL`) esté disponible e importe correctamente.
- **Test de Compilación del Frontend:**
  - `pnpm.cmd run build` completado con código de salida 0 sin advertencias de tipado.
- **Test de la Suite Completa:**
  - `python -m unittest discover -s scratch -p "test_*.py"` con el 100% de tests en verde (23+ tests).
- **Test de Lanzamiento del Paquete Portable:**
  - Lanzar el binario generado `dist/AutoShorts/AutoShorts.exe` en un proceso hijo y verificar inicio sin errores.
- **Criterio de Aceptación:**
  - 100% de los tests en verde antes de dar por cerrada la tarea.
