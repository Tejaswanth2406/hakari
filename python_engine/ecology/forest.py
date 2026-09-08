"""Forest habitat productivity and canopy carbon."""

from __future__ import annotations

from .habitat import Habitat


class ForestHabitat(Habitat):
    def canopy_capture(self, light: float, co2: float, dt: float = 1.0) -> float:
        capture = max(0.0, light) * max(0.0, min(1.0, co2)) * 0.01 * self.area * dt
        self.biomass += capture
        return capture
