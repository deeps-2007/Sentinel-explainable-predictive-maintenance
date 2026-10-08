"""
Trains the overall-failure model and the five per-failure-mode models
(TWF, HDF, PWF, OSF, RNF) on the AI4I 2020 (or AI4I-style simulated) dataset.

For every target, both a Logistic Regression baseline and an XGBoost main
model are trained; the XGBoost model is what is saved and served, but both
sets of metrics are printed/saved for comparison.

Usage:
    python src/train_models.py
    python src/train_models.py --data data/ai4i2020.csv
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from src.config import settings
from src.preprocessing import (
    ALL_MODEL_FEATURES,
    build_preprocessing_pipeline,
    engineer_features,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

TARGETS = ["Machine failure", "TWF", "HDF", "PWF", "OSF", "RNF"]


def load_dataset(path: str | Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = [c for c in ALL_MODEL_FEATURES if c not in df.columns and c != "Type"]
    if "Type" not in df.columns:
        raise ValueError("Dataset is missing required column: 'Type'")
    for target in TARGETS:
        if target not in df.columns:
            raise ValueError(f"Dataset is missing required target column: '{target}'")
    return df


def evaluate(y_true, y_pred, y_proba) -> dict:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_proba)) if len(set(y_true)) > 1 else None,
        "pr_auc": float(average_precision_score(y_true, y_proba)) if len(set(y_true)) > 1 else None,
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "classification_report": classification_report(y_true, y_pred, zero_division=0, output_dict=True),
    }


def train_one_target(df: pd.DataFrame, target: str, preprocessor, X_engineered: pd.DataFrame):
    y = df[target].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X_engineered, y, test_size=0.2, random_state=42, stratify=y
    )

    # Fit a fresh copy of the preprocessing pipeline on the training split only
    from sklearn.base import clone

    pre = clone(preprocessor)
    X_train_t = pre.fit_transform(X_train)
    X_test_t = pre.transform(X_test)

    results = {}

    # --- Baseline: Logistic Regression -----------------------------------
    log_reg = LogisticRegression(max_iter=1000, class_weight="balanced")
    log_reg.fit(X_train_t, y_train)
    lr_proba = log_reg.predict_proba(X_test_t)[:, 1]
    lr_pred = (lr_proba >= 0.5).astype(int)
    results["logistic_regression"] = evaluate(y_test, lr_pred, lr_proba)

    # --- Main model: XGBoost -----------------------------------------------
    n_pos = int(y_train.sum())
    n_neg = int(len(y_train) - n_pos)
    scale_pos_weight = (n_neg / n_pos) if n_pos > 0 else 1.0

    xgb = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1,
    )
    xgb.fit(X_train_t, y_train)
    xgb_proba = xgb.predict_proba(X_test_t)[:, 1]
    xgb_pred = (xgb_proba >= 0.5).astype(int)
    results["xgboost"] = evaluate(y_test, xgb_pred, xgb_proba)

    logger.info(
        "[%s] XGBoost - ROC-AUC=%.3f  PR-AUC=%.3f  F1=%.3f  (positives in test=%d/%d)",
        target,
        results["xgboost"]["roc_auc"] or -1,
        results["xgboost"]["pr_auc"] or -1,
        results["xgboost"]["f1_score"],
        int(y_test.sum()),
        len(y_test),
    )

    artifact = {
        "preprocessor": pre,
        "model": xgb,
        "baseline_model": log_reg,
        "target": target,
        "feature_columns": ALL_MODEL_FEATURES,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_version": settings.MODEL_VERSION,
        "scale_pos_weight": scale_pos_weight,
    }
    return artifact, results


def main(data_path: str) -> None:
    settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    df = load_dataset(data_path)
    logger.info("Loaded dataset with %d rows from %s", len(df), data_path)

    df_engineered = engineer_features(df)
    X_engineered = df_engineered[ALL_MODEL_FEATURES]
    preprocessor = build_preprocessing_pipeline()

    all_metrics = {}
    for target in TARGETS:
        logger.info("Training models for target: %s", target)
        artifact, metrics = train_one_target(df, target, preprocessor, X_engineered)
        model_key = "overall_failure" if target == "Machine failure" else target
        joblib.dump(artifact, settings.MODELS_DIR / f"model_{model_key}.pkl")
        all_metrics[model_key] = metrics

    metrics_path = settings.MODELS_DIR / "training_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(
            {
                "model_version": settings.MODEL_VERSION,
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "data_path": str(data_path),
                "n_rows": len(df),
                "metrics": all_metrics,
            },
            f,
            indent=2,
        )
    logger.info("Saved all models to %s", settings.MODELS_DIR)
    logger.info("Saved training metrics to %s", metrics_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train predictive maintenance models")
    parser.add_argument(
        "--data", default=str(settings.DATA_DIR / "ai4i2020.csv"), help="Path to training CSV"
    )
    args = parser.parse_args()
    main(args.data)
