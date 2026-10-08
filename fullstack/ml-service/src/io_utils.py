"""
Input coercion and JSON-safety helpers for the ML microservice.

These exist to fix three classes of 500 errors that occurred when the Node
backend forwarded real-world data:

1. ``ValueError: Out of range float values are not JSON compliant: nan``
   NaN / Infinity are valid Python floats but invalid JSON, so any NaN that
   reached a response body crashed serialization. ``sanitize_json`` converts
   them to ``None``.

2. ``TypeError: can't multiply sequence by non-int of type 'float'``
   CSV parsers (including the backend's ``csv-parse``) hand back every column
   as a *string*. ``"60.0" * 1500`` is a string operation, so feature
   engineering exploded. ``coerce_reading`` casts every numeric feature to
   float before it reaches pandas/NumPy.

3. ``KeyError: "['Tool wear [min]'] not in index"``
   A missing/misnamed column produced an opaque 500. ``coerce_reading`` now
   raises a 400 naming exactly which columns are missing.

It also normalizes ``Type`` to uppercase, which previously passed silently but
produced an all-zero one-hot vector (i.e. a quietly wrong prediction) whenever
a CSV used lowercase ``l/m/h``.
"""
from __future__ import annotations

import math
from typing import Any

from fastapi import HTTPException

NUMERIC_FEATURES = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]
CATEGORICAL_FEATURE = "Type"
VALID_TYPES = {"L", "M", "H"}


def sanitize_json(obj: Any) -> Any:
    """
    Recursively replace NaN / +-Infinity with None and convert NumPy scalars
    to native Python types so the result is always JSON-serializable.
    """
    # NumPy scalar -> Python scalar (handles np.float32, np.int64, np.bool_)
    if hasattr(obj, "item") and not isinstance(obj, (str, bytes, dict, list, tuple)):
        try:
            obj = obj.item()
        except (ValueError, AttributeError):
            pass

    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_json(v) for v in obj]
    return obj


def coerce_reading(reading: dict, index: int | None = None) -> dict:
    """
    Validate and normalize one reading into the exact shape the model pipeline
    expects: ``Type`` as an uppercase L/M/H string, and all five sensor
    features as floats.

    Raises HTTPException(400) with an actionable message rather than letting a
    KeyError/TypeError surface as an opaque 500.
    """
    where = f" (reading at index {index})" if index is not None else ""

    if not isinstance(reading, dict):
        raise HTTPException(status_code=400, detail=f"Reading must be an object{where}.")

    missing = [c for c in NUMERIC_FEATURES + [CATEGORICAL_FEATURE] if c not in reading]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required column(s): {', '.join(missing)}{where}.",
        )

    out: dict = {}

    raw_type = reading[CATEGORICAL_FEATURE]
    if raw_type is None:
        raise HTTPException(status_code=400, detail=f"'Type' must not be null{where}.")
    normalized_type = str(raw_type).strip().upper()
    if normalized_type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"'Type' must be one of L, M, H - got '{raw_type}'{where}.",
        )
    out[CATEGORICAL_FEATURE] = normalized_type

    for col in NUMERIC_FEATURES:
        value = reading[col]
        if value is None or (isinstance(value, str) and value.strip() == ""):
            raise HTTPException(
                status_code=400, detail=f"'{col}' must not be null or empty{where}."
            )
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail=f"'{col}' must be numeric - got '{value}'{where}.",
            ) from None
        if math.isnan(numeric) or math.isinf(numeric):
            raise HTTPException(
                status_code=400, detail=f"'{col}' must be a finite number{where}."
            )
        out[col] = numeric

    return out


def coerce_readings(readings: list[dict]) -> list[dict]:
    """Coerce a batch of readings, reporting the offending index on failure."""
    return [coerce_reading(r, i) for i, r in enumerate(readings)]
