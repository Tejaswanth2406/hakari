"""Nitrogen fixation, uptake, and mineralization."""

from __future__ import annotations


def nitrogen_step(pool: float, fixation: float, uptake: float, mineralization: float, dt: float = 1.0) -> float:
    return max(0.0, pool + dt * (fixation + mineralization - uptake))


def available_nitrogen(pool: float, soil_moisture: float, temperature: float) -> float:
    thermal_factor = max(0.0, min(1.0, (temperature - 273.15) / 40.0))
    return max(0.0, pool) * max(0.0, min(1.0, soil_moisture)) * thermal_factor
