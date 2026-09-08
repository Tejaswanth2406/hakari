"""Logistic map and bounded trajectory helpers."""

from __future__ import annotations


def logistic_step(x: float, rate: float = 3.9) -> float:
    """Advance x_(t+1) = r*x_t*(1-x_t)."""
    if not 0.0 <= x <= 1.0:
        raise ValueError("x must be in [0, 1]")
    return rate * x * (1.0 - x)


def trajectory(initial: float = 0.5, rate: float = 3.9, steps: int = 100) -> list[float]:
    if steps < 0:
        raise ValueError("steps must be non-negative")
    values = [initial]
    for _ in range(steps):
        values.append(logistic_step(values[-1], rate))
    return values
