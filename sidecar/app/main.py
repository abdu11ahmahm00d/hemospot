"""
main.py — FastAPI sidecar: the HTTP seam between the Hemospot React app and the BPA pipeline.

Endpoints:
  POST /analyze     multipart image -> { verdict, confidence, probabilities, per-stain
                    features, explanation, timing_ms, model sha256 }   (FR1.5, FR1.6)
  GET  /explain     the explanation of the last analyzed image            (FR1.6 demo aid)
  GET  /health      liveness — reports whether the model loaded
  GET  /model-card  provenance + cross-validated metrics for the report

The sidecar holds NO user data and NO database. Every protected resource stays in the
platform (Supabase); this service only turns an image into a JSON verdict. That is what
lets the platform run when the sidecar is down — the app shows "analysis pending".
"""

import io

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image  # validates uploads are real images before the pipeline spends time

from analyzer import analyze_image, load_model_bundle

app = FastAPI(title="Hemospot BPA sidecar", version="1.0")

# The Vite dev server and any hosted origin may call the sidecar. No credentials are
# involved — the sidecar has nothing to authorize.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

bundle = load_model_bundle()
last_explanation: dict = {"top_features": [], "summary": "No image analyzed yet."}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": True, "model_version": bundle["model_version"]}


@app.get("/model-card")
def model_card() -> dict:
    metadata = bundle["metadata"]
    return {
        "model_version": bundle["model_version"],
        "model_sha256": bundle["model_sha256"],
        "model_type": metadata["model_type"],
        "features": metadata["features"],
        "classes": metadata["classes"],
        "train_samples": metadata["train_samples"],
        "cv_results": metadata["cv_results"],
        "dataset_composition": metadata["dataset_composition"],
    }


@app.post("/analyze")
async def analyze(image: UploadFile = File(...)) -> dict:
    global last_explanation
    image_bytes = await image.read()

    # Reject anything PIL cannot decode as an image, with a clear 400 instead of a
    # confusing pipeline error deeper down.
    try:
        Image.open(io.BytesIO(image_bytes)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="not a decodable image")

    try:
        result = analyze_image(image_bytes, bundle)
    except KeyError as error:
        raise HTTPException(status_code=500, detail=f"model/pipeline mismatch: {error}")
    last_explanation = result["explanation"]
    return result


@app.get("/explain")
def explain() -> dict:
    return last_explanation
