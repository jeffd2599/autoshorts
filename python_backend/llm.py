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


def build_system_prompt(content_type: str = "gaming", target_duration: str = "60s") -> str:
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

    return f"""{focus_text}

REGLAS DE DURACIÓN Y TIMESTAMPS:
- CRÍTICO: {dur_rule}
- NO elijas solo una frase corta de 2 a 5 segundos. El timestamp 'start' debe marcar el inicio del momento y 'end' debe abarcar el desarrollo completo hasta alcanzar la duración objetivo indicada.
- 'hook': Título gancho llamativo, directo y viral (en Español).
- 'rationale': Explicación breve de por qué este momento es entretenido o viral.
- 'description': Descripción optimizada para redes sociales (TikTok, Reels, Shorts, X) de 1 a 2 frases vendedoras invitando a interactuar, con 3 a 4 hashtags relevantes (ej. #gaming #clipviral).

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
    clean = re.sub(r"^```json\s*", "", clean)
    clean = re.sub(r"^```\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean)

    # Find JSON object
    match = re.search(r"(\{.*\})", clean, re.DOTALL)
    if match:
        clean = match.group(1)

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


def call_ollama(
    prompt: str,
    model_name: str = "qwen2.5:7b",
    content_type: str = "gaming",
    target_duration: str = "60s"
) -> str:
    system_prompt = build_system_prompt(content_type, target_duration)
    url = "http://127.0.0.1:11434/api/chat"
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "think": False,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_ctx": 8192
        },
        "format": {
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "start": {"type": "number"},
                            "end": {"type": "number"},
                            "score": {"type": "number"},
                            "hook": {"type": "string"},
                            "rationale": {"type": "string"},
                            "description": {"type": "string"}
                        },
                        "required": ["start", "end", "score", "hook", "rationale", "description"]
                    }
                }
            },
            "required": ["candidates"]
        }
    }
    resp = requests.post(url, json=payload, timeout=300)
    if not resp.ok:
        raise RuntimeError(f"Ollama call failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    msg = data.get("message", {})
    content = msg.get("content", "")
    if not content and "thinking" in msg:
        content = msg.get("thinking", "")
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
    is_cancelled: Optional[Callable[[], bool]] = None
) -> List[Dict[str, Any]]:
    """
    Main detection pipeline using Chunking ("Divide y Vencerás").
    Processes long streams in 10-minute windows to avoid context explosion on 12GB VRAM.
    Automatically unloads Ollama models upon completion or cancellation to immediately free VRAM.
    """
    segments = transcript.get("segments", [])
    if not segments:
        return []

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
            status_msg = f"Analizando bloque {idx}/{total_chunks} ({chunk_start_fmt} - {chunk_end_fmt})..."
            print(status_msg)

            if on_progress:
                on_progress(status_msg, idx, total_chunks)

            prompt_text = f"Transcripción del segmento [{chunk_start_fmt} a {chunk_end_fmt}]:\n{compact_segments(chunk)}"

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
