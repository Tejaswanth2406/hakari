"""Carbon uptake and respiration balance."""

from __future__ import annotations


def carbon_step(carbon: float, photosynthesis: float, respiration: float, combustion: float = 0.0, dt: float = 1.0) -> float:
    return max(0.0, carbon + dt * (respiration + combustion - photosynthesis))


def sequestration_rate(plant_biomass: float, efficiency: float = 0.02) -> float:
    return max(0.0, plant_biomass) * max(0.0, efficiency)
