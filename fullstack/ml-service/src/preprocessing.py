"""
Feature engineering and preprocessing pipeline shared by training and
inference. Ensures the exact same transformations are applied everywhere.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

RAW_NUMERIC_FEATURES = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]
ENGINEERED_FEATURES = ["Temperature difference [K]", "Power [W]"]
NUMERIC_FEATURES = RAW_NUMERIC_FEATURES + ENGINEERED_FEATURES
CATEGORICAL_FEATURES = ["Type"]
ALL_MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add Temperature difference and Power features. Returns a new DataFrame."""
    out = df.copy()
    out["Temperature difference [K]"] = (
        out["Process temperature [K]"] - out["Air temperature [K]"]
    )
    out["Power [W]"] = out["Torque [Nm]"] * out["Rotational speed [rpm]"] * (2 * math.pi / 60)
    return out


def build_preprocessing_pipeline() -> ColumnTransformer:
    """
    Build (but do not fit) the ColumnTransformer that scales numeric features
    and one-hot encodes the categorical `Type` column.

    UDI and Product ID are intentionally excluded - they are identifiers, not
    model features, per project requirements.
    """
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore", drop=None), CATEGORICAL_FEATURES),
        ],
        remainder="drop",
    )


def get_feature_names(preprocessor: ColumnTransformer) -> list[str]:
    """Return the expanded feature names after the ColumnTransformer is fit."""
    return list(preprocessor.get_feature_names_out())


def prepare_model_input(df: pd.DataFrame) -> pd.DataFrame:
    """
    Take a raw reading DataFrame (must contain RAW_NUMERIC_FEATURES + Type),
    engineer features, and return only the columns the model pipeline expects,
    in a stable order.
    """
    engineered = engineer_features(df)
    return engineered[ALL_MODEL_FEATURES].copy()
