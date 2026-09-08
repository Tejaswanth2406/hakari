"""Base habitat model connecting environment and carrying capacity."""

from __future__ import annotations

from dataclasses import dataclass, field

from .environment import EnvironmentState


@dataclass
class Habitat:
    name: str
    area: float = 1.0
    environment: EnvironmentState = field(default_factory=EnvironmentState)
    biomass: float = 0.0

    def resource_index(self) -> float:
        climate = self.environment.humidity * self.environment.water
        return max(0.0, min(1.0, climate * self.environment.radiation / 200.0))

    def step(self, dt: float = 1.0) -> dict[str, float]:
        growth = self.resource_index() * self.area * dt
        self.biomass = max(0.0, self.biomass + growth - 0.01 * self.biomass * dt)
        return {"biomass": self.biomass, "resource_index": self.resource_index()}
