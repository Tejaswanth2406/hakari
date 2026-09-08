"""Serializable state models for cognitive world experiments."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BeliefState:
    """A probability distribution over named hypotheses."""

    probabilities: dict[str, float] = field(default_factory=dict)
    confidence: float = 0.0

    def snapshot(self) -> dict[str, Any]:
        return {
            "probabilities": dict(self.probabilities),
            "confidence": self.confidence,
        }


@dataclass
class WorldState:
    """Minimal common state passed between physics and cognitive layers."""

    time: float = 0.0
    entropy: float = 0.0
    temperature: float = 0.0
    energy: float = 0.0
    resources: dict[str, float] = field(default_factory=dict)
    beliefs: dict[str, BeliefState] = field(default_factory=dict)
    observations: list[dict[str, Any]] = field(default_factory=list)

    def snapshot(self) -> dict[str, Any]:
        return {
            "time": self.time,
            "entropy": self.entropy,
            "temperature": self.temperature,
            "energy": self.energy,
            "resources": dict(self.resources),
            "beliefs": {name: belief.snapshot() for name, belief in self.beliefs.items()},
            "observations": list(self.observations),
        }
