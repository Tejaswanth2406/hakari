"""Water balance with precipitation, evaporation, and runoff."""

from __future__ import annotations


def water_balance(storage: float, precipitation: float, evaporation: float, runoff_fraction: float = 0.1, dt: float = 1.0) -> dict[str, float]:
    if storage < 0 or not 0.0 <= runoff_fraction <= 1.0:
        raise ValueError("storage must be non-negative and runoff_fraction must be in [0, 1]")
    runoff = max(0.0, precipitation) * runoff_fraction
    next_storage = max(0.0, storage + dt * (precipitation - evaporation - runoff))
    return {"storage": next_storage, "runoff": runoff, "evaporation": max(0.0, evaporation)}
