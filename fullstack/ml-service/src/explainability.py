"""
SHAP-based explainability for the overall-failure XGBoost model.

Provides:
- Global feature importance (mean |SHAP value| across a background sample)
- Local (per-prediction) SHAP values for waterfall plots
- A plain-language summary of the top risk-increasing / risk-decreasing features
"""
from __future__ import annotations

import functools

import numpy as np
import pandas as pd
import shap

from src.config import settings
from src.prediction import _load_all_artifacts
from src.preprocessing import ALL_MODEL_FEATURES, engineer_features


@functools.lru_cache(maxsize=8)
def _get_explainer(model_key: str = "overall_failure"):
    artifacts = _load_all_artifacts()
    artifact = artifacts[model_key]
    model = artifact["model"]
    explainer = shap.TreeExplainer(model)
    return explainer, artifact["preprocessor"]


def _readable_feature_name(raw_name: str) -> str:
    """Turn a ColumnTransformer output name like 'num__Torque [Nm]' or
    'cat__Type_L' into something readable for the UI."""
    name = raw_name.split("__", 1)[-1]
    if name.startswith("Type_"):
        return f"Type = {name.split('_', 1)[1]}"
    return name


def explain_prediction(reading: dict, model_key: str = "overall_failure") -> pd.DataFrame:
    """
    Compute local SHAP values for a single reading.

    Returns a DataFrame with columns: feature, feature_value, shap_value,
    contribution_direction - sorted by absolute SHAP value (descending).
    """
    explainer, preprocessor = _get_explainer(model_key)

    df = pd.DataFrame([reading])
    engineered = engineer_features(df)[ALL_MODEL_FEATURES]
    X_t = preprocessor.transform(engineered)
    if hasattr(X_t, "toarray"):
        X_t = X_t.toarray()

    shap_values = explainer.shap_values(X_t)
    if isinstance(shap_values, list):  # some SHAP versions return a list per class
        shap_values = shap_values[-1]

    raw_names = list(preprocessor.get_feature_names_out())
    feature_names = [_readable_feature_name(n) for n in raw_names]

    # Prefer showing the original (unscaled) value for numeric features so
    # the UI displays e.g. "230" instead of a standardized z-score.
    raw_lookup = engineered.iloc[0].to_dict()
    display_values = []
    for i, raw_name in enumerate(raw_names):
        base_name = raw_name.split("__", 1)[-1]
        if raw_name.startswith("cat__"):
            # One-hot indicator: show the actual 0/1 encoded value for this record
            display_values.append(float(X_t[0][i]))
        elif base_name in raw_lookup:
            display_values.append(raw_lookup[base_name])
        else:
            display_values.append(np.nan)

    result = pd.DataFrame(
        {
            "feature": feature_names,
            "feature_value": display_values,
            "shap_value": shap_values[0],
        }
    )
    result["contribution_direction"] = np.where(
        result["shap_value"] >= 0, "increases_risk", "decreases_risk"
    )
    result["abs_shap"] = result["shap_value"].abs()
    result = result.sort_values("abs_shap", ascending=False).drop(columns="abs_shap")
    result = result.reset_index(drop=True)
    return result


def global_feature_importance(
    background_df: pd.DataFrame, model_key: str = "overall_failure", sample_size: int = 500
) -> pd.DataFrame:
    """
    Compute global SHAP feature importance (mean absolute SHAP value) over a
    sample of the provided background dataset (e.g. all stored readings).
    """
    explainer, preprocessor = _get_explainer(model_key)

    if len(background_df) > sample_size:
        sample_df = background_df.sample(sample_size, random_state=42)
    else:
        sample_df = background_df

    engineered = engineer_features(sample_df)[ALL_MODEL_FEATURES]
    X_t = preprocessor.transform(engineered)
    if hasattr(X_t, "toarray"):
        X_t = X_t.toarray()

    shap_values = explainer.shap_values(X_t)
    if isinstance(shap_values, list):
        shap_values = shap_values[-1]

    feature_names = [_readable_feature_name(n) for n in preprocessor.get_feature_names_out()]
    mean_abs = np.abs(shap_values).mean(axis=0)

    importance = pd.DataFrame({"feature": feature_names, "mean_abs_shap": mean_abs})
    importance = importance.sort_values("mean_abs_shap", ascending=False).reset_index(drop=True)
    return importance


def plain_language_summary(shap_df: pd.DataFrame, top_n: int = 3) -> str:
    """
    Build a plain-language explanation like:
    "The failure risk is high mainly because tool wear and torque are above
    patterns commonly associated with healthy records."
    """
    increasing = shap_df[shap_df["contribution_direction"] == "increases_risk"].head(top_n)
    decreasing = shap_df[shap_df["contribution_direction"] == "decreases_risk"].head(top_n)

    parts = []
    if len(increasing) > 0:
        feats = ", ".join(increasing["feature"].tolist())
        parts.append(
            f"The failure risk is influenced upward mainly because {feats} show patterns "
            f"commonly associated with failed records."
        )
    if len(decreasing) > 0:
        feats = ", ".join(decreasing["feature"].tolist())
        parts.append(
            f"Risk is being pulled down by {feats}, which are more typical of healthy records."
        )
    if not parts:
        parts.append("No strong individual feature contributions were identified for this record.")

    parts.append(
        "Note: SHAP shows how features contribute to the model's prediction; "
        "it does not prove physical causation."
    )
    return " ".join(parts)


def top_features(shap_df: pd.DataFrame, direction: str, top_n: int = 5) -> pd.DataFrame:
    return shap_df[shap_df["contribution_direction"] == direction].head(top_n).reset_index(drop=True)
