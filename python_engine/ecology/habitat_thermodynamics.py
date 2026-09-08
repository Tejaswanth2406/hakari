"""Thermodynamic calculations scoped to a habitat."""

from __future__ import annotations

from .habitat import Habitat


def habitat_heat_capacity(habitat: Habitat, specific_heat: float = 4180.0) -> float:
    water_mass = max(0.0, habitat.environment.water * habitat.area)
    return water_mass * specific_heat


def habitat_free_energy(habitat: Habitat, internal_energy: float, entropy: float, reference_temperature: float | None = None) -> float:
    temperature = habitat.environment.temperature if reference_temperature is None else reference_temperature
    return internal_energy - temperature * entropy
