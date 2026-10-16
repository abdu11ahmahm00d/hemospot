"""
analyzer.py — Load the BPA model once, analyze one image (FR1.5, FR1.6, NFR1.3, NFR1.6).

Pipeline: `stain_detection.py` (copied verbatim from the BPA3 research repo) detects
stains with L*a*b* + Otsu thresholding; `feature_extraction.py` (also verbatim) turns
those stains into the 30 physics-based features; the CatBoost model — a scikit-learn
Pipeline of StandardScaler + CatBoostClassifier saved as `bpa_classifier_final.joblib` —
predicts class probabilities.

This file is our integration layer: it detects once, builds the feature vector in the
exact order the model was trained on, converts the results to plain JSON types, applies
the confidence rule, and times the run.
"""

import hashlib
import json
import math
import tempfile
import time
from pathlib import Path

import joblib
import numpy as np

from explanation import build_explanation
from feature_extraction import extract_features
from stain_detection import detect_stains

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

# Detection resolution assumed for mm² conversion; the research default.
DPI = 600.0

# Confidence below this value is reported as "inconclusive" (NFR1.6/NFR1.7): a result is
# never presented as definitive without confidence + explanation. Chosen at the point
# where the cross-validated impact class becomes unreliable (per-class F1 0.735).
CONFIDENCE_THRESHOLD = 0.60


def load_model_bundle() -> dict:
    """
    Load the model artifact and its sidecars once at startup.

    The SHA-256 of the model file is computed here, so every analysis response carries
    it: any result can be traced back to the exact artifact that produced it.
    """
    model_path = MODELS_DIR / "bpa_classifier_final.joblib"
    with open(model_path, "rb") as handle:
        model_bytes = handle.read()

    with open(MODELS_DIR / "model_metadata.json", encoding="utf-8") as handle:
        metadata = json.load(handle)
    with open(MODELS_DIR / "feature_importances.json", encoding="utf-8") as handle:
        feature_importances = json.load(handle)

    return {
        "model": joblib.load(model_path),
        "classes": metadata["classes"],
        "feature_order": metadata["features"],
        "metadata": metadata,
        "feature_importances": feature_importances,
        "model_sha256": hashlib.sha256(model_bytes).hexdigest(),
        "model_version": "bpa-catboost-v1",
    }


def to_json_value(value):
    """numpy scalars, NaN and Inf become plain JSON-safe Python values."""
    if isinstance(value, (np.floating, float)):
        as_float = float(value)
        if math.isnan(as_float) or math.isinf(as_float):
            return None
        return as_float
    if isinstance(value, (np.integer,)):
        return int(value)
    return value


def per_stain_geometry(stains) -> list:
    """
    Per-stain measurements for the SVG overlay on the evidence photo (FR1.5).
    Only the values the UI draws: position, ellipse axes, angle, size.
    """
    return [
        {
            "centroid_x": to_json_value(stain.centroid_x),
            "centroid_y": to_json_value(stain.centroid_y),
            "major_axis": to_json_value(stain.major_axis),
            "minor_axis": to_json_value(stain.minor_axis),
            "orientation_deg": to_json_value(stain.orientation_deg),
            "area_mm2": to_json_value(stain.area_mm2),
        }
        for stain in stains
    ]


def build_feature_vector(features: dict, feature_order: list) -> np.ndarray:
    """
    Arrange one image's measurements into the exact column order the model was trained
    on. A missing feature is a hard error — silently substituting zero would make the
    prediction wrong in a way no test would catch.
    """
    missing = [name for name in feature_order if name not in features]
    if missing:
        raise KeyError(f"pipeline did not produce required features: {missing}")
    return np.array([[features[name] for name in feature_order]], dtype=float)


def inconclusive_result(reason: str, summary: str, bundle: dict, elapsed_ms: float) -> dict:
    """The honest failure shape: no label, no confidence, a plain reason."""
    return {
        "verdict": "inconclusive",
        "reason": reason,
        "confidence": 0.0,
        "probabilities": {},
        "stain_count": 0,
        "features": {},
        "stains": [],
        "explanation": {"top_features": [], "summary": summary},
        "timing_ms": elapsed_ms,
        "model_sha256": bundle["model_sha256"],
        "model_version": bundle["model_version"],
    }


def analyze_image(image_bytes: bytes, bundle: dict) -> dict:
    """
    Run one image through the full pipeline and return the analysis result.

    Always returns a JSON-serializable dict: verdict (class label or "inconclusive"),
    confidence, per-class probabilities, per-stain geometry, the 30 measured features,
    the explanation payload, timing in ms, and the model's SHA-256 + version.
    """
    started = time.perf_counter()

    # detect_stains reads from disk, so the uploaded bytes land in a temp file.
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
        temp_file.write(image_bytes)
        temp_path = temp_file.name

    try:
        stains, metadata = detect_stains(temp_path, dpi=DPI)
        if len(stains) == 0:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
            return inconclusive_result(
                reason="no_stains_detected",
                summary="Inconclusive: no bloodstains could be detected in this image.",
                bundle=bundle,
                elapsed_ms=elapsed_ms,
            )
        features = extract_features(stains, metadata)
    finally:
        Path(temp_path).unlink(missing_ok=True)

    vector = build_feature_vector(features, bundle["feature_order"])
    probabilities = bundle["model"].predict_proba(vector)[0]

    class_probabilities = {
        class_name: round(float(probability), 4)
        for class_name, probability in zip(bundle["classes"], probabilities)
    }
    best_index = int(np.argmax(probabilities))
    confidence = float(probabilities[best_index])
    raw_verdict = bundle["classes"][best_index]
    is_inconclusive = confidence < CONFIDENCE_THRESHOLD
    verdict = "inconclusive" if is_inconclusive else raw_verdict

    explanation = build_explanation(
        features=features,
        feature_importances=bundle["feature_importances"],
        verdict=raw_verdict,
        confidence=confidence,
        is_inconclusive=is_inconclusive,
    )

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

    return {
        "verdict": verdict,
        "confidence": round(confidence, 4),
        "probabilities": class_probabilities,
        "stain_count": len(stains),
        "features": {key: to_json_value(value) for key, value in features.items()},
        "stains": per_stain_geometry(stains),
        "explanation": explanation,
        "timing_ms": elapsed_ms,
        "model_sha256": bundle["model_sha256"],
        "model_version": bundle["model_version"],
    }
