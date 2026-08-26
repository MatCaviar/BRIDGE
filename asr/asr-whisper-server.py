"""
Local faster-whisper ASR server for the BRIDGE cockpit.
POST /asr  (body = raw 16k-mono 16-bit PCM WAV) -> {"text": "...", "error": ""}
No API key; the first run downloads the model, then reuses the local HF_HOME cache.
Run from the repository root: python asr/asr-whisper-server.py
"""
import os
import time
from pathlib import Path

def default_cache_root() -> Path:
    if os.environ.get("BRIDGE_CACHE_DIR"):
        return Path(os.environ["BRIDGE_CACHE_DIR"]).expanduser()
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "BRIDGE" / "cache"
    if os.uname().sysname == "Darwin":
        return Path.home() / "Library" / "Caches" / "BRIDGE"
    return Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "bridge"


# Keep model data outside versioned plugin directories; HF_HOME remains the standard override.
os.environ.setdefault("HF_HOME", str(default_cache_root() / "huggingface"))
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", os.environ["HF_HOME"])
# Optional regional mirror; otherwise preserve Hugging Face's standard endpoint.
if os.environ.get("BRIDGE_HF_ENDPOINT"):
    os.environ.setdefault("HF_ENDPOINT", os.environ["BRIDGE_HF_ENDPOINT"])
# Plain HTTPS is more predictable across restricted networks; callers can override it.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn
from faster_whisper import WhisperModel

MODEL = os.environ.get("ASR_MODEL", "small")
print(f"[asr] loading faster-whisper model='{MODEL}' device=cpu compute_type=int8 ...", flush=True)
_t0 = time.time()
model = WhisperModel(MODEL, device="cpu", compute_type="int8")
print(f"[asr] model loaded in {time.time()-_t0:.1f}s — ready", flush=True)

app = FastAPI()


def wav_to_f32(data: bytes) -> np.ndarray:
    """Minimal PCM/16 WAV parser -> float32 [-1,1] mono. No ffmpeg needed."""
    if len(data) < 44 or data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("not a WAV/RIFF")
    pos, nch, bits = 12, 1, 16
    start, length = None, 0
    while pos + 8 <= len(data):
        cid = data[pos:pos + 4]
        clen = int.from_bytes(data[pos + 4:pos + 8], "little")
        body = pos + 8
        if cid == b"fmt ":
            nch = int.from_bytes(data[body + 2:body + 4], "little")
            bits = int.from_bytes(data[body + 14:body + 16], "little")
        elif cid == b"data":
            start, length = body, clen
            break
        pos = body + clen + (clen & 1)
    if start is None:
        raise ValueError("no data chunk")
    if bits != 16:
        raise ValueError(f"unsupported sample format bits={bits}")
    raw = data[start:start + length]
    arr = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if nch > 1:
        arr = arr.reshape(-1, nch).mean(axis=1)
    return arr.astype(np.float32)


@app.post("/asr")
async def asr(req: Request):
    body = await req.body()
    if not body or len(body) < 100:
        return JSONResponse({"text": "", "error": "empty audio"}, status_code=400)
    try:
        audio = wav_to_f32(body)
    except Exception as e:
        return JSONResponse({"text": "", "error": f"wav parse: {e}"}, status_code=400)
    if audio.size < 1600:  # < ~0.1s @16k -> too short to transcribe
        return {"text": "", "error": ""}
    rms = float(np.sqrt(np.mean(audio * audio)))
    if rms < 0.01:  # 近静音 -> 跳过 (Whisper 会对纯静音幻觉吐字, 避免把垃圾当命令发给 LLM)
        return {"text": "", "error": ""}
    try:
        segments, _info = model.transcribe(
            audio, language="zh", beam_size=5,
            # 领域词表 + "以下是普通话的句子" 强制简体中文, 大幅提升 small 模型中文领域识别
            initial_prompt="以下是普通话的句子。车机、音量、音效、音场、切歌、上一首、下一首、播放、暂停、导航、麦克风。",
        )
        text = "".join(s.text for s in segments).strip()
        return {"text": text, "error": ""}
    except Exception as e:
        return JSONResponse({"text": "", "error": f"asr: {e}"}, status_code=500)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.environ.get("ASR_PORT", "8765"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
