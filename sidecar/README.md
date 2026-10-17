# BPA sidecar — the ML engine (D1)

Stateless HTTP service: an image in, a verdict + confidence + explanation out.
No database, no user data, no secrets. The React app calls it; nothing else does.

## Run

```bash
pip install -r requirements.txt        # pinned; versions in the prod report
uvicorn main:app --app-dir app --port 8000
```

`--app-dir app` matters: the research pipeline files (`stain_detection.py`,
`feature_extraction.py`) import each other flat, exactly as they do in the BPA3 repo.

## The queue worker (T-008, NFR1.4)

```bash
cp .env.example .env   # fill in the analyst service account, then:
python worker.py
```

The worker signs in as an analyst and polls `analysis_jobs`: claims pending jobs,
runs them through `/analyze` above, writes verdicts back to `analyses`. Stale claims
(default: untouched 5 minutes) go back to pending — kill the worker mid-job and
restart it to watch NFR1.4 happen. One line per action on stdout; that log is the
demo proof.

## Endpoints

| Method | Path | What |
|---|---|---|
| `POST` | `/analyze` | multipart `image` → verdict, confidence, per-class probabilities, per-stain geometry (for the SVG overlay), 30 measured features, explanation, `timing_ms`, model SHA-256 |
| `GET` | `/explain` | the explanation of the last analyzed image (demo aid) |
| `GET` | `/health` | `{status, model_loaded, model_version}` — the dashboard's live totem |
| `GET` | `/model-card` | provenance + the paper's cross-validated metrics, for the report |

## The rules it enforces (so the app doesn't have to)

- **Confidence below 0.60 → `"inconclusive"`** (NFR1.6/1.7). No label is ever reported
  without confidence + explanation, and low confidence is labeled inconclusive in fixed
  wording — `explanation.py` owns that template.
- **Zero stains detected → `"inconclusive"` with `reason: "no_stains_detected"`** — a
  photo with no blood is not a prediction.
- **Every response carries the model file's SHA-256** so any result traces back to the
  exact artifact.

## Files

```
app/
  main.py               HTTP layer (the only FastAPI file)
  analyzer.py           loads the model once; one image in → result dict out
  explanation.py        deterministic explanation: feature importances + measured
                        values + fixed wording (no SHAP — see ADR-002 §3)
  stain_detection.py    VERBATIM from bpa3/ code (L*a*b* + Otsu detection)
  feature_extraction.py VERBATIM from bpa3/ code (30 physics-based features)
  smoke_test.py         draws a synthetic pattern, runs the pipeline, asserts NFR1.3
models/                 joblib artifact + metadata + feature importances (copied from bpa3)
```

## Provenance

`bpa_classifier_final.joblib` is the published model: CatBoost, 618 images, 3 classes,
CV accuracy 0.9256 / F1 macro 0.8648 (COMPAS 2026 paper). The pipeline code is copied
byte-for-byte from the research checkout (`Documents/BPA_Research/BPA3/code`) - if it ever
differs, that's a bug; model training stays in the research repo, this service only
serves.
