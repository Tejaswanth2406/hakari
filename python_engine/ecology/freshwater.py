"""Freshwater habitat oxygen and nutrient dynamics."""

from __future__ import annotations

from .habitat import Habitat


class FreshwaterHabitat(Habitat):
    def dissolved_oxygen(self, temperature: float | None = None) -> float:
        water_temperature = self.environment.temperature if temperature is None else temperature
        return max(0.0, 14.6 - 0.04 * max(0.0, water_temperature - 273.15))
