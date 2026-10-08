"""
Regression tests for the input-handling bugs that caused
``Prediction run failed: ML service error (500): Internal Server Error``.

Each test below maps to a real failure reproduced against the running service:

* NaN/Inf in a response body  -> ValueError: Out of range float values are not
  JSON compliant
* string-typed numbers from a CSV parser -> TypeError: can't multiply sequence
  by non-int of type 'float'
* a missing/misnamed column -> KeyError: "['Tool wear [min]'] not in index"
* lowercase ``Type`` -> silently produced an all-zero one-hot (wrong prediction)

Run with:  pytest -q
"""
from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from main import app
from src.io_utils import coerce_reading, sanitize_json

client = TestClient(app)

GOOD = {
    "Type": "M",
    "Air temperature [K]": 300.5,
    "Process temperature [K]": 310.2,
    "Rotational speed [rpm]": 1400.0,
    "Torque [Nm]": 60.0,
    "Tool wear [min]": 230.0,
}


# --------------------------------------------------------------------------
# sanitize_json
# --------------------------------------------------------------------------
def test_sanitize_json_replaces_nan_and_inf_with_none():
    assert sanitize_json(float("nan")) is None
    assert sanitize_json(float("inf")) is None
    assert sanitize_json(float("-inf")) is None


def test_sanitize_json_recurses_into_containers():
    payload = {"a": [1.0, float("nan")], "b": {"c": float("inf")}}
    assert sanitize_json(payload) == {"a": [1.0, None], "b": {"c": None}}


def test_sanitize_json_converts_numpy_scalars():
    np = pytest.importorskip("numpy")
    out = sanitize_json({"x": np.float32(1.5), "y": np.int64(3)})
    assert out == {"x": pytest.approx(1.5), "y": 3}
    assert isinstance(out["y"], int)


# --------------------------------------------------------------------------
# coerce_reading
# --------------------------------------------------------------------------
def test_coerce_casts_string_numbers_to_float():
    out = coerce_reading({**GOOD, "Torque [Nm]": "60.0", "Tool wear [min]": "230"})
    assert out["Torque [Nm]"] == 60.0
    assert isinstance(out["Torque [Nm]"], float)
    assert out["Tool wear [min]"] == 230.0


def test_coerce_uppercases_type():
    assert coerce_reading({**GOOD, "Type": "m"})["Type"] == "M"
    assert coerce_reading({**GOOD, "Type": " l "})["Type"] == "L"


def test_coerce_rejects_missing_column_with_named_detail():
    from fastapi import HTTPException

    bad = {k: v for k, v in GOOD.items() if k != "Tool wear [min]"}
    with pytest.raises(HTTPException) as exc:
        coerce_reading(bad)
    assert exc.value.status_code == 400
    assert "Tool wear [min]" in exc.value.detail


def test_coerce_rejects_null_and_empty_values():
    from fastapi import HTTPException

    for bad_value in (None, ""):
        with pytest.raises(HTTPException) as exc:
            coerce_reading({**GOOD, "Torque [Nm]": bad_value})
        assert exc.value.status_code == 400


def test_coerce_rejects_invalid_type():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        coerce_reading({**GOOD, "Type": "X"})
    assert exc.value.status_code == 400
    assert "L, M, H" in exc.value.detail


def test_coerce_rejects_non_numeric_string():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        coerce_reading({**GOOD, "Torque [Nm]": "not-a-number"})
    assert exc.value.status_code == 400


# --------------------------------------------------------------------------
# Endpoint behaviour: these must never return 500 for bad input
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "reading",
    [
        {**GOOD, "Tool wear [min]": None},
        {**GOOD, "Torque [Nm]": ""},
        {**GOOD, "Type": "X"},
        {k: v for k, v in GOOD.items() if k != "Tool wear [min]"},
    ],
)
def test_bad_input_returns_400_not_500(reading):
    assert client.post("/predict/batch", json={"readings": [reading]}).status_code == 400
    assert client.post("/explain", json={"reading": reading}).status_code == 400


@pytest.mark.parametrize(
    "reading",
    [
        GOOD,
        {**GOOD, "Type": "m"},
        {**GOOD, "Torque [Nm]": "60.0", "Tool wear [min]": "230"},
        {**GOOD, "Rotational speed [rpm]": 1400, "Torque [Nm]": 60},
    ],
)
def test_valid_variants_succeed(reading):
    resp = client.post("/predict/batch", json={"readings": [reading]})
    assert resp.status_code == 200
    pred = resp.json()["predictions"][0]
    assert 0.0 <= pred["failure_probability"] <= 1.0
    assert pred["status"] in {"Healthy", "Warning", "Critical"}


def test_lowercase_type_matches_uppercase_prediction():
    """Lowercase Type used to yield an all-zero one-hot -> a quietly wrong score."""
    upper = client.post("/predict/batch", json={"readings": [GOOD]}).json()["predictions"][0]
    lower = client.post(
        "/predict/batch", json={"readings": [{**GOOD, "Type": "m"}]}
    ).json()["predictions"][0]
    assert upper["failure_probability"] == pytest.approx(lower["failure_probability"])


def test_string_numbers_match_float_prediction():
    floats = client.post("/predict/batch", json={"readings": [GOOD]}).json()["predictions"][0]
    strings = client.post(
        "/predict/batch",
        json={"readings": [{**GOOD, "Torque [Nm]": "60.0", "Tool wear [min]": "230"}]},
    ).json()["predictions"][0]
    assert floats["failure_probability"] == pytest.approx(strings["failure_probability"])


def test_all_response_floats_are_json_finite():
    """No NaN/Inf may reach a response body."""
    body = client.post("/explain", json={"reading": GOOD}).json()
    for row in body["shap_values"]:
        for key in ("feature_value", "shap_value"):
            value = row[key]
            if isinstance(value, float):
                assert math.isfinite(value)


# --------------------------------------------------------------------------
# Batch endpoints
# --------------------------------------------------------------------------
def test_explain_batch_matches_single_explain():
    single = client.post("/explain", json={"reading": GOOD}).json()
    batch = client.post("/explain/batch", json={"readings": [GOOD, GOOD]}).json()
    assert len(batch["explanations"]) == 2
    assert batch["explanations"][0]["summary"] == single["summary"]


def test_recommendations_batch_matches_single():
    modes = {"TWF": 0.9, "HDF": 0.05, "PWF": 0.05, "OSF": 0.1, "RNF": 0.01}
    single = client.post(
        "/recommendations", json={"overall_probability": 0.85, "failure_mode_probabilities": modes}
    ).json()["recommendations"]
    batch = client.post(
        "/recommendations/batch",
        json={"items": [{"overall_probability": 0.85, "failure_mode_probabilities": modes}]},
    ).json()["results"][0]
    assert [r["failure_mode"] for r in single] == [r["failure_mode"] for r in batch]


def test_empty_batches_return_empty_lists():
    assert client.post("/predict/batch", json={"readings": []}).json()["predictions"] == []
    assert client.post("/explain/batch", json={"readings": []}).json()["explanations"] == []
