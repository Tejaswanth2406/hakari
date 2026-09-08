"""Composable ecosystem engine for habitats, species, and thermodynamics."""

from __future__ import annotations

from dataclasses import dataclass, field

from .environment import EnvironmentState
from .environment_thermodynamics import environment_entropy
from .habitat import Habitat
from .species import Species


@dataclass
class EcosystemEngine:
    habitat: Habitat
    species: list[Species] = field(default_factory=list)
    time: float = 0.0

    def step(self, dt: float = 1.0, heat_input: float = 0.0, water_input: float = 0.0) -> dict[str, object]:
        self.habitat.environment.step(heat_input, water_input, dt)
        habitat_state = self.habitat.step(dt)
        resource_pressure = max(0.0, 1.0 - habitat_state["resource_index"])
        for organism in self.species:
            organism.step(dt, resource_pressure * organism.population * 0.01)
        self.time += dt
        return self.snapshot()

    def snapshot(self) -> dict[str, object]:
        return {"time": self.time, "habitat": self.habitat.step(0.0), "environment": self.habitat.environment.snapshot(), "entropy": environment_entropy(self.habitat.environment), "species": {organism.name: organism.population for organism in self.species}}
