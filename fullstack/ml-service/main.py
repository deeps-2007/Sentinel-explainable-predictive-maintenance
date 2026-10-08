"""
Explainable Predictive Maintenance - ML microservice.

A thin FastAPI wrapper around the existing, framework-agnostic prediction /
SHAP / recommendation / what-if / validation logic (unchanged from the
original project). The Node.js backend is the only intended caller - it
owns MySQL and all business/CRUD logic, and delegates every ML computation
here so the trained XGBoost + SHAP models (Python-only libraries) can still
be used from a Node stack.

Robustness notes
----------------
Every response is passed through ``sanitize_json`` so NaN/Infinity (valid
Python floats, invalid JSON) and NumPy scalars can never crash serialization.
Every reading is passed through ``coerce_reading`` so string-typed numbers,
nulls, missing columns, and lowercase ``Type`` values produce a clear HTTP 400
instead of an opaque 500. Unhandled exceptions return their actual message
rather than a bare "Internal Server Error", so failures are diagnosable from
the backend logs.

Run with:
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""
from __future__ import annotations

import logging
import traceback
from typing import Any, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.explainability import explain_prediction, global_feature_importance, plain_language_summary
from src.io_utils import coerce_reading, coerce_readings, sanitize_json
from src.prediction import get_model_version, get_training_metrics, predict_batch
from src.recommendation_engine import generate_recommendations, recommendation_to_db_dict
from src.validation import validate_csv
from src.what_if import SIMULATABLE_FIELDS, compare_scenario, find_lower_risk_scenario

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Predictive Maintenance ML Service", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # the Node backend is the only caller; tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Return the real error message instead of a bare 500 "Internal Server Error".
    Without this, every failure looked identical from the Node backend and was
    impossible to diagnose without reading the Python logs.
    """
    logger.error("Unhandled error on %s: %s\n%s", request.url.path, exc, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}", "path": str(request.url.path)},
    )


def ok(payload: dict) -> JSONResponse:
    """Serialize a response body, stripping NaN/Inf and NumPy scalars."""
    return JSONResponse(content=sanitize_json(payload))


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class ValidateRequest(BaseModel):
    rows: list[dict[str, Any]]


class PredictBatchRequest(BaseModel):
    readings: list[dict[str, Any]]


class ExplainRequest(BaseModel):
    reading: dict[str, Any]


class ExplainBatchRequest(BaseModel):
    readings: list[dict[str, Any]]


class GlobalImportanceRequest(BaseModel):
    readings: list[dict[str, Any]]
    sample_size: int = 500


class RecommendationsRequest(BaseModel):
    overall_probability: float
    failure_mode_probabilities: dict[str, float]
    shap_rows: Optional[list[dict[str, Any]]] = None
    mode_threshold: float = 0.15


class RecommendationsBatchItem(BaseModel):
    overall_probability: float
    failure_mode_probabilities: dict[str, float]
    shap_rows: Optional[list[dict[str, Any]]] = None


class RecommendationsBatchRequest(BaseModel):
    items: list[RecommendationsBatchItem]
    mode_threshold: float = 0.15


class WhatIfCompareRequest(BaseModel):
    original_reading: dict[str, Any]
    overrides: dict[str, Any]


class WhatIfSearchRequest(BaseModel):
    original_reading: dict[str, Any]
    target_probability: float
    fields: Optional[list[str]] = None


# ---------------------------------------------------------------------------
# Health / model info
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/model-version")
def model_version():
    try:
        return ok({"model_version": get_model_version()})
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/training-metrics")
def training_metrics():
    return ok(get_training_metrics())


# ---------------------------------------------------------------------------
# Validation (single source of truth for CSV validation rules)
# ---------------------------------------------------------------------------
@app.post("/validate")
def validate(req: ValidateRequest):
    df = pd.DataFrame(req.rows)
    result = validate_csv(df)

    def records(frame):
        if frame is None:
            return []
        # where(notna) turns NaN into None so the payload stays JSON-valid
        return frame.astype(object).where(pd.notna(frame), None).to_dict(orient="records")

    return ok(
        {
            "total_rows": result.total_rows,
            "valid_rows": result.valid_rows,
            "duplicate_rows": result.duplicate_rows,
            "invalid_rows": result.invalid_rows,
            "errors": result.errors,
            "is_valid_file": result.is_valid_file,
            "valid_records": records(result.valid_df),
            "invalid_records": records(result.invalid_df),
        }
    )


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------
@app.post("/predict/batch")
def predict(req: PredictBatchRequest):
    if not req.readings:
        return ok({"predictions": []})
    readings = coerce_readings(req.readings)
    try:
        result_df = predict_batch(pd.DataFrame(readings))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ok({"predictions": result_df.to_dict(orient="records")})


# ---------------------------------------------------------------------------
# Explainability
# ---------------------------------------------------------------------------
@app.post("/explain")
def explain(req: ExplainRequest):
    reading = coerce_reading(req.reading)
    try:
        shap_df = explain_prediction(reading)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ok(
        {
            "shap_values": shap_df.to_dict(orient="records"),
            "summary": plain_language_summary(shap_df),
        }
    )


@app.post("/explain/batch")
def explain_batch(req: ExplainBatchRequest):
    """
    Explain many readings in one request.

    The backend previously issued one HTTP call per reading, which made a
    10,000-row upload issue 10,000 sequential round-trips. This endpoint keeps
    the same per-reading logic but amortizes the transport overhead.
    """
    if not req.readings:
        return ok({"explanations": []})
    readings = coerce_readings(req.readings)
    try:
        explanations = []
        for reading in readings:
            shap_df = explain_prediction(reading)
            explanations.append(
                {
                    "shap_values": shap_df.to_dict(orient="records"),
                    "summary": plain_language_summary(shap_df),
                }
            )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ok({"explanations": explanations})


@app.post("/explain/global")
def explain_global(req: GlobalImportanceRequest):
    if not req.readings:
        return ok({"importance": []})
    readings = coerce_readings(req.readings)
    try:
        importance_df = global_feature_importance(pd.DataFrame(readings), sample_size=req.sample_size)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ok({"importance": importance_df.to_dict(orient="records")})


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------
def _build_recommendations(overall_probability, failure_mode_probabilities, shap_rows, mode_threshold):
    shap_df = pd.DataFrame(shap_rows) if shap_rows else None
    recs = generate_recommendations(
        overall_probability, failure_mode_probabilities, shap_df, mode_threshold
    )
    return [
        {
            "failure_mode": r.failure_mode,
            "failure_mode_label": r.failure_mode_label,
            "probability": r.probability,
            "confidence": r.confidence,
            "supporting_features": r.supporting_features,
            "recommended_actions": r.recommended_actions,
            "urgency": r.urgency,
            "rank_score": r.rank_score,
            **recommendation_to_db_dict(r),
        }
        for r in recs
    ]


@app.post("/recommendations")
def recommendations(req: RecommendationsRequest):
    return ok(
        {
            "recommendations": _build_recommendations(
                req.overall_probability,
                req.failure_mode_probabilities,
                req.shap_rows,
                req.mode_threshold,
            )
        }
    )


@app.post("/recommendations/batch")
def recommendations_batch(req: RecommendationsBatchRequest):
    """Compute recommendations for many predictions in one request."""
    results = [
        _build_recommendations(
            item.overall_probability,
            item.failure_mode_probabilities,
            item.shap_rows,
            req.mode_threshold,
        )
        for item in req.items
    ]
    return ok({"results": results})


# ---------------------------------------------------------------------------
# What-if simulation
# ---------------------------------------------------------------------------
@app.get("/whatif/fields")
def whatif_fields():
    return ok({"simulatable_fields": SIMULATABLE_FIELDS})


@app.post("/whatif/compare")
def whatif_compare(req: WhatIfCompareRequest):
    original = coerce_reading(req.original_reading)
    # Overrides are partial by design: merge, then coerce the merged result.
    merged = coerce_reading({**original, **(req.overrides or {})})
    overrides = {k: v for k, v in merged.items() if k != "Type"}
    try:
        comparison = compare_scenario(original, overrides)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ok(
        {
            "original_reading": comparison.original_reading,
            "scenario_reading": comparison.scenario_reading,
            "original_probability": comparison.original_probability,
            "scenario_probability": comparison.scenario_probability,
            "risk_difference": comparison.risk_difference,
            "original_failure_modes": comparison.original_failure_modes,
            "scenario_failure_modes": comparison.scenario_failure_modes,
        }
    )


@app.post("/whatif/search")
def whatif_search(req: WhatIfSearchRequest):
    original = coerce_reading(req.original_reading)
    try:
        best = find_lower_risk_scenario(original, req.target_probability, fields_to_search=req.fields)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if best is None:
        return ok({"found": False})
    return ok(
        {
            "found": True,
            "scenario_reading": best.scenario_reading,
            "scenario_probability": best.scenario_probability,
            "original_probability": best.original_probability,
            "risk_difference": best.risk_difference,
        }
    )
