# Plan de Acción 13: Actualización Integral del README para AutoShorts v2.5.0

## 1. Diagnóstico y Entendimiento del Problema

El usuario preguntó: *"bien perfecto el readme lo actualizaste??"*.
Al inspeccionar detalladamente `README.md` (408 líneas), se constata que:

1. **Instrucciones Obsoletas de Instalación de PyTorch:**
   - La sección `3. Instalar PyTorch` (líneas 234-245) y la sección de solución de problemas (líneas 370-376) aún indican a los usuarios instalar ~2.5 GB de PyTorch (`torch`, `torchvision`, `torchaudio`). Tras las decisiones **D-014** y **D-015**, la inferencia de Whisper corre exclusivamente sobre **CTranslate2** (`ctranslate2.dll`), que detecta y utiliza CUDA de forma nativa sin requerir PyTorch.
2. **Referencias a `AutoShorts.vbs`:**
   - En el diagrama Mermaid (líneas 68, 71), el índice (línea 41), la sección de modos de ejecución (líneas 276-284) y el árbol de directorios (línea 351) aún se menciona `AutoShorts.vbs`, el cual fue eliminado formalmente en D-015.
3. **Omisión de la Release Portable Oficial v2.5.0:**
   - La sección de cierre (líneas 388-394) sigue tratando la versión portable como una idea futura ("*Roadmap y Futura Release Portable*"), en lugar de presentar la distribución oficial actual `AutoShorts-v2.5.0-windows-x64-portable.zip` (178 MB) lista para descargar y usar sin instalar nada.
4. **Nuevas Funcionalidades de la v2.5.0 sin Documentar:**
   - No se documenta la arquitectura de proyectos autónomos (`autoshorts.project` en la raíz de cada grabación con auto-migración y re-vinculación).
   - No se documenta el visor de terminal y logs integrado (`LogsModal.tsx`, `logger.py`).
   - No se documentan los chunks adaptativos por bisección ante desbordamiento de contexto (4k/8k) ni el Circuit Breaker.
   - No se explica el almacenamiento dual: modo portable (`./data/`) vs modo estándar (`%USERPROFILE%/.autoshorts/`).

---

## 2. Alcance (Archivos Afectados)

### Archivos a Modificar:
- `README.md`:
  - Actualizar el encabezado y badges (añadir badge de Release v2.5.0 y CTranslate2).
  - Añadir sección destacada: **Descarga Directa Portable (Zero-Install)** al inicio.
  - Actualizar el diagrama Mermaid eliminando `AutoShorts.vbs` e integrando el visor de logs y `autoshorts.project`.
  - Incorporar en las funcionalidades principales:
    - *Proyectos Autónomos (`autoshorts.project`)*.
    - *Visor de Terminal y Logs en Vivo*.
    - *Chunks Adaptativos por Bisección (4k/8k) y Circuit Breaker*.
  - Actualizar la guía de instalación para desarrolladores: eliminar el paso 3 de PyTorch; la instalación se reduce a `pip install -r requirements.txt`.
  - Eliminar la subsección de `AutoShorts.vbs` en Modos de Ejecución.
  - Actualizar el árbol de archivos del repositorio (reflejando `build_portable.py`, `AutoShorts.spec`, eliminación de `.vbs`).
  - Actualizar la sección de resolución de problemas con el diagnóstico correcto para CTranslate2/CUDA.
  - Actualizar la sección final de Releases y Roadmap.

---

## 3. Paso a Paso Técnico

1. **Revisión y Ajuste del Diagrama Mermaid y Header:**
   - Retirar nodo `VBS` del diagrama Mermaid.
   - Reflejar la arquitectura v2.5.0.
2. **Documentación de Nuevas Características v2.5.0:**
   - Redactar con claridad técnica las explicaciones de proyectos autónomos, visor de logs y chunks adaptativos (respetando `antislop-copywriting`: sin guiones largos `—`, conciso, con valor técnico real).
3. **Actualización de la Guía de Instalación:**
   - Unificar la instalación de Python en un único comando limpio: `pip install -r requirements.txt`.
4. **Actualización de Resolución de Problemas y FAQ:**
   - Sustituir la verificación de PyTorch por:
     ```python
     python -c "import ctranslate2; print('Dispositivos CUDA:', ctranslate2.get_cuda_device_count())"
     ```
5. **Testing de Integridad de Documentación:**
   - Verificar sintaxis de enlaces markdown y visualización de bloques de código.
   - Ejecutar la suite de tests (`scratch/test_*.py`) para asegurar 100% verde.
6. **Sincronización Git:**
   - Commit en `release-v2.5`, merge a `main` y push a `origin`.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** Generar discrepancias entre la documentación y el código real.
  - *Mitigación:* Todas las afirmaciones se validan contra el código implementado y las decisiones D-001 a D-015 registradas en `DECISIONS.md`.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Test de Documentación y Sintaxis:**
  - Validar que no existan enlaces rotos a archivos eliminados (como `AutoShorts.vbs`).
  - Validar que la suite completa de 29 tests siga pasando al 100%.
- **Criterio de Aceptación:**
  - 100% de tests en verde y `README.md` completamente alineado con la versión v2.5.0.
