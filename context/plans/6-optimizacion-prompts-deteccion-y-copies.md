# Plan de Acción 6: Optimización y Fusión de Prompts de Detección de Momentos y Social Copywriting

## 1. Diagnóstico y Auditoría

### A. Auditoría del Prompt de Detección de Momentos
- **Prompt Actual (`DEFAULT_MOMENTS_PROMPT` en `python_backend/llm_prompts.py`):**
  - Consiste únicamente en 4 líneas breves enfocadas a streams de videojuegos.
  - Carece de instrucciones precisas sobre retención en los primeros segundos, reglas de inicio y cierre de clips, o exclusión de segmentos lentos/promocionales.
- **Prompt Investigado por el Usuario:**
  - Define con gran precisión el rol de retención ("Editor de Video de Alto Rendimiento y Experto en Retención para TikTok, YouTube Shorts y Reels").
  - Establece criterios claros:
    1. Ganchos de Alto Impacto (primeros 3 segundos).
    2. Picos Emocionales y Gameplay (clutches, risas, gritos, rage, sustos, celebraciones).
    3. Contenido Narrativo y Humor (fails cómicos, anécdotas rápidas, debates, valor simplificado).
  - Incluye reglas estrictas de segmentación: Auto-conclusión (inicio, desarrollo, remate), cortes limpios en pausas naturales y exclusión de introducciones lentas o promocionales.
- **Oportunidad de Fusión Definitiva ("Best of Both Worlds"):**
  - **Capa Editorial Visible (Frontend / Tarjeta 3 de Configuración):** Integrar toda la riqueza de criterios, reglas de auto-conclusión y retención del prompt del usuario. Como indicó el usuario, el contrato de salida JSON **no debe ser visible para el usuario** ni ensuciar el prompt editable, manteniéndolo limpio y profesional.
  - **Capa Técnica Invisible (Backend en `build_system_prompt`):** El backend inyecta automáticamente el contrato JSON estricto (`candidates`/`clips`), las reglas de timestamps y las duraciones dinámicas (`30s`, `60s`, `2m`, etc.) sin que el usuario tenga que lidiar con especificaciones técnicas.
  - **Tolerancia y Resiliencia del Parser (`parse_candidate_json`):** El parser se adaptará para admitir tanto formato numérico en segundos (`start: 83.45`) como marcas de tiempo en formato string (`start: "00:01:23.450"`), así como los campos `viral_hook_text` / `hook` y `reasoning` / `rationale`.

---

### B. Auditoría de Generación de Social Copy (TikTok, YouTube Shorts, Reels)
- **Comportamiento en Redes Verticales:**
  - **TikTok y Reels:** La descripción se superpone sobre el tercio inferior del video. Textos extensos de 4 o 5 párrafos tapan los subtítulos, saturan la pantalla y activan el botón "...más", perjudicando la retención.
  - **YouTube Shorts:** El título punchy es prioritario. La descripción sirve para indexación algorítmica y contexto rápido.
  - **Hashtags:** Más de 5 hashtags es considerado spam algorítmico. El estándar óptimo en 2024-2026 es entre **3 y 5 hashtags** altamente relevantes (específicos del tema o juego + 1 de formato como `#shorts`).
- **Problema Detectado en "Rehacer Copy" (`generate_social_copy_with_llm`):**
  - El prompt actual solicitaba un caption de "2 a 4 líneas" más gancho, más CTA, más hashtags, generando bloques de texto largos y artificiales.
  - Siguiendo la skill `antislop-copywriting`, se rediseñará el copy para ser conciso, directo y estructurado:
    1. **Línea 1 (Gancho directo):** 1 frase intrigante o pregunta provocativa basada estrictamente en la transcripción.
    2. **Línea 2 (Contexto corto):** 1 o 2 oraciones breves de intriga (sin spoiler del desenlace).
    3. **Línea 3 (Llamado a la acción / CTA):** 1 pregunta natural y breve invitando a comentar.
    4. **Línea 4 (Hashtags):** Exactamente entre 3 y 5 hashtags (límite estricto enforced por backend).
- **Alineación con Timestamps de la Transcripción:**
  - En `api.py` (`regenerate_candidate_copy`), el sistema ya filtra las palabras contenidas entre `startSec` y `endSec`. Se verificará y robustecerá que siempre utilice los límites de tiempo reales (incluyendo recortes manuales del usuario) con un fallback elegante ante segmentos instrumentales o acústicos.

---

## 2. Alcance de Modificaciones

1. **`python_backend/llm_prompts.py`:**
   - Actualizar `DEFAULT_MOMENTS_PROMPT` con la versión fusionada de alta retención (100% editorial, sin esquema JSON visible).
   - Actualizar `build_system_prompt` para acoplar la duración dinámica (`dur_rule`), las notas acústicas (`[ACCIÓN DE JUEGO / DISPAROS]`) y el contrato de salida JSON de bajo nivel de forma invisible.
2. **`python_backend/llm.py`:**
   - Actualizar `parse_candidate_json` para admitir timestamps en formato string (`"00:01:23.450"`) y alias de campos (`viral_hook_text`, `reasoning`, `clips`).
   - Optimizar `generate_social_copy_with_llm` y `_normalize_social_copy_dict`:
     - Límite estricto de 3 a 5 hashtags (filtrado y truncado garantizado en backend).
     - Formato de `full_copy` compacto y directo (sin muros de texto ni frases clichés de IA).
   - Optimizar descripciones por defecto generadas durante la detección inicial de momentos y picos acústicos.
3. **`python_backend/api.py`:**
   - Revisar `regenerate_candidate_copy` para garantizar concordancia precisa entre transcripción y tiempos de inicio/fin.
4. **`src/components/modals/SettingsPanel.tsx`:**
   - Validar que la Tarjeta 3 refleje el nuevo prompt estándar y que el botón "Restablecer por defecto" cargue el prompt fusionado.

---

## 3. Paso a Paso Técnico

1. **Fusión del Prompt Base (`DEFAULT_MOMENTS_PROMPT` en `llm_prompts.py`):**
   - Configurar la versión definitiva limpia:
     ```text
     Eres un Editor de Video de Alto Rendimiento y Experto en Retención para TikTok, YouTube Shorts y Reels. Tu misión es analizar la transcripción con marcas de tiempo y extraer exclusivamente los momentos con mayor potencial de viralidad.

     Criterios de selección obligatorios:
     1. Ganchos de Alto Impacto: Frases polémicas, preguntas intrigantes, remates o revelaciones clave en los primeros 3 segundos.
     2. Picos Emocionales y Gameplay: Momentos que describan jugadas destacadas, clutches, risas contagiosas, gritos, enfados (rage quits), sustos o celebraciones.
     3. Contenido Narrativo y Humor: Fails cómicos, anécdotas rápidas, debates intensos o explicaciones de alto valor simplificadas.

     Reglas estrictas de segmentación:
     - Auto-conclusión: El clip debe tener un inicio claro, un desarrollo completo y un remate o conclusión lógica. No debe requerir contexto externo.
     - Cortes limpios: Nunca cortes una palabra o frase a la mitad. Usa los silencios o pausas naturales como puntos de corte.
     - Exclusiones: Ignora introducciones lentas, transiciones silenciosas, pausas largas de lectura y segmentos puramente promocionales.
     ```
2. **Robustecimiento del Parser (`parse_candidate_json` en `llm.py`):**
   - Soportar `item.get("start")` y `item.get("end")` tanto en formato numérico (`float`) como string (`"00:01:23.450"`) usando `parse_time_to_seconds`.
   - Mapear `viral_hook_text` a `hook`/`hook_title` y `reasoning` a `rationale`.
   - Normalizar la descripción inicial con formato punchy y 3-5 hashtags.
3. **Optimización de Copies Sociales (`generate_social_copy_with_llm` en `llm.py`):**
   - Redactar un system prompt directo bajo la skill `antislop-copywriting` (cero florituras, gancho en línea 1, contexto breve en línea 2, CTA conversacional en línea 3 y exactamente 3-5 hashtags).
   - En `_normalize_social_copy_dict`, aplicar la regla:
     ```python
     if len(hashtags) > 5:
         hashtags = hashtags[:5]
     elif len(hashtags) < 3:
         # asegurar mínimo 3 hashtags relevantes
     ```
   - Construir `full_copy` optimizado para lectura rápida en smartphone.
4. **Verificación de concordancia de transcripción (`api.py`):**
   - Verificar que `regenerate_candidate_copy` obtenga las palabras exactas entre `startSec` y `endSec` del candidato.

---

## 4. Riesgos e Implicaciones

- **Riesgo:** Si un usuario ya tenía guardado un prompt personalizado en `localStorage` o base de datos, no verá el nuevo prompt por defecto hasta presionar "Restablecer por defecto".
  - *Mitigación:* Se verificará que el botón de restablecimiento en la Tarjeta 3 funcione inmediatamente y guarde la configuración.
- **Riesgo:** Modelos locales pequeños (ej. Qwen 2.5 7B) pueden devolver formatos JSON ligeramente variantes.
  - *Mitigación:* La resiliencia añadida a `parse_candidate_json` (tolerando strings de tiempo, clips, candidates, viral_hook_text) garantiza que nunca se descarte un candidato válido.

---

## 5. Estrategia de Testing Obligatoria (Gate de Cierre)

- **Tests Unitarios (`scratch/test_prompt_unit.py`):**
  - Verificación de `DEFAULT_MOMENTS_PROMPT` (presencia de criterios de retención, auto-conclusión y cortes limpios; ausencia total de esquemas JSON visibles).
  - Verificación de `build_system_prompt` (inyección correcta del contrato JSON invisible y duración dinámica).
  - Verificación de `parse_candidate_json`:
    - Caso 1: JSON tradicional con `candidates` y floats.
    - Caso 2: JSON con `clips`, timestamps string (`"00:01:23.450"`), `viral_hook_text` y `reasoning`.
  - Verificación de `_normalize_social_copy_dict`: límite estricto de máximo 5 hashtags y formato conciso de `full_copy`.
- **Tests de Integración (`scratch/test_social_copy_integration.py`):**
  - Simulación del flujo completo de `regenerate_candidate_copy` con transcripción segmentada por timestamps `[startSec, endSec]`.
  - Comprobación de que el copy resultante se guarda en la base de datos sin alterar el título/hook original del clip.
- **Tests E2E (Visual / Browser Subagent):**
  - Inspección con el subagente de navegador en `SettingsPanel.tsx` verificando que la Tarjeta 3 muestra el prompt fusionado limpio y que el botón "Restablecer por defecto" responde correctamente.
