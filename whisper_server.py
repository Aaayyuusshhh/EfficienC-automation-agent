"""
Whisper STT Server
==================
Run:
    uvicorn whisper_server:app --reload --port 8000

Requirements:
    pip install faster-whisper fastapi uvicorn python-multipart

ffmpeg must be installed and on PATH for non-WAV audio (WebM, MP4, etc.).
    Windows: winget install FFmpeg
    Mac:     brew install ffmpeg
    Linux:   apt install ffmpeg
"""

import os
import logging
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("whisper_server")

# ── Device detection ──────────────────────────────────────────────────────────
# Use CUDA if available, otherwise fall back to CPU.
# faster-whisper handles the compute_type internally when device is set.

try:
    import torch
    _device = "cuda" if torch.cuda.is_available() else "cpu"
except ImportError:
    _device = "cpu"

_compute_type = "float16" if _device == "cuda" else "int8"

logger.info(f"Loading faster-whisper 'base' model  device={_device}  compute_type={_compute_type}")
_model = WhisperModel("base", device=_device, compute_type=_compute_type)
logger.info("Model ready.")

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Whisper STT")


@app.get("/health")
def health():
    """Quick liveness check — Node backend polls this to know the server is up."""
    return {"status": "ok", "device": _device, "compute_type": _compute_type}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Accept any audio file the browser can produce (WebM, MP4, OGG, WAV).
    Returns {"text": "<transcript>"} — never raises, returns empty string on silence.
    """
    original_name = file.filename or "audio.webm"
    suffix = Path(original_name).suffix or ".webm"

    tmp_path: str | None = None
    try:
        # Write the upload to a temp file so faster-whisper can read it
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        # Transcribe — returns a lazy generator; exhaust it before cleanup
        segments, info = _model.transcribe(tmp_path, beam_size=5)
        text = " ".join(seg.text for seg in segments).strip()

        logger.info(
            f"Transcribed  lang={info.language}  "
            f"duration={info.duration:.1f}s  text={text!r}"
        )
        return JSONResponse(content={"text": text})

    except Exception as exc:
        # Never crash on bad audio — just return empty text
        logger.error(f"Transcription failed: {exc}")
        return JSONResponse(content={"text": "", "error": str(exc)})

    finally:
        # Always delete the temp file, even on error
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
