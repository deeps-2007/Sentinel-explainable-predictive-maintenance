"""
What-if simulation: compare an original machine reading against a modified
scenario, and search for lower-risk scenarios within physically reasonable
operating ranges.

Type (and identifiers UDI / Product ID / machine_id) are never modified by
the simulator - only Air temperature, Process temperature, Rotational speed,
Torque, and Tool wear can be changed, matching the project requirements.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from src.prediction import predict_single
from src.validation import RANGES

SIMULATABLE_FIELDS = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]

# Reasonable step sizes used by the "Find Lower-Risk Scenario" search
STEP_SIZES = {
    "Air temperature [K]": 0.5,
    "Process temperature [K]": 0.5,
    "Rotational speed [rpm]": 50,
    "Torque [Nm]": 2.0,
    "Tool wear [min]": 10,
}

# How far the search is allowed to move each field, as +/- this many steps
SEARCH_RADIUS_STEPS = 4


@dataclass
class WhatIfComparison:
    original_reading: dict
    scenario_reading: dict
    original_probability: float
    scenario_probability: float
    risk_difference: float
    original_failure_modes: dict = field(default_factory=dict)
    scenario_failure_modes: dict = field(default_factory=dict)


def compare_scenario(original_reading: dict, scenario_overrides: dict) -> WhatIfComparison:
    """Compare the original reading to a scenario with the given field overrides."""
    scenario_reading = {**original_reading, **scenario_overrides}
    # Physical validity guard
    scenario_reading = _clip_to_valid_ranges(scenario_reading)

    original_result = predict_single(original_reading)
    scenario_result = predict_single(scenario_reading)

    return WhatIfComparison(
        original_reading=original_reading,
        scenario_reading=scenario_reading,
        original_probability=original_result.failure_probability,
        scenario_probability=scenario_result.failure_probability,
        risk_difference=scenario_result.failure_probability - original_result.failure_probability,
        original_failure_modes=original_result.failure_mode_probabilities,
        scenario_failure_modes=scenario_result.failure_mode_probabilities,
    )


def _clip_to_valid_ranges(reading: dict) -> dict:
    """Prevent physically invalid combinations by clipping to the validated ranges."""
    clipped = dict(reading)
    for field_name, (low, high) in RANGES.items():
        if field_name in clipped:
            clipped[field_name] = float(np.clip(clipped[field_name], low, high))
    # Process temperature should always be >= air temperature in this domain
    if clipped.get("Process temperature [K]", 0) < clipped.get("Air temperature [K]", 0):
        clipped["Process temperature [K]"] = clipped["Air temperature [K]"]
    return clipped


def find_lower_risk_scenario(
    original_reading: dict,
    target_probability: float,
    fields_to_search: list[str] | None = None,
    max_candidates: int = 400,
) -> WhatIfComparison | None:
    """
    Search nearby, physically valid feature combinations for one that pushes
    the predicted failure probability below `target_probability`.

    This is a local grid search around the original reading (not a global
    optimizer), intentionally scoped so results stay close to a plausible
    real operating adjustment. Returns None if no candidate in the search
    space achieves the target.

    IMPORTANT: results are model-based suggestions, not a guaranteed
    physical outcome.
    """
    fields_to_search = fields_to_search or SIMULATABLE_FIELDS

    # Build the per-field candidate offsets (in units of STEP_SIZES)
    offsets_per_field = []
    for field_name in fields_to_search:
        step = STEP_SIZES[field_name]
        offsets = [step * k for k in range(-SEARCH_RADIUS_STEPS, SEARCH_RADIUS_STEPS + 1)]
        offsets_per_field.append(offsets)

    best_candidate = None
    best_probability = None
    n_checked = 0

    # Greedy coordinate-descent style search first (fast + usually sufficient)
    current = dict(original_reading)
    current_prob = predict_single(current).failure_probability

    improved = True
    while improved and n_checked < max_candidates:
        improved = False
        for field_name in fields_to_search:
            step = STEP_SIZES[field_name]
            for delta in (-step, step, -2 * step, 2 * step):
                candidate = dict(current)
                candidate[field_name] = candidate[field_name] + delta
                candidate = _clip_to_valid_ranges(candidate)
                prob = predict_single(candidate).failure_probability
                n_checked += 1
                if prob < current_prob:
                    current = candidate
                    current_prob = prob
                    improved = True
                if n_checked >= max_candidates:
                    break
            if n_checked >= max_candidates:
                break
        if current_prob <= target_probability:
            break

    if current_prob <= target_probability or current_prob < predict_single(original_reading).failure_probability:
        return compare_scenario(original_reading, {k: current[k] for k in fields_to_search})

    return None
