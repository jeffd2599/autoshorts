# Plan de Acción 7: Nuevo Logo e Identidad Visual para AutoShorts, Actualización de README y Consolidación de Git Commit

## 1. Diagnóstico y Entendimiento del Problema

1. **Logo e Icono Desactualizado:**
   - El archivo `icon.ico` e `icon.png` actuales en la raíz del proyecto provienen del repositorio base anterior. Presentan una figura genérica (asterisco verde menta con cuadrados) que no guarda relación con la identidad, el propósito ni la estética de AutoShorts.
   - `index.html` carece actualmente de la etiqueta `<link rel="icon" ...>`, por lo que el navegador y la ventana de escritorio muestran el icono en blanco por defecto.
   - AutoShorts es una suite de escritorio especializada en la **extracción, detección con IA y edición de clips verticales virales (9:16 Shorts, Reels y TikTok)**. Necesita una identidad visual propia, profesional y moderna: un imagotipo estilizado que combine el formato de clip vertical (9:16) con dinamismo, corte inteligente de video y gradientes premium neón sobre fondo oscuro.

2. **Actualización de Documentación (`README.md`):**
   - El `README.md` debe reflejar la nueva identidad visual y consolidar las decisiones de arquitectura implementadas en las fases previas:
     - D-007: Inicio directo y libre sin onboarding bloqueante.
     - D-008: Detección dinámica de VRAM y GPU en tiempo real (sin valores fijos a RTX 2060).
     - D-009: Fusión del prompt de alta retención para detección de momentos virales y social copy conciso de 3 a 5 hashtags.

3. **Consolidación de Cambios mediante Git Commit:**
   - El usuario ha solicitado empaquetar y commitear todos los cambios estables verificados con un mensaje semántico, ordenado y profesional.

---

## 2. Alcance (Archivos Afectados)

### Archivos Nuevos o Generados:
- `icon.png`: Nuevo logo en alta resolución (512x512 / 1024x1024) generado con IA y procesado con Pillow.
- `icon.ico`: Archivo de icono nativo para Windows conteniendo todas las resoluciones requeridas (`16x16`, `32x32`, `48x48`, `64x64`, `128x128`, `256x256`).
- `public/favicon.ico` y `public/icon.png`: Iconos para la distribución web / Vite.
- `scratch/test_branding_unit.py`: Suite de tests unitarios para validar resoluciones y cabeceras de iconos.
- `scratch/generate_ico.py`: Script para convertir la imagen base generada en el paquete de iconos `.ico` y `.png`.

### Archivos a Modificar:
- `index.html`: Agregar `<link rel="icon" type="image/x-icon" href="/icon.ico" />`.
- `README.md`: Incorporar el nuevo logo en la cabecera y documentar las nuevas capacidades consolidadas.
- Repositorio Git: Staging y commit de los archivos modificados.

---

## 3. Paso a Paso Técnico

1. **Generación del Logo Base con `generate_image`:**
   - Crear una identidad visual moderna: un isotipo minimalista y premium de clip vertical (9:16) con corte dinámico y brillo sutil en degradado violeta/cyan/ámbar sobre fondo oscuro.
2. **Procesamiento y Conversión con Pillow:**
   - Convertir la imagen resultante a `icon.png` (PNG transparente / optimizado).
   - Generar `icon.ico` conteniendo capas multi-resolución: 16x16, 32x32, 48x48, 64x64, 128x128 y 256x256 píxeles.
   - Copiar los recursos a `public/` para el servidor de desarrollo y producción.
3. **Actualización de `index.html`:**
   - Vincular `<link rel="icon" type="image/x-icon" href="/icon.ico" />`.
4. **Actualización del `README.md`:**
   - Añadir el logo en la cabecera y actualizar las secciones de Arquitectura, Detección de Momentos (prompt fusionado) y Social Copywriting.
5. **Compilación y Construcción del Frontend:**
   - Ejecutar `pnpm.cmd run build` para asegurar que el bundle en `dist/` incluya el nuevo favicon e iconos.
6. **Ejecución de la Estrategia de Testing (Gate de Cierre):**
   - Ejecutar suite de tests unitarios y de integración.
   - Realizar verificación visual en navegador con subagente.
7. **Git Commit Consolidado:**
   - Revisar `git status`, añadir archivos relevantes y realizar el commit con mensaje estructurado.

---

## 4. Riesgos e Implicaciones

- **Compatibilidad de `icon.ico` en Windows:** Si un archivo `.ico` no contiene las capas de resolución estándar (especialmente 16, 32 y 256), el Explorador de Windows o la barra de tareas pueden mostrar iconos borrosos o con fondo negro. Se mitiga generando explícitamente todas las capas mediante Pillow con resampling LANCZOS.
- **Ruta de Vite y Assets:** Se asegura que el icono esté tanto en la raíz como en `public/` para que Vite y PyWebView lo resuelvan correctamente tanto en desarrollo como en producción.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Tests Unitarios (`scratch/test_branding_unit.py`):**
  - Verificar que `icon.ico` e `icon.png` existen y no están vacíos.
  - Verificar con Pillow que `icon.ico` contiene las capas: `[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]`.
  - Verificar que `index.html` contiene el tag `<link rel="icon"`.
  - Verificar que `README.md` no contiene guiones largos (`—`) ni enlaces rotos.
- **Tests de Integración (`scratch/test_build_assets.py`):**
  - Ejecutar `pnpm.cmd run build` y verificar que el directorio `dist/` contiene los assets compilados y el favicon.
- **Tests E2E (Visual / Browser Subagent):**
  - Abrir la aplicación en el navegador y comprobar la carga de la cabecera, el título del documento y el favicon.
