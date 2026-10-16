"""
explanation.py — Deterministic explanation of one classification (NFR1.6, NFR1.7).

The requirement is a label + a confidence value + an explanation summary. For us that
explanation is NOT a generated sentence and NOT SHAP: it is the CatBoost model's own
feature importances (`models/feature_importances.json`) combined with the values those
features actually measured on this image, under fixed template wording.

That makes the output fully deterministic: same image in, same sentence out. In a viva
we can say every number in the sentence was measured on the input, and the ranking is
the model's own global importance order.
"""

# Plain-English meaning of every top feature. Only used for wording; the model is
# untouched. Keep the phrasing a supervisor would accept after one reading.
PLAIN_FEATURE_NAMES = {
    "convergence_dispersion": "how tightly the stains' flight lines cross at one shared origin",
    "convergence_x": "the x position where the flight lines converge",
    "convergence_y": "the y position where the flight lines converge",
    "convex_hull_area_mm2": "the total area the stain cloud spans",
    "nn_dist_std_mm": "how uneven the gaps between neighbouring stains are",
    "nn_dist_mean_mm": "the average gap between neighbouring stains",
    "solidity_mean": "how solid each stain's shape is (gaps, spines, tails)",
    "spatial_spread_y_std": "how far the stains scatter vertically",
    "spatial_spread_x_std": "how far the stains scatter horizontally",
    "circularity_max": "how round the roundest stain is",
    "circular_variance": "whether the stains lean in one common direction",
    "mean_orientation_deg": "the average angle the stains point toward",
    "stain_count": "how many separate stains were detected",
    "stain_density_per_cm2": "how densely packed the stains are",
    "area_mm2_mean": "the average stain size",
    "total_stained_area_mm2": "the total blood-covered area",
    "axis_ratio_mean": "how elongated the stains are on average",
    "eccentricity_max": "how stretched the most stretched stain is",
    "has_convergence": "whether a common origin point could be measured at all",
    "spatial_spread_total": "the overall spread of the stain cloud",
}

# Number of influential features reported per classification.
TOP_FEATURES = 5


def format_feature_value(value: float) -> str:
    """Round a measurement for display. Keeps small numbers readable in a sentence."""
    if value is None:
        return "not measurable"
    magnitude = abs(value)
    if magnitude == 0:
        return "0"
    if magnitude >= 100:
        return f"{value:.0f}"
    if magnitude >= 1:
        return f"{value:.1f}"
    return f"{value:.3f}"


def build_explanation(
    features: dict,
    feature_importances: list,
    verdict: str,
    confidence: float,
    is_inconclusive: bool,
) -> dict:
    """
    Compose the explanation payload for one analysis result.

    Returns a dict with a top-features list (name, plain-English meaning, importance,
    measured value) and a fixed-template summary sentence. The template is fixed so the
    wording never varies for the same numbers — that is what NFR1.7 asks for.
    """
    measured_values = {name: features.get(name) for name in dict(PLAIN_FEATURE_NAMES)}

    top = []
    for entry in feature_importances[:TOP_FEATURES]:
        name = entry["feature"]
        top.append({
            "feature": name,
            "plain_name": PLAIN_FEATURE_NAMES.get(name, name),
            "importance": round(float(entry["importance"]), 3),
            "measured_value": measured_values.get(name),
        })

    parts = [
        f"{item['plain_name']} = {format_feature_value(item['measured_value'])}"
        for item in top
        if item["measured_value"] is not None
    ]
    listed = "; ".join(parts)

    if is_inconclusive:
        summary = (
            f"Inconclusive (confidence {confidence:.2f}, below the reporting threshold). "
            f"No classification label is reported. Measurements that still influenced the "
            f"attempt: {listed}."
        )
    else:
        summary = (
            f"Classified {verdict} (confidence {confidence:.2f}). "
            f"The features that most influenced this classification: {listed}."
        )

    return {"top_features": top, "summary": summary}
