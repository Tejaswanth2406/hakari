"""Grassland habitat grazing and regrowth."""

from __future__ import annotations

from .habitat import Habitat


class GrasslandHabitat(Habitat):
    def graze(self, consumers: float, rate: float = 0.05) -> float:
        consumed = min(self.biomass, max(0.0, consumers) * max(0.0, rate))
        self.biomass -= consumed
        return consumed
