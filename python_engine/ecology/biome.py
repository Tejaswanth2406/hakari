"""General biome classification from climate signals."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Biome:
    name: str
    mean_temperature: float
    precipitation: float
    productivity: float = 0.5

    def climate_stress(self, temperature: float, precipitation: float) -> float:
        heat_stress = abs(temperature - self.mean_temperature) / max(1.0, abs(self.mean_temperature))
        water_stress = abs(precipitation - self.precipitation) / max(1.0, self.precipitation)
        return min(1.0, 0.5 * (heat_stress + water_stress))
