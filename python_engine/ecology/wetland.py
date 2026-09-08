"""Wetland habitat for water retention and methane flux."""

from __future__ import annotations

from .habitat import Habitat


class WetlandHabitat(Habitat):
    def water_retention(self, inflow: float, dt: float = 1.0) -> float:
        retained = max(0.0, inflow) * min(1.0, self.area / (self.area + 1.0)) * dt
        self.environment.water += retained
        return retained

    def methane_flux(self, anaerobic_fraction: float = 0.4) -> float:
        return max(0.0, self.biomass * anaerobic_fraction * 0.01)
