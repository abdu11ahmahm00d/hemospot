"""
smoke_test.py — prove the sidecar works end to end on one image (FR1.5, FR1.6).

Draws a synthetic bloodstain pattern (dark red blobs along impact-style trajectories),
runs it through the full pipeline, and prints the verdict, confidence, explanation and
timing. This is a wiring test, not an accuracy test: the corpus images are the accuracy
material. Run from the `sidecar/` directory:

    python app/smoke_test.py
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyzer import analyze_image, load_model_bundle  # noqa: E402


def draw_synthetic_pattern(path: Path) -> None:
    """
    A light background with red blobs whose long axes converge on one point — shaped
    like a textbook impact pattern so the convergence features have a real signal.
    """
    image = np.full((900, 1200, 3), 220, dtype=np.uint8)
    center = (600, 450)
    rng = np.random.default_rng(42)

    for angle in np.linspace(0, 360, 60, endpoint=False):
        spread = rng.uniform(0.75, 1.25)
        radius = 260 * spread
        x = int(center[0] + radius * np.cos(np.radians(angle)))
        y = int(center[1] + radius * np.sin(np.radians(angle)))
        major = 26
        minor = 8 + rng.uniform(0, 6)
        ellipse = cv2.ellipse(
            np.zeros_like(image),
            ((x, y), (int(major), int(minor)), int(angle) + 90),
            255,
            -1,
        )
        mask = ellipse[:, :, 0] > 0
        image[mask] = (34, 28, 130)  # dark red, BGR

    cv2.imwrite(str(path), image)


def main() -> None:
    bundle = load_model_bundle()
    print(f"model loaded — sha256 {bundle['model_sha256'][:16]}…, classes {bundle['classes']}")

    image_path = Path(__file__).resolve().parent / "smoke_pattern.png"
    draw_synthetic_pattern(image_path)
    print(f"synthetic pattern written to {image_path}")

    result = analyze_image(image_path.read_bytes(), bundle)

    print("\n=== RESULT ===")
    print(f"verdict        : {result['verdict']}")
    print(f"confidence     : {result['confidence']}")
    print(f"probabilities  : {result['probabilities']}")
    print(f"stain_count    : {result['stain_count']}")
    print(f"timing_ms      : {result['timing_ms']}  (NFR1.3 budget: 5000)")
    print(f"model_version  : {result['model_version']}")
    print("\nexplanation summary:")
    print(" ", result["explanation"]["summary"])

    assert result["timing_ms"] < 5000, "NFR1.3 violated: analysis took longer than 5 s"
    assert result["stain_count"] > 0, "no stains detected on a pattern image — pipeline broken"
    print("\nSMOKE TEST PASSED")


if __name__ == "__main__":
    main()
