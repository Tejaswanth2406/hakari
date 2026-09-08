"""Soil moisture and organic matter dynamics."""

from __future__ import annotations


def soil_step(moisture: float, organic_matter: float, rainfall: float, evaporation: float, decomposition: float, dt: float = 1.0) -> dict[str, float]:
    return {"moisture": max(0.0, moisture + dt * (rainfall - evaporation)), "organic_matter": max(0.0, organic_matter + dt * (-decomposition))}


def soil_fertility(organic_matter: float, moisture: float, nitrogen: float) -> float:
    values = [max(0.0, min(1.0, organic_matter)), max(0.0, min(1.0, moisture)), max(0.0, min(1.0, nitrogen))]
    return sum(values) / len(values)
