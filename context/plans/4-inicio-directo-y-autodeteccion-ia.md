# Plan de Acción 4: Inicio Directo sin Bloqueos y Autodetección Inteligente de Motores de IA Local (LM Studio y Ollama)

## 1. Diagnóstico y Entendimiento del Problema

Al iniciar AutoShorts por primera vez o con configuración limpia, `App.tsx` evalúa `settings.isOnboarded === false` y sustituye toda la interfaz por `OnboardingModal.tsx`. 

### Problemas identificados:
1. **Modal Bloqueante y Descarga Forzosa:** El modal actual no ofrece opción de cierre, salida ni botón de "Omitir". Obliga al usuario a pulsar "Descargar y Comenzar" sobre uno de los tres modelos de Ollama (`llama3.2`, `qwen2.5:3b`, `qwen2.5:7b`), consumiendo gigabytes de descarga sin consentimiento.
2. **Ceguera ante LM Studio:** El modal ignora completamente si el usuario tiene **LM Studio** activo en `http://127.0.0.1:1234/v1` con modelos cargados, asumiendo erróneamente que solo existe Ollama.
3. **Fricción de Entrada:** El usuario no puede acceder al Dashboard de proyectos ni explorar la suite hasta completar esa descarga obligatoria.
4. **Preferencia explícita del usuario:** Según la consulta realizada mediante la skill de `brainstorming`, se determinó:
   - Eliminar por completo el modal bloqueante de onboarding.
   - Abrir AutoShorts directamente en el Dashboard como un software tradicional de escritorio.
   - Gestionar la detección automática, selección y estado de Ollama y LM Studio desde la barra de estado inferior (`StatusBar.tsx`) y el panel de configuración (`SettingsPanel.tsx`), sin forzar descargas en ningún momento.

---

## 2. Alcance (Archivos Afectados)

### Componentes a Eliminar:
- `src/components/modals/OnboardingModal.tsx`: Se retira definitivamente el modal bloqueante de bienvenida.

### Componentes y Hooks a Modificar:
- `src/App.tsx`:
  - Retirar la condición bloqueante `if (settings.isOnboarded === false) return <OnboardingModal ... />`.
  - Conectar el callback `onOpenSettings` hacia `StatusBar.tsx` para permitir abrir el panel de configuración al hacer clic en los indicadores de estado de Ollama / LM Studio.
  - Asegurar que la aplicación siempre renderice la vista principal (`HomeDashboard` o `CandidatePanel`).
- `src/hooks/useAppSettings.ts`:
  - Depurar la lógica de `isOnboarded` para que por defecto sea `true` (o no condicione el render).
  - Enriquecer `refreshEnv`: si el usuario no tiene configurado un `llmEngine` explícito en `config.json`, autoseleccionar de forma inteligente:
    - Si detecta LM Studio activo (`hasLmStudio === true`) con modelos disponibles y Ollama apagado, establecer automáticamente `llmEngine = "lmstudio"` y asignar el primer modelo detectado.
    - Si detecta Ollama activo (`hasOllama === true`) con modelos instalados y LM Studio apagado, establecer automáticamente `llmEngine = "local"` y asignar el primer modelo detectado.
    - Si ambos están disponibles, respetar la selección guardada o sugerir el motor activo.
  - Actualizar `handleResetConfig` para limpiar ajustes sin reactivar pantallas bloqueantes inexistentes.
- `src/components/common/StatusBar.tsx`:
  - Hacer interactivos los indicadores de `Ollama`, `LM Studio` y `Faster-Whisper`.
  - Mostrar tooltips informativos con la cantidad de modelos detectados (ej: `Ollama: 3 modelos listos` o `LM Studio: Conectado (1 modelo cargado)`).
  - Si un motor está desconectado, mostrar estilo atenuado con tooltip explicativo (ej: `LM Studio: Desconectado. Inicia el servidor local en el puerto 1234`).
  - Añadir soporte para clic directo que abra `SettingsPanel`.
- `src/components/modals/SettingsPanel.tsx`:
  - Reforzar el selector entre Ollama y LM Studio: mostrar de forma clara cuál motor está actualmente en línea y cuál está desconectado con badges en vivo.
  - Proporcionar recomendaciones informativas de modelos óptimos para AutoShorts (ej: `qwen2.5:7b`, `llama3.2:3b`) sin forzar su descarga inmediata.
- `src/components/modals/ModalContainer.tsx`:
  - Retirar la importación residual de `OnboardingModal`.

---

## 3. Paso a Paso Técnico

### Fase 1: Desconexión y Purga de la Pantalla Bloqueante
1. Eliminar `src/components/modals/OnboardingModal.tsx`.
2. En `src/components/modals/ModalContainer.tsx`, eliminar cualquier referencia o prop hacia `OnboardingModal`.
3. En `src/App.tsx`, retirar la condición `if (settings.isOnboarded === false)` y el componente `OnboardingModal`. Pasar `onOpenSettings={() => setShowSettings(true)}` al componente `StatusBar`.

### Fase 2: Autodetección Inteligente en el Hook de Configuración
1. En `src/hooks/useAppSettings.ts`:
   - Eliminar el bloqueo de estado inicial por `onboarded`.
   - Implementar lógica en `refreshEnv` para autodetectar qué servicio local está corriendo y ajustar `llmEngine` / `localLlmModel` / `lmstudioModel` de forma automática y silenciosa si no existen valores fijados por el usuario.
   - Refrescar el estado de memoria VRAM/RAM tras la detección.

### Fase 3: Mejoras UX en la Barra de Estado (StatusBar)
1. En `src/components/common/StatusBar.tsx`:
   - Añadir la prop `onOpenSettings?: () => void`.
   - Mejorar los badges de `Ollama` y `LM Studio`:
     - Mostrar estado visual claro: verde con punto pulsante si está activo y tiene modelos; ámbar/gris si está desconectado.
     - Añadir contador de modelos disponibles en el texto o tooltip.
     - Permitir hacer clic en el indicador para abrir directamente la ventana de ajustes correspondiente.

### Fase 4: Pulido de SettingsPanel y StyleModal
1. En `src/components/modals/SettingsPanel.tsx`:
   - En la sección de selección de LLM, indicar claramente el estado en tiempo real de Ollama (puerto 11434) y LM Studio (puerto 1234).
   - Añadir una tarjeta/bloque de sugerencias informativas con los mejores modelos recomendados para extracción de clips (Qwen 2.5 y LLaMA 3.2), permitiendo descargar en Ollama con 1 clic si el usuario lo desea, pero sin condicionar el uso general.
2. En `src/components/modals/StyleModal.tsx`:
   - Validar que al importar un video, la pestaña "Procesamiento e IA" refleje fielmente el motor autodetectado (Ollama o LM Studio) y su lista de modelos en línea.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** Si el usuario no tiene ni Ollama ni LM Studio corriendo al abrir la aplicación, el usuario podría intentar generar clips sin un LLM activo.
  - **Mitigación:** Al iniciar la detección de momentos en `useMediaPipeline.ts`, ya existe una verificación previa que avisa si no hay ningún motor de IA disponible. Además, el indicador en `StatusBar` advertirá visualmente que ambos motores están desconectados, invitando a iniciar cualquiera de ellos.
- **Riesgo:** Si ambos motores (Ollama y LM Studio) están corriendo simultáneamente.
  - **Mitigación:** Respetar la selección guardada en `config.json` (`llmEngine`). Si es la primera ejecución y ambos existen, priorizar LM Studio si tiene un modelo ya cargado en memoria, o Ollama en su defecto.

---

## 5. Estrategia de Testing (Validación Obligatoria)

La verificación se ejecutará al 100% siguiendo los tres niveles:

### Nivel 1: Tests Unitarios
- **Validación de Tipos y Compilación TypeScript:**
  - Ejecutar `pnpm.cmd run build` para asegurar 0 errores de compilación (`tsc && vite build`).
- **Validación Sintáctica de Backend Python:**
  - Ejecutar `python -m py_compile python_backend/api.py python_backend/llm.py` asegurando retorno con código de salida 0.

### Nivel 2: Tests de Integración
- **Flujo de Detección de Entorno:**
  - Probar la respuesta de `environment_status` con scripts locales en `scratch/` simulando:
    1. Ollama activo, LM Studio apagado.
    2. LM Studio activo, Ollama apagado.
    3. Ambos activos.
    4. Ambos apagados.
  - Verificar que `useAppSettings` asigna el motor correcto sin lanzar excepciones ni bucles infinitos.

### Nivel 3: Tests E2E y Verificación de Flujo
- **Arranque Directo sin Bloqueos:**
  - Comprobar que al lanzar la aplicación (o cargar la interfaz), se muestra de inmediato el Dashboard principal de proyectos sin pantallas intermedias ni solicitudes obligatorias de descarga.
- **Barra de Estado:**
  - Verificar que los indicadores de `Ollama` y `LM Studio` reflejan el estado del backend y que hacer clic sobre ellos abre `SettingsPanel`.
