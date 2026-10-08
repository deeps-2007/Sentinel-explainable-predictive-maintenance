"""
Central configuration for the Explainable Predictive Maintenance system.

All values are loaded from environment variables (via a .env file) so that
no credentials or environment-specific settings are ever hard-coded.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load the .env file that sits next to this project's root.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def _get_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


class Settings:
    """Loads and validates application settings from the environment."""

    # --- Database -----------------------------------------------------
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = _get_int("DB_PORT", 3306)
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "predictive_maintenance")

    DB_POOL_SIZE: int = _get_int("DB_POOL_SIZE", 5)
    DB_MAX_OVERFLOW: int = _get_int("DB_MAX_OVERFLOW", 10)
    DB_POOL_TIMEOUT: int = _get_int("DB_POOL_TIMEOUT", 30)
    DB_POOL_RECYCLE: int = _get_int("DB_POOL_RECYCLE", 1800)

    # --- Risk thresholds (configurable at runtime via the UI too) -----
    RISK_THRESHOLD_WARNING: float = _get_float("RISK_THRESHOLD_WARNING", 0.30)
    RISK_THRESHOLD_CRITICAL: float = _get_float("RISK_THRESHOLD_CRITICAL", 0.70)

    # --- Model / app ----------------------------------------------------
    MODEL_VERSION: str = os.getenv("MODEL_VERSION", "v1.0.0")
    MODELS_DIR: Path = PROJECT_ROOT / os.getenv("MODELS_DIR", "models")
    DATA_DIR: Path = PROJECT_ROOT / "data"
    APP_ENV: str = os.getenv("APP_ENV", "development")

    # --- Derived --------------------------------------------------------
    FEATURE_COLUMNS = [
        "Type",
        "Air temperature [K]",
        "Process temperature [K]",
        "Rotational speed [rpm]",
        "Torque [Nm]",
        "Tool wear [min]",
    ]

    ENGINEERED_COLUMNS = ["Temperature difference [K]", "Power [W]"]

    FAILURE_MODES = ["TWF", "HDF", "PWF", "OSF", "RNF"]

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    def risk_label(self, probability: float) -> str:
        """Map a failure probability to a Healthy / Warning / Critical label."""
        if probability >= self.RISK_THRESHOLD_CRITICAL:
            return "Critical"
        if probability >= self.RISK_THRESHOLD_WARNING:
            return "Warning"
        return "Healthy"

    def risk_color(self, probability: float) -> str:
        label = self.risk_label(probability)
        return {"Healthy": "#2ecc71", "Warning": "#f39c12", "Critical": "#e74c3c"}[label]


settings = Settings()
