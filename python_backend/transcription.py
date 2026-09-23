import json
import os
from typing import Any, Dict, List, Optional
import warnings
import requests

warnings.filterwarnings("ignore", message=".*Triton.*")


WHISPER_SPECS = {
    "tiny": {"vram": "~1 GB", "desc": "Ultra rápido, precisión básica", "recommended": False},
    "base": {"vram": "~1.5 GB", "desc": "Rápido y ligero", "recommended": False},
    "small": {"vram": "~2.5 GB", "desc": "Equilibrado", "recommended": False},
    "medium": {"vram": "~5 GB", "desc": "Buena precisión", "recommended": False},
    "large-v3-turbo": {"vram": "~6 GB", "desc": "Alta precisión y velocidad optimizada (Recomendado para RTX 2060 12GB)", "recommended": True},
    "large-v3": {"vram": "~10 GB", "desc": "Máxima precisión en español y jerga (Alto consumo de VRAM)", "recommended": False},
}


def get_installed_whisper_models() -> List[Dict[str, Any]]:
    cache_dir = os.path.expanduser("~/.cache/whisper")
    installed_files = set()
    if os.path.exists(cache_dir):
        for f in os.listdir(cache_dir):
            if f.endswith(".pt"):
                installed_files.add(f[:-3])

    models = []
    ordered_ids = ["base", "large-v3-turbo", "large-v3", "small", "medium", "tiny"]
    for mid in ordered_ids:
        spec = WHISPER_SPECS.get(mid, {"vram": "~2 GB", "desc": "Modelo estándar", "recommended": False})
        is_installed = mid in installed_files or (mid == "large-v3-turbo" and "turbo" in installed_files)
        models.append({
            "id": mid,
            "name": mid,
            "vram": spec["vram"],
            "desc": spec["desc"],
            "recommended": spec["recommended"],
            "downloaded": is_installed
        })
    return models


def whisper_available() -> bool:
    try:
        import whisper
        return True
    except ImportError:
        return False


def transcribe_local(audio_path: str, model_name: str = "base") -> Dict[str, Any]:
    import torch
    import whisper

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading Whisper model '{model_name}' on device: {device}...")
    model = whisper.load_model(model_name, device=device)

    print(f"Transcribing audio '{audio_path}' in Spanish...")
    gamer_initial_prompt = (
        "clutch, headshot, rushear, lootear, drop, respawn, hitbox, nerfeo, buff, "
        "streamer, lag, ping, push, dault, noob, ace, pentakill, clip, directo, "
        "discord, twitch, youtube, shorts, partida, gameplay, sniper, kill"
    )
    result = model.transcribe(
        audio_path,
        word_timestamps=True,
        language="es",
        initial_prompt=gamer_initial_prompt
    )

    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    segments_raw = result.get("segments", [])
    duration = segments_raw[-1]["end"] if segments_raw else 0.0

    segments = []
    words = []

    for seg in segments_raw:
        segments.append({
            "start": float(seg["start"]),
            "end": float(seg["end"]),
            "speaker": "S1",
            "text": str(seg["text"]).strip()
        })
        for w in seg.get("words", []):
            words.append({
                "text": str(w["word"]).strip(),
                "start": float(w["start"]),
                "end": float(w["end"]),
                "speaker": "S1"
            })

    return {
        "language": "es",
        "duration": duration,
        "speakers": ["S1"],
        "words": words,
        "segments": segments
    }


def transcribe_deepgram(audio_path: str, api_key: str) -> Dict[str, Any]:
    url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&language=es&utterances=true"
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "audio/wav"
    }

    with open(audio_path, "rb") as f:
        audio_data = f.read()

    resp = requests.post(url, headers=headers, data=audio_data, timeout=300)
    if not resp.ok:
        raise RuntimeError(f"Deepgram transcription failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    alt = (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
    )

    words = []
    for w in alt.get("words", []):
        words.append({
            "text": w.get("punctuated_word", w.get("word", "")),
            "start": float(w.get("start", 0.0)),
            "end": float(w.get("end", 0.0)),
            "speaker": f"S{w.get('speaker', 0)}"
        })

    duration = float(data.get("metadata", {}).get("duration", 0.0))

    # Build segments from utterances or words
    segments = []
    for utt in alt.get("paragraphs", {}).get("paragraphs", []):
        for sentence in utt.get("sentences", []):
            segments.append({
                "start": float(sentence.get("start", 0.0)),
                "end": float(sentence.get("end", 0.0)),
                "speaker": "S1",
                "text": sentence.get("text", "").strip()
            })

    if not segments and words:
        # Group every 10 words into a segment if no sentences
        for i in range(0, len(words), 10):
            chunk = words[i:i+10]
            segments.append({
                "start": chunk[0]["start"],
                "end": chunk[-1]["end"],
                "speaker": "S1",
                "text": " ".join(w["text"] for w in chunk)
            })

    return {
        "language": "es",
        "duration": duration,
        "speakers": ["S1"],
        "words": words,
        "segments": segments
    }
