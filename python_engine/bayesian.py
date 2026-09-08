"""Bayesian belief dynamics for agents inside a simulated world."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

from .metrics import normalize


@dataclass
class BayesianBelief:
    """Maintain and update a categorical posterior distribution."""

    hypotheses: dict[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.hypotheses = self._distribution(self.hypotheses)

    @staticmethod
    def _distribution(values: Mapping[str, float]) -> dict[str, float]:
        if not values or any(value < 0.0 for value in values.values()):
            raise ValueError("hypotheses must contain non-negative values")
        total = sum(float(value) for value in values.values())
        if total <= 0.0:
            raise ValueError("hypotheses must have positive mass")
        return {name: float(value) / total for name, value in values.items()}

    def update(self, likelihoods: Mapping[str, float]) -> dict[str, float]:
        if set(likelihoods) != set(self.hypotheses):
            raise ValueError("likelihoods must match the current hypotheses")
        posterior = {
            name: prior * max(0.0, float(likelihoods[name]))
            for name, prior in self.hypotheses.items()
        }
        self.hypotheses = self._distribution(posterior)
        return dict(self.hypotheses)

    @property
    def most_likely(self) -> str | None:
        return max(self.hypotheses, key=self.hypotheses.get, default=None)

    @property
    def confidence(self) -> float:
        return max(self.hypotheses.values(), default=0.0)

    def snapshot(self) -> dict[str, object]:
        return {"hypotheses": dict(self.hypotheses), "most_likely": self.most_likely, "confidence": self.confidence}
