"""
CSV upload validation for the AI4I 2020-style predictive maintenance data.

Validation is intentionally strict about the columns that feed the models
(temperatures, torque, tool wear, type) while remaining lenient about
identifier columns (UDI / Product ID), which are optional for future
real-world ingestion.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

REQUIRED_COLUMNS = [
    "Type",
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]

OPTIONAL_COLUMNS = ["UDI", "Product ID", "machine_id", "timestamp"]

VALID_TYPES = {"L", "M", "H"}

# Reasonable physical operating ranges based on the AI4I 2020 dataset profile.
# These are intentionally generous bounds, used only to catch obviously
# corrupt or impossible sensor readings.
RANGES = {
    "Air temperature [K]": (250.0, 350.0),
    "Process temperature [K]": (250.0, 360.0),
    "Rotational speed [rpm]": (0.0, 5000.0),
    "Torque [Nm]": (0.0, 150.0),
    "Tool wear [min]": (0.0, 300.0),
}


@dataclass
class ValidationResult:
    total_rows: int = 0
    valid_rows: int = 0
    duplicate_rows: int = 0
    invalid_rows: int = 0
    errors: list[str] = field(default_factory=list)
    valid_df: pd.DataFrame | None = None
    invalid_df: pd.DataFrame | None = None

    @property
    def is_valid_file(self) -> bool:
        """True if the file has the required columns and at least one usable row."""
        return not any(e.startswith("MISSING_COLUMNS") for e in self.errors)


def validate_csv(df: pd.DataFrame) -> ValidationResult:
    """
    Run full validation on an uploaded CSV DataFrame.

    Returns a ValidationResult with the split of valid/invalid rows and a
    human-readable list of error summaries.
    """
    result = ValidationResult(total_rows=len(df))

    # 1. Required columns present?
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        result.errors.append(f"MISSING_COLUMNS: {', '.join(missing)}")
        result.invalid_rows = len(df)
        result.invalid_df = df.copy()
        result.valid_df = df.iloc[0:0].copy()
        return result

    working = df.copy()
    working["_row_valid"] = True
    working["_reasons"] = [[] for _ in range(len(working))]

    def flag(mask: pd.Series, reason: str) -> None:
        for idx in working.index[mask]:
            working.at[idx, "_reasons"].append(reason)
        working.loc[mask, "_row_valid"] = False

    # 2. Missing values in required columns
    for col in REQUIRED_COLUMNS:
        mask = working[col].isna()
        if mask.any():
            flag(mask, f"missing_{col}")

    # 3. Type column must be one of L/M/H
    type_mask = ~working["Type"].astype(str).str.upper().isin(VALID_TYPES)
    if type_mask.any():
        flag(type_mask, "invalid_type")

    # 4. Numeric columns must actually be numeric
    numeric_cols = [c for c in REQUIRED_COLUMNS if c != "Type"]
    for col in numeric_cols:
        coerced = pd.to_numeric(working[col], errors="coerce")
        bad_numeric = coerced.isna() & working[col].notna()
        if bad_numeric.any():
            flag(bad_numeric, f"non_numeric_{col}")
        working[col] = coerced

    # 5. Negative value checks
    for col in numeric_cols:
        mask = working[col] < 0
        mask = mask.fillna(False)
        if mask.any():
            flag(mask, f"negative_{col}")

    # 6. Range checks (temperature / torque / speed / tool wear)
    for col, (low, high) in RANGES.items():
        mask = (working[col] < low) | (working[col] > high)
        mask = mask.fillna(False)
        if mask.any():
            flag(mask, f"out_of_range_{col}")

    # 7. Duplicate rows (exact duplicates across the feature columns + identifiers
    #    if present, so re-uploading the same file twice doesn't double-count)
    dedupe_cols = REQUIRED_COLUMNS + [c for c in ["UDI", "Product ID"] if c in working.columns]
    dup_mask = working.duplicated(subset=dedupe_cols, keep="first")
    result.duplicate_rows = int(dup_mask.sum())

    invalid_mask = ~working["_row_valid"]
    result.invalid_rows = int(invalid_mask.sum())
    result.valid_rows = int(len(working) - result.invalid_rows - result.duplicate_rows)

    valid_mask = working["_row_valid"] & ~dup_mask
    result.valid_df = df.loc[valid_mask].copy()
    result.invalid_df = df.loc[invalid_mask | dup_mask].copy()

    error_reasons = sorted(
        {reason for reasons in working.loc[invalid_mask, "_reasons"] for reason in reasons}
    )
    result.errors.extend(error_reasons)
    if result.duplicate_rows:
        result.errors.append(f"duplicate_rows: {result.duplicate_rows}")

    return result
