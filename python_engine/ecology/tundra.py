"""Tundra habitat with freeze-thaw productivity."""

from __future__ import annotations

from .habitat import Habitat


class TundraHabitat(Habitat):
    def growing_fraction(self, temperature: float | None = None) -> float:
        current = self.environment.temperature if temperature is None else temperature
        return max(0.0, min(1.0, (current - 273.15) / 12.0))
