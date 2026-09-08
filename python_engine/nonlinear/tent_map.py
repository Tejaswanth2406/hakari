"""Piecewise-linear tent map."""

from __future__ import annotations


def tent_step(x: float, slope: float = 2.0) -> float:
    if not 0.0 <= x <= 1.0 or slope <= 0.0:
        raise ValueError("x must be in [0, 1] and slope must be positive")
    return slope * x if x <= 0.5 else slope * (1.0 - x)
