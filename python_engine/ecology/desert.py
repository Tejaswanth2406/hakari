"""Desert habitat with water-limited productivity."""

from __future__ import annotations

from .habitat import Habitat


class DesertHabitat(Habitat):
    def resource_index(self) -> float:
        return max(0.0, min(1.0, self.environment.water * 0.25 + (1.0 - self.environment.humidity) * 0.1))

    def drought_stress(self) -> float:
        return max(0.0, min(1.0, 1.0 - self.environment.water))
