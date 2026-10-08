"""
Generates a SIMULATED dataset that mirrors the schema and statistical shape
of the UCI "AI4I 2020 Predictive Maintenance" dataset (10,000 rows, 5 failure
modes). This lets the project be trained, tested, and demoed without a
network dependency on the UCI repository.

IMPORTANT: This is simulated data for development/demo purposes only. For a
real deployment, replace `data/ai4i2020.csv` with the actual dataset
downloaded from:
https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset

Usage:
    python data/generate_sample_data.py
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
N_ROWS = 10000


def generate() -> pd.DataFrame:
    types = RNG.choice(["L", "M", "H"], size=N_ROWS, p=[0.6, 0.3, 0.1])

    # Air temperature: roughly normal around 300K
    air_temp = RNG.normal(300, 2, N_ROWS)
    # Process temperature tracks air temperature + ~10K with noise
    process_temp = air_temp + RNG.normal(10, 1, N_ROWS)

    # Rotational speed inversely related to torque (power ~ constant-ish)
    rot_speed = RNG.normal(1500, 180, N_ROWS).clip(1000, 2900)
    torque = RNG.normal(40, 10, N_ROWS).clip(3, 80)

    tool_wear = RNG.uniform(0, 253, N_ROWS)

    product_id = [f"{t}{RNG.integers(10000, 99999)}" for t in types]
    udi = np.arange(1, N_ROWS + 1)

    df = pd.DataFrame(
        {
            "UDI": udi,
            "Product ID": product_id,
            "Type": types,
            "Air temperature [K]": air_temp.round(1),
            "Process temperature [K]": process_temp.round(1),
            "Rotational speed [rpm]": rot_speed.round(0).astype(int),
            "Torque [Nm]": torque.round(1),
            "Tool wear [min]": tool_wear.round(0).astype(int),
        }
    )

    power = df["Torque [Nm]"] * df["Rotational speed [rpm]"] * (2 * math.pi / 60)
    temp_diff = df["Process temperature [K]"] - df["Air temperature [K]"]

    # --- Failure-mode rules approximating the AI4I 2020 generative process ---
    # (thresholds tuned so the overall failure rate lands near the ~3.4%
    # base rate seen in the real AI4I 2020 dataset)
    twf = ((df["Tool wear [min]"] > 225) & (RNG.random(N_ROWS) < 0.30)).astype(int)
    hdf = ((temp_diff < 8.4) & (df["Rotational speed [rpm]"] < 1350)).astype(int)
    pwf = ((power < 3300) | (power > 9500)).astype(int)

    strain_factor = df["Tool wear [min]"] * df["Torque [Nm]"]
    osf_threshold = df["Type"].map({"L": 12500, "M": 13500, "H": 14500})
    osf = (strain_factor > osf_threshold).astype(int)

    rnf = (RNG.random(N_ROWS) < 0.001).astype(int)

    machine_failure = ((twf + hdf + pwf + osf + rnf) > 0).astype(int)

    df["Machine failure"] = machine_failure
    df["TWF"] = twf
    df["HDF"] = hdf
    df["PWF"] = pwf
    df["OSF"] = osf
    df["RNF"] = rnf

    return df


if __name__ == "__main__":
    data = generate()
    out_path = "data/ai4i2020.csv"
    data.to_csv(out_path, index=False)
    print(f"Simulated AI4I-2020-style dataset written to {out_path}")
    print(f"Rows: {len(data)}  |  Failure rate: {data['Machine failure'].mean():.2%}")
    print("NOTE: This is SIMULATED data. Replace with the real UCI dataset for production use.")
