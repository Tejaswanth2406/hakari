"""Species state and bounded population growth."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Species:
    name: str
    population: float
    growth_rate: float = 0.1
    carrying_capacity: float = 1000.0

    def step(self, dt: float = 1.0, pressure: float = 0.0) -> float:
        growth = self.growth_rate * self.population * (1.0 - self.population / max(1.0, self.carrying_capacity))
        self.population = max(0.0, self.population + dt * (growth - pressure))
        return self.population
