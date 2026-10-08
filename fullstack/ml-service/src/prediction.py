"""
Loads trained model artifacts and runs inference: overall failure
probability + per-failure-mode probabilities for one or many machine
readings.
"""
from __future__ import annotations

import functools
import json
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd

from src.config import settings
from src.preprocessing import ALL_MODEL_FEATURES, engineer_features

MODEL_KEYS = ["overall_failure", "TWF", "HDF", "PWF", "OSF", "RNF"]


@dataclass
class PredictionResult:
    failure_probability: float
    status: str
    model_version: str
    failure_mode_probabilities: dict = field(default_factory=dict)


@functools.lru_cache(maxsize=1)
def _load_all_artifacts() -> dict:
    """Load all model artifacts from disk once and cache them in memory."""
    artifacts = {}
    for key in MODEL_KEYS:
        path = settings.MODELS_DIR / f"model_{key}.pkl"
        if not path.exists():
            raise FileNotFoundError(
                f"Model artifact '{path}' not found. Train the models first:\n"
                f"    cd ml-service && python -m src.train_models\n"
                f"(takes ~5-10 seconds; writes the model files into models/)"
            )
        artifacts[key] = joblib.load(path)
    return artifacts


def clear_model_cache() -> None:
    """Force artifacts to be reloaded (e.g. after retraining)."""
    _load_all_artifacts.cache_clear()


def get_model_version() -> str:
    artifacts = _load_all_artifacts()
    return artifacts["overall_failure"].get("model_version", settings.MODEL_VERSION)


def _predict_single_model(artifact: dict, X_engineered: pd.DataFrame) -> np.ndarray:
    preprocessor = artifact["preprocessor"]
    model = artifact["model"]
    X_t = preprocessor.transform(X_engineered[ALL_MODEL_FEATURES])
    return model.predict_proba(X_t)[:, 1]


def predict_batch(readings_df: pd.DataFrame) -> pd.DataFrame:
    """
    Run overall-failure and all failure-mode models on a batch of raw
    readings. `readings_df` must contain the raw feature columns (Type,
    temperatures, speed, torque, tool wear).

    Returns a DataFrame with one row per input reading and columns:
    failure_probability, status, model_version, prob_TWF, prob_HDF, ...
    """
    artifacts = _load_all_artifacts()
    engineered = engineer_features(readings_df)

    out = pd.DataFrame(index=readings_df.index)
    out["failure_probability"] = _predict_single_model(artifacts["overall_failure"], engineered)
    out["status"] = out["failure_probability"].apply(settings.risk_label)
    out["model_version"] = get_model_version()

    for mode in settings.FAILURE_MODES:
        out[f"prob_{mode}"] = _predict_single_model(artifacts[mode], engineered)

    return out


def predict_single(reading: dict) -> PredictionResult:
    """Convenience wrapper for predicting a single reading given as a dict."""
    df = pd.DataFrame([reading])
    result_df = predict_batch(df)
    row = result_df.iloc[0]
    failure_modes = {mode: float(row[f"prob_{mode}"]) for mode in settings.FAILURE_MODES}
    return PredictionResult(
        failure_probability=float(row["failure_probability"]),
        status=row["status"],
        model_version=row["model_version"],
        failure_mode_probabilities=failure_modes,
    )


def get_training_metrics() -> dict:
    metrics_path = settings.MODELS_DIR / "training_metrics.json"
    if not metrics_path.exists():
        return {}
    with open(metrics_path) as f:
        return json.load(f)
