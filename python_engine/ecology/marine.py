"""Marine habitat salinity and heat stress."""

from __future__ import annotations

from .habitat import Habitat


class MarineHabitat(Habitat):
    salinity: float = 35.0

    def heat_stress(self, reference: float = 293.15) -> float:
        return max(0.0, min(1.0, abs(self.environment.temperature - reference) / 10.0))
