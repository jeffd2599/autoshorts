import json
import os
import re
import time
from typing import Any, Callable, Dict, List, Optional
import requests

DURATION_SPECS = {
    "30s": {
        "label": "30 segundos",
        "instruction": "Cada clip DEBE durar aproximadamente 30 segundos (rango permitido: 15 a 40 segundos).",
        "min": 15.0,
        "max": 40.0,
    },
    "60s": {
        "label": "1 minuto",
        "instruction": "Cada clip DEBE durar aproximadamente 1 minuto (rango permitido: 35 a 75 segundos).",
        "min": 35.0,
        "max": 75.0,
    },
    "2m": {
        "label": "2 minutos",
        "instruction": "Cada clip DEBE durar aproximadamente 2 minutos (rango permitido: 75 a 140 segundos).",
        "min": 75.0,
        "max": 140.0,
    },
    "3m": {
        "label": "3 minutos",
        "instruction": "Cada clip DEBE durar aproximadamente 3 minutos (rango permitido: 140 a 200 segundos).",
        "min": 140.0,
        "max": 200.0,
    },
    "5m": {
        "label": "5 minutos",
        "instruction": "Cada clip DEBE durar aproximadamente 5 minutos (rango permitido: 200 a 330 segundos).",
        "min": 200.0,
        "max": 330.0,
    },
}


def build_system_prompt(content_type: str = "gaming", target_duration: str = "60s", has_thinking: bool = False) -> str:
    dur_info = DURATION_SPECS.get(target_duration, DURATION_SPECS["60s"])
    dur_rule = dur_info["instruction"]

    focus_dict = {
        "gaming": """Eres un editor profesional de clips de GAMING para TikTok, YouTube Shorts y Reels virales.
Tu misión es encontrar los mejores momentos de gameplays, directos o torneos:
- Jugadas destacadas, clutches, kills o partidas épicas.
- Momentos divertidos, risas, gritos, enfados (rage), sustos o celebraciones.
- Fails cómicos, bugs o troleos.
- Anuncios de torneos, retos 1v1, fechas o reglas del juego.
- Remates y anécdotas entretenidas.""",
        "tutorial": """Eres un editor profesional de contenido educativo, tutoriales y avisos para Shorts/Reels/TikTok.
Tu misión es encontrar los mejores segmentos con valor informativo:
- Explicaciones claras de cómo hacer algo o resolver un problema.
- Trucos (tips, hacks) o configuraciones clave.
- Anuncios oficiales, convocatorias o fechas importantes.""",
        "podcast": """Eres un estratega de redes sociales buscando momentos virales en podcasts, entrevistas y charlas.
Tu misión es encontrar historias fascinantes, opiniones controvertidas o lecciones impactantes.""",
        "general": """Eres un editor profesional de videos cortos virales para TikTok, Shorts y Reels.
Tu misión es identificar los fragmentos más entretenidos, dinámicos y compartibles."""
    }
    focus_text = focus_dict.get(content_type, focus_dict["gaming"])

    thinking_guide = ""
    if has_thinking:
        thinking_guide = f"""
PROCESO DE RAZONAMIENTO (THINKING):
- En tu razonamiento interno (thinking), analiza la transcripción línea por línea.
- Calcula la duración exacta de cada candidato restando (end - start).
- Verifica estrictamente que cada momento cumpla con la duración objetivo solicitada ({dur_rule}). Si el gancho inicial dura poco, revisa los segmentos contiguos y extiende 'end' hasta completar la jugada, anécdota o remate cómico.
- Descarta partes de charla vacía o silencios sin acción.
- Tras razonar detenidamente, produce estrictamente el objeto JSON en el formato final requerido, sin texto fuera del JSON."""

    return f"""{focus_text}

REGLAS DE DURACIÓN Y TIMESTAMPS:
- CRÍTICO: {dur_rule}
- NO elijas solo una frase corta de 2 a 5 segundos. El timestamp 'start' debe marcar el inicio del momento y 'end' debe abarcar el desarrollo completo hasta alcanzar la duración objetivo indicada.
- SILENCIO Y ACCIÓN: En streams de gaming, a veces el streamer se concentra y no habla mientras dispara o juega una ronda tensa. Si la transcripción incluye notas como [ACCIÓN DE JUEGO / DISPAROS / ALTA CONCENTRACIÓN] o si hay una jugada tensa con poco diálogo, selecciónala como un clip épico de gameplay.
- 'hook': Título gancho llamativo, directo y viral (en Español).
- 'rationale': Explicación breve de por qué este momento es entretenido o viral.
- 'description': Descripción optimizada para redes sociales (TikTok, Reels, Shorts, X) de 1 a 2 frases vendedoras invitando a interactuar, con 3 a 4 hashtags relevantes (ej. #gaming #clipviral).{thinking_guide}

Devuelve entre 1 y 5 candidatos en formato JSON exactamente con esta estructura:
{{"candidates":[{{"start":0.0,"end":0.0,"score":0.0,"hook":"...","rationale":"...","description":"..."}}]}}

IMPORTANTE: Analiza en español y genera todos los textos estrictamente en Español. No traduzcas al inglés."""


def unload_all_ollama_models(specific_model: Optional[str] = None):
    """
    Unloads Ollama models from VRAM immediately so RAM/VRAM is freed for other tasks or models.
    """
    try:
        if specific_model:
            requests.post("http://127.0.0.1:11434/api/generate", json={"model": specific_model, "keep_alive": 0}, timeout=5)
        resp = requests.get("http://127.0.0.1:11434/api/ps", timeout=5)
        if resp.ok:
            data = resp.json()
            for m in data.get("models", []):
                m_name = m.get("name") or m.get("model")
                if m_name:
                    requests.post("http://127.0.0.1:11434/api/generate", json={"model": m_name, "keep_alive": 0}, timeout=5)
        print("VRAM liberada: Modelos de Ollama descargados de memoria.")
    except Exception as e:
        print(f"Nota al descargar modelos de Ollama: {e}")


def compact_segments(segments: List[Dict[str, Any]]) -> str:
    lines = []
    for s in segments:
        spk = s.get("speaker", "Hablante")
        lines.append(f"[{s['start']:.2f}-{s['end']:.2f}] {spk}: {s['text']}")
    return "\n".join(lines)


def expand_short_candidate(
    start: float,
    end: float,
    segments: Optional[List[Dict[str, Any]]],
    target_min: float = 12.0,
    target_max: float = 60.0
) -> tuple[float, float]:
    """
    If the LLM selected only a short 2-5s hook sentence, this expands the clip forward
    across subsequent speech segments so the viewer gets the full context or play.
    """
    if not segments:
        return start, end

    dur = end - start
    if dur >= target_min:
        return start, min(end, start + target_max)

    # Find the segment closest to start
    start_idx = 0
    for i, s in enumerate(segments):
        if s["start"] <= start <= s["end"] or abs(s["start"] - start) < 2.0:
            start_idx = i
            break

    # Expand end timestamp across subsequent segments
    new_end = end
    for s in segments[start_idx:]:
        new_end = max(new_end, s["end"])
        if (new_end - start) >= target_min:
            break

    return start, new_end


def parse_candidate_json(
    text: str,
    min_duration: float = 5.0,
    segments: Optional[List[Dict[str, Any]]] = None,
    target_duration: str = "60s"
) -> List[Dict[str, Any]]:
    clean = text.strip()
    # Strip any thinking tags if present in text
    clean = re.sub(r"<think>.*?</think>", "", clean, flags=re.DOTALL).strip()
    clean = re.sub(r"^```json\s*", "", clean)
    clean = re.sub(r"^```\s*", "", clean)

    val = None
    # 1. Try raw_decode from first '{' (safely ignores any trailing CoT thinking or text)
    start_brace = clean.find('{')
    if start_brace != -1:
        try:
            val, _ = json.JSONDecoder().raw_decode(clean[start_brace:])
        except Exception:
            pass

    # 2. Try raw_decode from first '['
    if val is None:
        start_bracket = clean.find('[')
        if start_bracket != -1:
            try:
                val, _ = json.JSONDecoder().raw_decode(clean[start_bracket:])
            except Exception:
                pass

    # 3. Fallback regex
    if val is None:
        match = re.search(r"(\{.*\})", clean, re.DOTALL)
        if match:
            try:
                val = json.loads(match.group(1))
            except Exception:
                pass

    # 4. Final attempt
    if val is None:
        try:
            val = json.loads(clean)
        except Exception as e:
            print(f"Error parsing JSON: {e}. Raw text: {text[:200]}")
            return []

    candidates_arr = None
    if isinstance(val, list):
        candidates_arr = val
    elif isinstance(val, dict):
        for key in ["candidates", "Candidates", "moments", "clips", "segments", "results"]:
            if key in val and isinstance(val[key], list):
                candidates_arr = val[key]
                break
        if candidates_arr is None and "start" in val and "end" in val:
            candidates_arr = [val]

    if not candidates_arr:
        return []

    dur_info = DURATION_SPECS.get(target_duration, DURATION_SPECS["60s"])
    target_min = dur_info["min"]
    target_max = dur_info["max"]

    drafts = []
    for item in candidates_arr:
        try:
            start = float(item.get("start", 0.0))
            end = float(item.get("end", 0.0))
            score = float(item.get("score", 0.8))
            if score > 1.0 and score <= 10.0:
                score /= 10.0
            elif score > 10.0:
                score /= 100.0

            hook = str(item.get("hook", "")).strip()
            rationale = str(item.get("rationale", "")).strip()
            description = str(item.get("description", "")).strip()
            if not description and hook:
                description = f"{hook}. ¡Mira este momento destacado! #autoshorts #viral #clips"

            # Automatically expand clips if the LLM picked a short hook line
            if segments:
                start, end = expand_short_candidate(
                    start, end, segments,
                    target_min=target_min,
                    target_max=target_max
                )

            dur = end - start
            if dur >= min_duration and hook:
                drafts.append({
                    "start": round(start, 2),
                    "end": round(end, 2),
                    "score": max(0.0, min(1.0, score)),
                    "hook": hook,
                    "rationale": rationale,
                    "description": description
                })
        except Exception:
            continue

    return drafts


def partition_segments(
    segments: List[Dict[str, Any]],
    chunk_duration_sec: float = 600.0,
    overlap_sec: float = 45.0
) -> List[List[Dict[str, Any]]]:
    """
    Partitions transcript into windows of chunk_duration_sec (default: 10 min = 600s),
    with overlap_sec (45s) so no moments on the boundary are lost.
    """
    if not segments:
        return []

    total_duration = segments[-1]["end"]
    if total_duration <= (chunk_duration_sec + overlap_sec):
        return [segments]

    chunks = []
    step = chunk_duration_sec - overlap_sec
    window_start = 0.0

    while window_start < total_duration:
        window_end = window_start + chunk_duration_sec
        chunk_segs = [s for s in segments if s["end"] > window_start and s["start"] < window_end]
        if chunk_segs:
            chunks.append(chunk_segs)
        window_start += step

    return chunks


_THINKING_CACHE: Dict[str, bool] = {}


def detect_model_thinking_capability(model_name: str) -> bool:
    """
    Detects whether an Ollama model supports native thinking/reasoning (Chain of Thought),
    inspecting /api/show capabilities, template, details, or model family.
    Works for any model (gemma4, qwen3.5, deepseek-r1, qwq, etc.) even when 'think'
    is not in the model name.
    """
    if not model_name:
        return False
    if model_name in _THINKING_CACHE:
        return _THINKING_CACHE[model_name]

    try:
        resp = requests.post("http://127.0.0.1:11434/api/show", json={"name": model_name}, timeout=3)
        if resp.ok:
            data = resp.json()
            # 1. Official capabilities list in Ollama v0.5+
            caps = [str(c).lower() for c in data.get("capabilities", [])]
            if "thinking" in caps:
                _THINKING_CACHE[model_name] = True
                return True

            # 2. Template inspection
            template = data.get("template", "").lower()
            if "<think>" in template or "thinking" in template:
                _THINKING_CACHE[model_name] = True
                return True

            # 3. Families and details
            details = data.get("details", {})
            family = str(details.get("family", "")).lower()
            families = [str(f).lower() for f in details.get("families", [])]
            if any(f in ["deepseek2", "deepseek3", "qwen35", "gemma4"] for f in [family] + families):
                _THINKING_CACHE[model_name] = True
                return True
    except Exception as e:
        print(f"Nota al comprobar capacidades de thinking para {model_name}: {e}")

    # 4. Fallback: keywords in model name
    lower_name = model_name.lower()
    has_think = any(kw in lower_name for kw in ["r1", "qwq", "think", "reason", "cot"])
    _THINKING_CACHE[model_name] = has_think
    return has_think


def call_ollama(
    prompt: str,
    model_name: str = "qwen2.5:7b",
    content_type: str = "gaming",
    target_duration: str = "60s"
) -> str:
    has_thinking = detect_model_thinking_capability(model_name)
    system_prompt = build_system_prompt(content_type, target_duration, has_thinking=has_thinking)
    url = "http://127.0.0.1:11434/api/chat"

    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_ctx": 8192
        }
    }

    # For non-thinking models, format: json assists structured output without token interference
    if not has_thinking:
        payload["format"] = "json"

    resp = requests.post(url, json=payload, timeout=300)
    if not resp.ok:
        raise RuntimeError(f"Ollama call failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    msg = data.get("message", {})
    thinking = msg.get("thinking", "")
    content = msg.get("content", "")

    # Extract inline <think> tags if model formatted them in content
    if "<think>" in content:
        inline_thinks = re.findall(r"<think>(.*?)</think>", content, re.DOTALL)
        if inline_thinks and not thinking:
            thinking = "\n".join(inline_thinks).strip()
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    # Fallback: if content is empty but thinking contains the JSON object
    if not content and thinking:
        m = re.search(r"(\{.*\"candidates\".*\})", thinking, re.DOTALL)
        if m:
            content = m.group(1)

    if thinking:
        print(f"🧠 [{model_name} CoT Thinking ({len(thinking)} caracteres)]: {thinking[:150].strip()}...")

    return content



def robust_cloud_post(
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
    provider_name: str,
    max_retries: int = 4,
    timeout: int = 150
) -> requests.Response:
    """
    Sends request to cloud LLM provider with automatic exponential backoff
    on HTTP 429 (Rate Limit / Too Many Requests) and HTTP 502/503/504.
    """
    last_resp = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
            last_resp = resp
        except requests.exceptions.RequestException as req_err:
            if attempt == max_retries:
                raise RuntimeError(f"Error de conexión con {provider_name}: {req_err}")
            wait_time = attempt * 5.0
            print(f"⚠️ Fallo de conexión con {provider_name}. Reintentando en {wait_time}s ({attempt}/{max_retries})...")
            time.sleep(wait_time)
            continue

        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After")
            try:
                wait_sec = float(retry_after) if retry_after else (attempt * 7.0 + 3.0)
            except Exception:
                wait_sec = attempt * 7.0 + 3.0
            print(f"⚠️ [Rate Limit 429] {provider_name} alcanzó su límite de velocidad. Esperando {wait_sec:.1f}s antes de reintentar (intento {attempt}/{max_retries})...")
            time.sleep(wait_sec)
            continue

        if resp.status_code in [502, 503, 504, 529]:
            wait_sec = attempt * 5.0
            print(f"⚠️ [{resp.status_code}] Servidor {provider_name} saturado. Esperando {wait_sec:.1f}s (intento {attempt}/{max_retries})...")
            time.sleep(wait_sec)
            continue

        return resp

    return last_resp


def call_cloud_llm(
    provider: str,
    api_key: str,
    prompt: str,
    model_name: Optional[str] = None,
    content_type: str = "gaming",
    target_duration: str = "60s"
) -> str:
    system_prompt = build_system_prompt(content_type, target_duration)
    full_prompt = f"{system_prompt}\n\n{prompt}"

    if provider == "openrouter":
        url = "https://openrouter.ai/api/v1/chat/completions"
        model = model_name or os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://autoshorts.local",
            "X-Title": "AutoShorts Desktop",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }
        resp = robust_cloud_post(url, headers, payload, provider_name="OpenRouter")
        if not resp.ok:
            # If 400 bad request (some free models don't support response_format: json_object)
            if resp.status_code == 400 and "response_format" in resp.text:
                payload.pop("response_format", None)
                resp = robust_cloud_post(url, headers, payload, provider_name="OpenRouter")
        if not resp.ok:
            raise RuntimeError(f"OpenRouter call failed ({resp.status_code}): {resp.text}")
        return resp.json()["choices"][0]["message"]["content"]

    elif provider == "deepseek":
        url = "https://api.deepseek.com/chat/completions"
        model = model_name or os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        headers = {"Authorization": f"Bearer {api_key}"}
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": full_prompt}],
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }
        resp = robust_cloud_post(url, headers, payload, provider_name="DeepSeek")
        if not resp.ok:
            raise RuntimeError(f"DeepSeek call failed ({resp.status_code}): {resp.text}")
        return resp.json()["choices"][0]["message"]["content"]

    elif provider == "gemini":
        model = model_name or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}
        }
        resp = robust_cloud_post(url, headers={}, payload=payload, provider_name="Gemini")
        if not resp.ok:
            raise RuntimeError(f"Gemini call failed ({resp.status_code}): {resp.text}")
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    elif provider == "openai":
        url = "https://api.openai.com/v1/chat/completions"
        model = model_name or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        headers = {"Authorization": f"Bearer {api_key}"}
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": full_prompt}],
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }
        resp = robust_cloud_post(url, headers, payload, provider_name="OpenAI")
        if not resp.ok:
            raise RuntimeError(f"OpenAI call failed ({resp.status_code}): {resp.text}")
        return resp.json()["choices"][0]["message"]["content"]

    elif provider == "claude":
        url = "https://api.anthropic.com/v1/messages"
        model = model_name or os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
        payload = {
            "model": model,
            "max_tokens": 1800,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": full_prompt}]
        }
        resp = robust_cloud_post(url, headers, payload, provider_name="Claude")
        if not resp.ok:
            raise RuntimeError(f"Claude call failed ({resp.status_code}): {resp.text}")
        content = resp.json().get("content", [])
        return content[0].get("text", "") if content else ""

    elif provider == "groq":
        url = "https://api.groq.com/openai/v1/chat/completions"
        model = model_name or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        headers = {"Authorization": f"Bearer {api_key}"}
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": full_prompt}],
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }
        resp = robust_cloud_post(url, headers, payload, provider_name="Groq")
        if not resp.ok:
            raise RuntimeError(f"Groq call failed ({resp.status_code}): {resp.text}")
        return resp.json()["choices"][0]["message"]["content"]

    else:
        raise ValueError(f"Unsupported provider: {provider}")


def deduplicate_candidates(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate overlapping candidates across chunk boundaries."""
    if not candidates:
        return []

    # Sort by score descending
    candidates.sort(key=lambda c: c["score"], reverse=True)
    selected = []

    for cand in candidates:
        overlap = False
        for s in selected:
            inter_start = max(cand["start"], s["start"])
            inter_end = min(cand["end"], s["end"])
            if inter_end > inter_start:
                overlap_dur = inter_end - inter_start
                cand_dur = cand["end"] - cand["start"]
                if (overlap_dur / cand_dur) > 0.5:
                    overlap = True
                    break
        if not overlap:
            selected.append(cand)

    return selected


def generate_fallback_candidates(
    segments: List[Dict[str, Any]],
    target_duration: str = "60s"
) -> List[Dict[str, Any]]:
    """Generates intelligent fallback candidates if LLM found 0 moments, ensuring the pipeline never fails."""
    if not segments:
        return []

    dur_info = DURATION_SPECS.get(target_duration, DURATION_SPECS["60s"])
    target_len = (dur_info["min"] + dur_info["max"]) / 2.0
    total_dur = segments[-1]["end"] - segments[0]["start"]

    # If the video is short (<= target_len * 1.5), use the whole spoken part
    if total_dur <= (target_len * 1.5):
        first_text = segments[0].get("text", "").strip()
        hook = first_text[:60] if len(first_text) > 5 else "Clip destacado del video"
        return [{
            "start": round(segments[0]["start"], 2),
            "end": round(segments[-1]["end"], 2),
            "score": 0.85,
            "hook": hook,
            "rationale": "Segmento completo de audio detectado",
            "description": f"{hook}. Mira el momento completo. #viral #shorts"
        }]

    # For longer videos, create natural speech slices of target_len
    fallbacks = []
    curr_start = segments[0]["start"]
    curr_text = []

    for s in segments:
        curr_text.append(s.get("text", ""))
        dur = s["end"] - curr_start
        if dur >= target_len:
            hook = curr_text[0].strip()[:60] if curr_text else "Momento destacado"
            fallbacks.append({
                "start": round(curr_start, 2),
                "end": round(s["end"], 2),
                "score": 0.75,
                "hook": hook or "Momento destacado del video",
                "rationale": "Segmento continuo con alta densidad de voz",
                "description": f"{hook}. Momento destacado del video. #viral #shorts"
            })
            curr_start = s["end"]
            curr_text = []
            if len(fallbacks) >= 5:
                break

    return fallbacks


def detect_candidates_pipeline(
    transcript: Dict[str, Any],
    provider: str = "local",
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    content_type: str = "gaming",
    target_duration: str = "60s",
    on_progress: Optional[Callable[[str, int, int], None]] = None,
    is_cancelled: Optional[Callable[[], bool]] = None,
    audio_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Main detection pipeline using Chunking ("Divide y Vencerás").
    Processes long streams in 10-minute windows to avoid context explosion on 12GB VRAM.
    Integrates audio action peak detection for silent gameplay clutches / gunfights.
    Automatically unloads Ollama models upon completion or cancellation to immediately free VRAM.
    """
    segments = transcript.get("segments", [])
    if not segments:
        return []

    # Detect high-energy audio peaks (gunshots, explosions, action) if audio file is available
    action_peaks = []
    if audio_path and os.path.exists(audio_path):
        try:
            from .media import detect_audio_action_peaks
            action_peaks = detect_audio_action_peaks(audio_path)
            if action_peaks:
                print(f"Detectadas {len(action_peaks)} zonas de acción acústica intensa en el audio del juego.")
        except Exception as e:
            print(f"Nota en detección de picos de audio: {e}")

    # Partition into 10-minute chunks (600 seconds) with 45 seconds overlap
    chunks = partition_segments(segments, chunk_duration_sec=600.0, overlap_sec=45.0)
    total_chunks = len(chunks)
    all_drafts = []

    print(f"Dividing stream into {total_chunks} chunk(s) of 10 min for {content_type} detection (objetivo: {target_duration})...")

    try:
        for idx, chunk in enumerate(chunks, start=1):
            if is_cancelled and is_cancelled():
                print("🛑 Proceso de detección cancelado por el usuario.")
                break

            chunk_start_fmt = f"{int(chunk[0]['start'] // 60):02d}:{int(chunk[0]['start'] % 60):02d}"
            chunk_end_fmt = f"{int(chunk[-1]['end'] // 60):02d}:{int(chunk[-1]['end'] % 60):02d}"
            thinking_indicator = ""
            if provider in ["local", "ollama"] and detect_model_thinking_capability(model_name or "qwen2.5:7b"):
                thinking_indicator = " (Razonamiento CoT activo)"

            status_msg = f"Analizando bloque {idx}/{total_chunks} ({chunk_start_fmt} - {chunk_end_fmt}){thinking_indicator}..."
            print(status_msg)

            if on_progress:
                on_progress(status_msg, idx, total_chunks)

            # Check if this chunk contains high-action audio peaks
            chunk_start = chunk[0]["start"]
            chunk_end = chunk[-1]["end"]
            chunk_peaks = [p for p in action_peaks if p["end"] > chunk_start and p["start"] < chunk_end]

            peak_cues = ""
            if chunk_peaks:
                cue_lines = [
                    f"- [{int(p['start']//60):02d}:{int(p['start']%60):02d} a {int(p['end']//60):02d}:{int(p['end']%60):02d}] 💥 ACCIÓN INTENSA / DISPAROS DEL JUEGO (Streamer concentrado jugando)"
                    for p in chunk_peaks[:5]
                ]
                peak_cues = "\n\nZonas de alta acción/disparos detectadas acústicamente:\n" + "\n".join(cue_lines)

            prompt_text = f"Transcripción del segmento [{chunk_start_fmt} a {chunk_end_fmt}]:\n{compact_segments(chunk)}{peak_cues}"

            try:
                if provider in ["local", "ollama"]:
                    model = model_name or "qwen2.5:7b"
                    resp_text = call_ollama(
                        prompt_text,
                        model_name=model,
                        content_type=content_type,
                        target_duration=target_duration
                    )
                else:
                    resp_text = call_cloud_llm(
                        provider,
                        api_key or "",
                        prompt_text,
                        model_name=model_name,
                        content_type=content_type,
                        target_duration=target_duration
                    )

                print(f"LLM Response:\n{resp_text}")
                chunk_candidates = parse_candidate_json(
                    resp_text,
                    min_duration=5.0,
                    segments=chunk,
                    target_duration=target_duration
                )
                print(f"Parsed candidates count: {len(chunk_candidates)}")
                all_drafts.extend(chunk_candidates)

                # Prevent rate limit saturation on Cloud providers
                if provider not in ["local", "ollama"] and idx < total_chunks:
                    time.sleep(2.5)
            except Exception as e:
                print(f"Error analyzing chunk {idx}: {e}")

            if is_cancelled and is_cancelled():
                print("🛑 Proceso de detección cancelado tras procesar bloque.")
                break

        # Check for silent gameplay clutches (action peaks with minimal/no speech)
        for p in action_peaks:
            overlapping_speech = [s for s in segments if s["end"] > p["start"] and s["start"] < p["end"]]
            if len(overlapping_speech) <= 1:
                all_drafts.append({
                    "start": max(0.0, p["start"] - 1.0),
                    "end": p["end"] + 1.0,
                    "score": 4.5,
                    "hook": "🎮 Jugada Épica en Máxima Concentración",
                    "rationale": "Momento de acción intensa y tiroteo del juego con el streamer totalmente enfocado en jugar sin hablar.",
                    "description": "¡Mira la concentración total en esta jugada de acción intensa! 🎮🔥 #gaming #highlight #gameplay"
                })

        # Deduplicate and sort globally
        unique_candidates = deduplicate_candidates(all_drafts)
        unique_candidates.sort(key=lambda c: c["score"], reverse=True)

        # Intelligent fallback if LLM found 0 moments and was not cancelled
        if not unique_candidates and not (is_cancelled and is_cancelled()):
            print("Aviso: LLM no devolvió candidatos directos. Generando candidatos automáticos de respaldo...")
            unique_candidates = generate_fallback_candidates(segments, target_duration=target_duration)

        return unique_candidates[:100]

    finally:
        # Free VRAM immediately in Ollama so other models can be used
        if provider in ["local", "ollama"]:
            unload_all_ollama_models(model_name)


def plan_summary_narrative(
    candidates: List[Dict[str, Any]],
    target_duration_minutes: float,
    provider: str = "local",
    model_name: Optional[str] = None,
    api_key: Optional[str] = None,
    summary_vibe: str = "balanced"
) -> Dict[str, Any]:
    """
    Asks the LLM (Ollama or Cloud) to act as a video editor and select & order the moments
    to craft an engaging narrative summary totaling approximately target_duration_minutes.
    Supports themes: 'balanced', 'tryhard', 'funny'.
    Generates thumbnail ideas.
    Returns:
      {
        "narrative_title": str,
        "storyline": str,
        "thumbnail_ideas": list of str,
        "ordered_clip_ids": list of str
      }
    """
    if not candidates:
        return {"narrative_title": "Resumen del Stream", "storyline": "Sin clips disponibles.", "thumbnail_ideas": [], "ordered_clip_ids": []}

    target_seconds = target_duration_minutes * 60.0
    min_seconds = max(30.0, target_seconds - 60.0)
    max_seconds = target_seconds + 60.0

    # Build lightweight clip summary for LLM
    clips_info = []
    for c in candidates:
        dur = round(float(c.get("endSec", 0)) - float(c.get("startSec", 0)), 1)
        clips_info.append({
            "id": c.get("id"),
            "hook": c.get("hook", "Momento destacado"),
            "description": c.get("description", ""),
            "duration_sec": dur,
            "score": c.get("score", 3.0)
        })

    avg_dur = sum(c["duration_sec"] for c in clips_info) / max(1, len(clips_info))
    approx_count = max(2, min(len(clips_info), int(round(target_seconds / max(10.0, avg_dur)))))
    min_count = max(2, approx_count - 2)
    max_count = min(len(clips_info), approx_count + 2)

    vibe_instructions = {
        "tryhard": (
            "ENFOQUE TEMÁTICO: 'TRYHARD / JUGADAS ÉPICAS'\n"
            "- Prioriza y selecciona preferentemente momentos de alta tensión, kills, clutches, jugadas maestras y victorias.\n"
            "- Descarta momentos de risas lentas o charlas secundarias."
        ),
        "funny": (
            "ENFOQUE TEMÁTICO: 'RISAS, FAILS Y HUMOR'\n"
            "- Prioriza y selecciona preferentemente momentos cómicos, risas, bromas, anécdotas, bugs graciosos, fails y trolleo.\n"
            "- Descarta momentos puramente tácticos o serios."
        ),
        "balanced": (
            "ENFOQUE TEMÁTICO: 'EQUILIBRADO / HISTORIA COMPLETA'\n"
            "- Selecciona una mezcla armónica que cuente la historia del directo: intro teaser impactante, momentos entretenidos/risas, partidas clave y desenlace."
        )
    }
    vibe_rule = vibe_instructions.get(summary_vibe, vibe_instructions["balanced"])

    prompt = f"""Actúa como un editor profesional de YouTube y TikTok para streamers de gaming y entretenimiento.
Tienes una lista de {len(clips_info)} momentos/clips extraídos de un stream, cada uno con su ID, título/hook, descripción, duración en segundos y score de viralidad:

{json.dumps(clips_info, ensure_ascii=False, indent=2)}

Tu objetivo es armar la compilación perfecta para un video resumen de aproximadamente {target_duration_minutes:.0f} minutos (duración total deseada: entre {min_seconds:.0f}s y {max_seconds:.0f}s).

{vibe_rule}

REGLAS EDITORIALES OBLIGATORIAS:
1. LÍMITE DE DURACIÓN ESTRICTO: El video NO debe sobrepasar aproximadamente {target_duration_minutes:.0f} minutos. Dado que los momentos duran en promedio {int(avg_dur)}s, debes seleccionar ÚNICAMENTE entre {min_count} y {max_count} clips (los mejores de la lista). ¡NO selecciones todos los clips!
2. El PRIMER clip ("ordered_clip_ids"[0]) DEBE ser el mejor gancho/teaser de alto impacto para retener al espectador en los primeros 10 segundos.
3. Organiza los clips elegidos para crear una progresión narrativa emocionante.
4. La suma acumulada de las duraciones de los IDs elegidos DEBE estar lo más cerca posible de {int(target_seconds)} segundos.
5. Genera 3 ideas cortas y en mayúsculas de texto para la miniatura (thumbnail) de YouTube (ej. ["1v4 IMPOSIBLE", "NO ME LO CREO", "CLUTCH FINAL"]).
6. No repitas ningún ID. Usa únicamente IDs existentes en la lista proporcionada.

Responde EXCLUSIVAMENTE con este objeto JSON:
{{
  "narrative_title": "Título sugerido para YouTube (atractivo, sin emojis en el archivo)",
  "storyline": "Explicación breve de la progresión narrativa elegida",
  "thumbnail_ideas": ["TEXTO 1", "TEXTO 2", "TEXTO 3"],
  "ordered_clip_ids": ["id_del_clip_1", "id_del_clip_2", ...]
}}"""

    raw_response = ""
    try:
        if provider in ["local", "ollama"]:
            url = "http://127.0.0.1:11434/api/chat"
            active_model = model_name or "qwen2.5:7b"
            has_thinking = detect_model_thinking_capability(active_model)
            summary_sys = "Eres un editor experto de videos para streamers de YouTube. Responde siempre en formato JSON."
            if has_thinking:
                summary_sys += " Utiliza tu proceso de pensamiento para calcular la suma de duraciones y respetar estrictamente los minutos pedidos, luego entrega el JSON."

            payload: Dict[str, Any] = {
                "model": active_model,
                "messages": [
                    {"role": "system", "content": summary_sys},
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "options": {"temperature": 0.3}
            }
            if not has_thinking:
                payload["format"] = "json"

            resp = requests.post(url, json=payload, timeout=60)
            if resp.ok:
                msg = resp.json().get("message", {})
                content = msg.get("content", "")
                thinking = msg.get("thinking", "")
                if "<think>" in content:
                    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                if not content and thinking:
                    m = re.search(r"(\{.*\"narrative_title\".*\})", thinking, re.DOTALL)
                    if m:
                        content = m.group(1)
                raw_response = content
            else:
                print(f"Ollama narrative planning failed: {resp.text}")

        elif provider in ["claude", "deepseek", "gemini", "openai", "openrouter", "groq"]:
            # Direct cloud call
            if provider == "gemini":
                model = model_name or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3}
                }
                resp = robust_cloud_post(url, headers={}, payload=payload, provider_name="Gemini")
                if resp.ok:
                    raw_response = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            elif provider == "openrouter":
                url = "https://openrouter.ai/api/v1/chat/completions"
                model = model_name or os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"}
                }
                resp = robust_cloud_post(url, headers, payload, provider_name="OpenRouter")
                if resp.ok:
                    raw_response = resp.json()["choices"][0]["message"]["content"]
            elif provider in ["deepseek", "groq", "openai"]:
                endpoint = (
                    "https://api.deepseek.com/chat/completions" if provider == "deepseek"
                    else "https://api.groq.com/openai/v1/chat/completions" if provider == "groq"
                    else "https://api.openai.com/v1/chat/completions"
                )
                model = model_name or ("deepseek-chat" if provider == "deepseek" else "llama-3.3-70b-versatile" if provider == "groq" else "gpt-4o-mini")
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"}
                }
                resp = robust_cloud_post(endpoint, headers, payload, provider_name=provider)
                if resp.ok:
                    raw_response = resp.json()["choices"][0]["message"]["content"]
            elif provider == "claude":
                url = "https://api.anthropic.com/v1/messages"
                model = model_name or "claude-3-5-sonnet-latest"
                headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
                payload = {
                    "model": model,
                    "max_tokens": 1500,
                    "temperature": 0.3,
                    "messages": [{"role": "user", "content": prompt}]
                }
                resp = robust_cloud_post(url, headers, payload, provider_name="Claude")
                if resp.ok:
                    content = resp.json().get("content", [])
                    raw_response = content[0].get("text", "") if content else ""

        # Parse JSON response
        if raw_response:
            clean_json = raw_response.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].split("```")[0].strip()

            parsed = json.loads(clean_json)
            ordered_ids = parsed.get("ordered_clip_ids", [])
            valid_ids = {c["id"] for c in candidates}
            filtered_ids = [cid for cid in ordered_ids if cid in valid_ids]
            if filtered_ids:
                return {
                    "narrative_title": parsed.get("narrative_title", "Resumen de Stream").strip(),
                    "storyline": parsed.get("storyline", "Secuencia narrativa generada por IA").strip(),
                    "thumbnail_ideas": parsed.get("thumbnail_ideas", ["¡MOMENTOS ÉPICOS!", "NO TE LO PIERDAS", "FINAL DEL STREAM"]),
                    "ordered_clip_ids": filtered_ids
                }
    except Exception as e:
        print(f"Aviso: Error en secuenciamiento con IA ({e}). Usando orden voraz inteligente...")
    finally:
        # Crucial: Unload Ollama immediately so RAM/VRAM is 100% free for FFmpeg!
        if provider in ["local", "ollama"]:
            unload_all_ollama_models(model_name)

    # Fallback greedy selection
    candidates_by_score = sorted(candidates, key=lambda c: c.get("score", 0), reverse=True)
    chosen = []
    current_dur = 0.0

    intro = candidates_by_score[0]
    chosen.append(intro["id"])
    current_dur += (float(intro["endSec"]) - float(intro["startSec"]))

    remaining = [c for c in candidates if c["id"] != intro["id"]]
    remaining.sort(key=lambda c: float(c["startSec"]))

    for c in remaining:
        dur = float(c["endSec"]) - float(c["startSec"])
        if (current_dur + dur) <= (target_seconds + 30.0):
            chosen.append(c["id"])
            current_dur += dur
        if current_dur >= target_seconds:
            break

    return {
        "narrative_title": "Resumen del Stream",
        "storyline": "Selección inteligente basada en gancho inicial y orden cronológico.",
        "thumbnail_ideas": ["MOMENTOS ÉPICOS", "JUGADAS DEL STREAM", "RESUMEN FINAL"],
        "ordered_clip_ids": chosen
    }
