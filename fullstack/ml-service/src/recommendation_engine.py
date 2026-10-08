"""
Rule-based maintenance recommendation engine.

Combines the overall failure probability, per-failure-mode probabilities,
SHAP contributions, and risk level to produce ranked, explainable
maintenance recommendations. This module never triggers any real action -
it only produces suggested actions for a human engineer to review and
approve (see src/database.py MaintenanceTask, which always requires
human approval before creation).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

import pandas as pd

from src.config import settings

# Failure mode -> candidate recommended actions
ACTIONS = {
    "TWF": [
        "Inspect and replace the cutting tool.",
        "Check tool calibration against specification.",
    ],
    "HDF": [
        "Inspect the cooling system for blockages or reduced flow.",
        "Check airflow around the machine.",
        "Verify temperature sensor accuracy.",
    ],
    "PWF": [
        "Inspect motor load and drive system.",
        "Inspect the power supply system for irregularities.",
        "Check torque sensor calibration.",
        "Review current speed settings against the recommended operating envelope.",
    ],
    "OSF": [
        "Inspect the tool for excessive wear contributing to overstrain.",
        "Inspect the workpiece / material being processed.",
        "Review current operating load against tool-wear level.",
    ],
    "RNF": [
        "Check sensor quality and calibration (no clear failure-mode pattern found).",
        "Perform a manual visual inspection of the machine.",
    ],
}

FAILURE_MODE_LABELS = {
    "TWF": "Tool Wear Failure",
    "HDF": "Heat Dissipation Failure",
    "PWF": "Power Failure",
    "OSF": "Overstrain Failure",
    "RNF": "Random Failure",
}

# SHAP feature name substrings relevant to each failure mode, used to decide
# whether SHAP evidence supports that specific failure mode.
RELEVANT_FEATURES = {
    "TWF": ["Tool wear"],
    "HDF": ["Temperature difference", "Air temperature", "Process temperature", "Rotational speed"],
    "PWF": ["Power", "Torque", "Rotational speed"],
    "OSF": ["Torque", "Tool wear"],
    "RNF": [],  # no specific feature signature expected
}

MODE_PROBABILITY_HIGH = 0.5
MODE_PROBABILITY_MEDIUM = 0.25


@dataclass
class Recommendation:
    failure_mode: str
    failure_mode_label: str
    probability: float
    confidence: str  # Low / Medium / High
    supporting_features: list[str]
    recommended_actions: list[str]
    urgency: str  # Low / Medium / High / Critical
    rank_score: float = 0.0


def _confidence_from_shap(failure_mode: str, shap_df: pd.DataFrame | None) -> tuple[str, list[str]]:
    """Determine confidence level and supporting features based on SHAP evidence."""
    if shap_df is None or shap_df.empty:
        return "Low", []

    relevant_substrings = RELEVANT_FEATURES.get(failure_mode, [])
    if not relevant_substrings:
        return "Low", []

    increasing = shap_df[shap_df["contribution_direction"] == "increases_risk"]
    matches = increasing[
        increasing["feature"].apply(lambda f: any(sub in f for sub in relevant_substrings))
    ]

    if len(matches) == 0:
        return "Low", []
    supporting = matches["feature"].tolist()
    if len(matches) >= 2:
        return "High", supporting
    return "Medium", supporting


def _urgency(overall_risk_label: str, mode_probability: float) -> str:
    if overall_risk_label == "Critical" and mode_probability >= MODE_PROBABILITY_HIGH:
        return "Critical"
    if overall_risk_label == "Critical" or mode_probability >= MODE_PROBABILITY_HIGH:
        return "High"
    if overall_risk_label == "Warning" or mode_probability >= MODE_PROBABILITY_MEDIUM:
        return "Medium"
    return "Low"


_URGENCY_WEIGHT = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
_CONFIDENCE_WEIGHT = {"High": 3, "Medium": 2, "Low": 1}


def generate_recommendations(
    overall_probability: float,
    failure_mode_probabilities: dict,
    shap_df: pd.DataFrame | None = None,
    mode_threshold: float = 0.15,
) -> list[Recommendation]:
    """
    Build a ranked list of recommendations for every failure mode whose
    probability exceeds `mode_threshold`. If none exceed the threshold but
    the overall risk is not Healthy, an RNF ("no clear failure mode found")
    recommendation is produced instead.
    """
    overall_label = settings.risk_label(overall_probability)
    recommendations: list[Recommendation] = []

    triggered_modes = {
        mode: prob for mode, prob in failure_mode_probabilities.items() if prob >= mode_threshold
    }

    if not triggered_modes and overall_label != "Healthy":
        triggered_modes = {"RNF": failure_mode_probabilities.get("RNF", 0.0)}

    for mode, prob in triggered_modes.items():
        confidence, supporting = _confidence_from_shap(mode, shap_df)
        urgency = _urgency(overall_label, prob)
        rec = Recommendation(
            failure_mode=mode,
            failure_mode_label=FAILURE_MODE_LABELS.get(mode, mode),
            probability=float(prob),
            confidence=confidence,
            supporting_features=supporting,
            recommended_actions=ACTIONS.get(mode, ["Perform manual inspection."]),
            urgency=urgency,
        )
        rec.rank_score = (
            overall_probability * 10
            + prob * 5
            + _CONFIDENCE_WEIGHT.get(confidence, 1)
            + _URGENCY_WEIGHT.get(urgency, 1)
        )
        recommendations.append(rec)

    recommendations.sort(key=lambda r: r.rank_score, reverse=True)
    return recommendations


def recommendation_to_db_dict(rec: Recommendation) -> dict:
    """Convert a Recommendation dataclass into a dict matching the DB schema."""
    return {
        "failure_mode": rec.failure_mode,
        "recommendation_text": " | ".join(rec.recommended_actions),
        "urgency": rec.urgency,
        "confidence": {"Low": 0.33, "Medium": 0.66, "High": 1.0}[rec.confidence],
        "supporting_features": json.dumps(rec.supporting_features),
        "recommendation_status": "Pending",
    }
