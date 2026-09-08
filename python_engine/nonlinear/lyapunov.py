"""Largest Lyapunov exponent estimates for scalar maps."""

from __future__ import annotations

import math
from collections.abc import Callable


def largest_lyapunov(step: Callable[[float], float], initial: float, epsilon: float = 1e-8, steps: int = 1000, discard: int = 100) -> float:
    if epsilon <= 0 or steps <= 0:
        raise ValueError("epsilon and steps must be positive")
    first, second = initial, initial + epsilon
    total = 0.0
    for index in range(steps + discard):
        first, second = step(first), step(second)
        separation = abs(second - first)
        if separation == 0.0:
            continue
        if index >= discard:
            total += math.log(separation / epsilon)
        second = first + epsilon * (1.0 if second >= first else -1.0)
    return total / steps
