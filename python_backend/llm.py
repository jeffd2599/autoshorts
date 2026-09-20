import json
import os
import re
from typing import Any, Callable, Dict, List, Optional
import requests

PROMPTS = {
    "gaming": """Eres un editor profesional de clips de GAMING para TikTok, YouTube Shorts y Reels virales.
Tu misión es encontrar los mejores momentos de gameplays, directos o torneos:
- Jugadas destacadas, clutches, kills o partidas épicas.
- Momentos divertidos, risas, gritos, enfados (rage), sustos o celebraciones.
- Fails cómicos, bugs o troleos.
- Anuncios de torneos, retos 1v1, fechas o reglas del juego.
- Remates y anécdotas entretenidas.

REGLAS DE DURACIÓN Y TIMESTAMPS:
- CRÍTICO: Cada clip DEBE durar entre 15 y 60 segundos completos (ejemplo: start: 3.02, end: 24.50).
- NO elijas solo la frase del gancho de 2 o 3 segundos. El 'start' es donde empieza el gancho y el 'end' DEBE abarcar las siguientes frases de explicación o jugada hasta sumar al menos 15 a 45 segundos.
- El gancho ('hook') debe ser llamativo, directo y despertar curiosidad.

Devuelve entre 1 y 5 candidatos en formato JSON exactamente con esta estructura:
{"candidates":[{"start":0.0,"end":0.0,"score":0.0,"hook":"...","rationale":"..."}]}

IMPORTANTE: Analiza en español y genera todos los ganchos y explicaciones estrictamente en Español. No traduzcas al inglés.""",

    "tutorial": """Eres un editor profesional de contenido educativo, tutoriales y avisos para Shorts/Reels/TikTok.
Tu misión es encontrar los mejores segmentos con valor informativo:
- Explicaciones claras de cómo hacer algo o resolver un problema.
- Trucos (tips, hacks) o configuraciones clave.
- Anuncios oficiales, convocatorias o fechas importantes.

REGLAS DE DURACIÓN Y TIMESTAMPS:
- Cada clip DEBE durar entre 15 y 60 segundos de corrido (ejemplo: start: 8.50, end: 32.00). No pongas clips de solo 2 segundos.
- El gancho ('hook') debe plantear la pregunta o el beneficio que aprenderán.

Devuelve entre 1 y 5 candidatos en formato JSON exactamente con esta estructura:
{"candidates":[{"start":0.0,"end":0.0,"score":0.0,"hook":"...","rationale":"..."}]}

IMPORTANTE: Analiza en español y genera todos los ganchos y explicaciones estrictamente en Español. No traduzcas al inglés.""",

    "podcast": """Eres un estratega de redes sociales buscando momentos virales en podcasts, entrevistas y charlas.
Tu misión es encontrar historias fascinantes, opiniones controvertidas o lecciones impactantes.
- Duración sugerida: entre 25 y 90 segundos completos con inicio y conclusión clara.

Devuelve entre 2 y 5 candidatos en formato JSON exactamente con esta estructura:
{"candidates":[{"start":0.0,"end":0.0,"score":0.0,"hook":"...","rationale":"..."}]}

IMPORTANTE: Analiza en español y genera todos los ganchos estrictamente en Español. No traduzcas al inglés.""",

    "general": """Eres un editor profesional de videos cortos virales para TikTok, Shorts y Reels.
Tu misión es identificar los fragmentos más entretenidos, dinámicos y compartibles.
- Duración sugerida: entre 15 y 60 segundos de corrido.

Devuelve entre 1 y 5 candidatos en formato JSON exactamente con esta estructura:
{"candidates":[{"start":0.0,"end":0.0,"score":0.0,"hook":"...","rationale":"..."}]}

IMPORTANTE: Analiza en español y genera todos los ganchos estrictamente en Español. No traduzcas al inglés."""
}

VIRAL_SYSTEM_PROMPT = PROMPTS["gaming"]


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
    segments: Optional[List[Dict[str, Any]]] = None
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

            # Automatically expand clips if the LLM picked a 2-5s hook line
            if segments:
                start, end = expand_short_candidate(start, end, segments, target_min=12.0)

            dur = end - start
            if dur >= min_duration and hook:
                drafts.append({
                    "start": round(start, 2),
                    "end": round(end, 2),
                    "score": max(0.0, min(1.0, score)),
                    "hook": hook,
                    "rationale": rationale
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


def call_ollama(prompt: str, model_name: str = "qwen2.5:7b", content_type: str = "gaming") -> str:
    system_prompt = PROMPTS.get(content_type, PROMPTS["gaming"])
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
                            "rationale": {"type": "string"}
                        },
                        "required": ["start", "end", "score", "hook", "rationale"]
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



def call_cloud_llm(provider: str, api_key: str, prompt: str, model_name: Optional[str] = None, content_type: str = "gaming") -> str:
    system_prompt = PROMPTS.get(content_type, PROMPTS["gaming"])
    full_prompt = f"{VIRAL_SYSTEM_PROMPT}\n\n{prompt}"

    if provider == "deepseek":
        url = "https://api.deepseek.com/chat/completions"
        model = model_name or os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": full_prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"}
            },
            timeout=120
        )
        if not resp.ok:
            raise RuntimeError(f"DeepSeek call failed: {resp.text}")
        return resp.json()["choices"][0]["message"]["content"]

    elif provider == "gemini":
        model = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        resp = requests.post(
            url,
            json={
                "contents": [{"parts": [{"text": full_prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}
            },
            timeout=120
        )
        if not resp.ok:
            raise RuntimeError(f"Gemini call failed: {resp.text}")
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    elif provider == "openai":
        url = "https://api.openai.com/v1/chat/completions"
        model = model_name or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": full_prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"}
            },
            timeout=120
        )
        if not resp.ok:
            raise RuntimeError(f"OpenAI call failed: {resp.text}")
        return resp.json()["choices"][0]["message"]["content"]

    elif provider == "claude":
        url = "https://api.anthropic.com/v1/messages"
        model = model_name or os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")
        resp = requests.post(
            url,
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            json={
                "model": model,
                "max_tokens": 1800,
                "temperature": 0.2,
                "messages": [{"role": "user", "content": full_prompt}]
            },
            timeout=120
        )
        if not resp.ok:
            raise RuntimeError(f"Claude call failed: {resp.text}")
        content = resp.json().get("content", [])
        return content[0].get("text", "") if content else ""

    elif provider == "groq":
        url = "https://api.groq.com/openai/v1/chat/completions"
        model = model_name or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": full_prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"}
            },
            timeout=120
        )
        if not resp.ok:
            raise RuntimeError(f"Groq call failed: {resp.text}")
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


def generate_fallback_candidates(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generates intelligent fallback candidates if LLM found 0 moments, ensuring the pipeline never fails."""
    if not segments:
        return []

    total_dur = segments[-1]["end"] - segments[0]["start"]

    # If the video is short (<= 90s), use the whole spoken part or 2 halves
    if total_dur <= 90.0:
        first_text = segments[0].get("text", "").strip()
        hook = first_text[:60] if len(first_text) > 5 else "Clip destacado del video"
        return [{
            "start": round(segments[0]["start"], 2),
            "end": round(segments[-1]["end"], 2),
            "score": 0.85,
            "hook": hook,
            "rationale": "Segmento completo de audio detectado"
        }]

    # For longer videos, create natural speech slices of ~30-45s
    fallbacks = []
    curr_start = segments[0]["start"]
    curr_text = []

    for s in segments:
        curr_text.append(s.get("text", ""))
        dur = s["end"] - curr_start
        if dur >= 30.0:
            hook = curr_text[0].strip()[:60] if curr_text else "Momento destacado"
            fallbacks.append({
                "start": round(curr_start, 2),
                "end": round(s["end"], 2),
                "score": 0.75,
                "hook": hook or "Momento destacado del video",
                "rationale": "Segmento continuo con alta densidad de voz"
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
    on_progress: Optional[Callable[[str, int, int], None]] = None
) -> List[Dict[str, Any]]:
    """
    Main detection pipeline using Chunking ("Divide y Vencerás").
    Processes long streams in 10-minute windows to avoid context explosion on 12GB VRAM.
    """
    segments = transcript.get("segments", [])
    if not segments:
        return []

    # Partition into 10-minute chunks (600 seconds) with 45 seconds overlap
    chunks = partition_segments(segments, chunk_duration_sec=600.0, overlap_sec=45.0)
    total_chunks = len(chunks)
    all_drafts = []

    print(f"Dividing stream into {total_chunks} chunk(s) of 10 min for {content_type} detection...")

    for idx, chunk in enumerate(chunks, start=1):
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
                resp_text = call_ollama(prompt_text, model_name=model, content_type=content_type)
            else:
                resp_text = call_cloud_llm(provider, api_key or "", prompt_text, model_name=model_name, content_type=content_type)

            print(f"LLM Response:\n{resp_text}")
            chunk_candidates = parse_candidate_json(resp_text, min_duration=5.0, segments=chunk)
            print(f"Parsed candidates count: {len(chunk_candidates)}")
            all_drafts.extend(chunk_candidates)
        except Exception as e:
            print(f"Error analyzing chunk {idx}: {e}")

    # Deduplicate and sort globally
    unique_candidates = deduplicate_candidates(all_drafts)
    unique_candidates.sort(key=lambda c: c["score"], reverse=True)

    # Intelligent fallback if LLM found 0 moments
    if not unique_candidates:
        print("Aviso: LLM no devolvió candidatos directos. Generando candidatos automáticos de respaldo...")
        unique_candidates = generate_fallback_candidates(segments)

    # Return all detected moments (up to 100)
    return unique_candidates[:100]
