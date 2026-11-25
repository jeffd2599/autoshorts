# Plan de Acción 8: Rediseño de Identidad Visual y Logo Minimalista de Primer Nivel para AutoShorts

## 1. Diagnóstico y Entendimiento del Problema

1. **Problema con el Logo Anterior:**
   - La iteración previa generó una ilustración compleja con estética de "fondo de pantalla" (wallpaper): iluminación 3D, múltiples tijeras detalladas, destellos y elementos diminutos sobre un lienzo oscuro extendido.
   - Al escalarse a tamaños de aplicación reales (22x22 en la barra lateral, 16x16 o 32x32 en favicon/barra de tareas), los detalles se vuelven un borrón oscuro ilegible sin fuerza de marca.
   - El usuario solicita un diseño verdaderamente profesional, minimalista y de primer nivel (siguiendo estándares de marcas tecnológicas como Linear, Raycast, Figma o DaVinci): un isotipo geométrico limpio, con alto contraste, legible desde 16x16 hasta 512x512 píxeles, sin adornos innecesarios ni efectos de ilustración recargada.

2. **Concepto de Marca Propuesto (Minimalismo Vectorial Puro):**
   - **Forma y Símbolo:** Isotipo geométrico moderno que representa **"AutoShorts"**:
     - Un contenedor squircle (cuadrado de esquinas suavemente redondeadas) en grafito obsidiana mate (`#0c0d12`).
     - Al centro, una figura geométrica de alto impacto en corte vertical: dos segmentos angulados que forman un botón de reproducción vertical (9:16) con un corte oblicuo dinámico en energía limpia (gradiente sutil coral eléctrico / ámbar dorado / violeta tech, o cian vibrante con máximo contraste).
     - Alternativa A/B: Monograma "A" estilizado con corte vertical 9:16 y flecha de avance rápido.
   - **Principios Antislop UI (`antislop-ui`):**
     - Sin resplandores excesivos (anti-glow), sin luces 3D ni partículas dispersas.
     - Silueta sólida, clara y reconocible instantáneamente en tamaños diminutos (16px a 48px).
     - Transparencia limpia y compatibilidad multiplataforma.

---

## 2. Alcance (Archivos Afectados)

### Archivos a Generar y Reemplazar:
- `icon.png`: Logo maestro optimizado (512x512 píxeles, PNG con bordes nítidos y formato squircle / glifo aislado).
- `icon.ico`: Archivo de icono nativo para Windows conteniendo capas multi-resolución limpias (`16x16`, `32x32`, `48x48`, `64x64`, `128x128`, `256x256`).
- `public/icon.png` y `public/favicon.ico`: Actualización para la distribución Vite y servidor de desarrollo.
- `scratch/generate_minimalist_logo.py`: Script generador de precisión matemática/vectorial para garantizar nitidez geométrica absoluta en todas las escalas.

### Archivos a Actualizar si aplica:
- `README.md`: Actualización de la imagen de cabecera con el nuevo logo minimalista.
- `src/components/panels/Sidebar.tsx`: Verificación de renderizado nítido a 22x22 px.
- `DECISIONS.md`: Registro de la decisión D-011 (Rediseño minimalista de isotipo de alto contraste).

---

## 3. Paso a Paso Técnico

1. **Diseño y Generación del Glifo Minimalista:**
   - Crear una versión geométrica pura mediante script Python de alta precisión con Pillow/SVG/renderizado vectorial para asegurar que los vectores, trazos y proporciones matemáticas sean perfectos a nivel de píxel (sin artefactos de compresión ni alucinaciones de IA).
   - Producir la imagen maestra en 1024x1024 / 512x512 con el isotipo de corte vertical dinámico en alto contraste.
2. **Generación de Capas Multi-Resolución:**
   - Procesar mediante Pillow con filtro `LANCZOS` para generar:
     - `icon.png` (512x512)
     - `icon.ico` conteniendo: `16x16`, `32x32`, `48x48`, `64x64`, `128x128`, `256x256`.
     - `public/favicon.ico` y `public/icon.png`.
3. **Compilación y Actualización:**
   - Reconstruir assets con `pnpm.cmd run build`.
   - Actualizar cabecera en `README.md` y documentar en `DECISIONS.md`.
4. **Ejecución de la Estrategia de Testing (Gate de Cierre):**
   - Ejecutar suite de validación unitaria de resoluciones, contraste y capas.
   - Verificación de integración del bundle `dist/`.
   - Verificación visual E2E en navegador con subagente a escala 16px, 22px y 64px.

---

## 4. Riesgos e Implicaciones

- **Pérdida de detalle en bajas resoluciones (16x16):** Los diseños con degradados complejos o muchos cortes fallan en 16x16. La solución consiste en una geometría audaz (bold shapes) con proporciones gruesas y mínimo 4.5:1 de contraste respecto al fondo.
- **Caché del navegador:** Los navegadores suelen cachear fuertemente `favicon.ico`. Se mitigará asegurando que tanto `icon.png` como `favicon.ico` se sincronicen en `public/` y en la raíz.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Tests Unitarios (`scratch/test_branding_unit.py`):**
  - Validar que `icon.png` sea de 512x512 y posea canal alfa/squircle nítido.
  - Validar que `icon.ico` contenga exactamente las 6 capas: `[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]`.
  - Evaluar la legibilidad y contraste del glifo central contra el fondo.
- **Tests de Integración (`scratch/test_build_assets.py`):**
  - Validar que `pnpm.cmd run build` termine con código 0 y copie los iconos a `dist/`.
- **Tests E2E Visuales (Browser Subagent):**
  - Capturar la vista de la barra lateral de AutoShorts a resolución normal y en zoom para validar que el logo a 22x22 se distinga como una marca premium y minimalista, sin empastamiento.
