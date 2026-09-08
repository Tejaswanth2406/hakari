"""Replicator dynamics for evolving strategy populations."""

from __future__ import annotations


def replicator_step(population: list[float], payoff: list[float], dt: float = 0.01) -> list[float]:
    if len(population) != len(payoff) or not population:
        raise ValueError("population and payoff must have the same non-empty length")
    mean_payoff = sum(p * f for p, f in zip(population, payoff))
    updated = [max(0.0, p + dt * p * (f - mean_payoff)) for p, f in zip(population, payoff)]
    total = sum(updated)
    return [value / total for value in updated] if total else [0.0] * len(updated)
