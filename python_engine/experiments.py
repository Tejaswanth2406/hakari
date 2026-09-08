"""Repeatable baseline/intervention experiment orchestration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Any

from .metrics import calculate_metrics


@dataclass
class ExperimentResult:
    baseline: list[float]
    intervention: list[float]
    metrics: dict[str, object]

    def snapshot(self) -> dict[str, object]:
        return {"baseline": self.baseline, "intervention": self.intervention, "metrics": self.metrics}


class ExperimentRunner:
    """Run comparable deterministic or stochastic scenarios."""

    def compare(
        self,
        scenario: Callable[[dict[str, Any]], list[float]],
        baseline: dict[str, Any] | None = None,
        intervention: dict[str, Any] | None = None,
    ) -> ExperimentResult:
        baseline_values = scenario(baseline or {})
        intervention_values = scenario(intervention or {})
        return ExperimentResult(
            baseline=baseline_values,
            intervention=intervention_values,
            metrics=calculate_metrics(intervention_values, baseline_values),
        )

    def monte_carlo(
        self,
        scenario: Callable[[int], float],
        runs: int = 100,
        seed: int = 0,
    ) -> dict[str, float]:
        if runs <= 0:
            raise ValueError("runs must be positive")
        values = [float(scenario(seed + index)) for index in range(runs)]
        mean = sum(values) / runs
        variance = sum((value - mean) ** 2 for value in values) / runs
        return {"runs": float(runs), "mean": mean, "stddev": variance ** 0.5, "minimum": min(values), "maximum": max(values)}
