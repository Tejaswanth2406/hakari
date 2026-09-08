"""Temperature and humidity-sensitive evaporation."""

from __future__ import annotations


def evaporation_rate(surface_area: float, temperature: float, humidity: float, coefficient: float = 0.001) -> float:
    vapor_demand = max(0.0, 1.0 - max(0.0, min(1.0, humidity)))
    thermal_factor = max(0.0, temperature - 273.15)
    return max(0.0, surface_area * coefficient * thermal_factor * vapor_demand)
