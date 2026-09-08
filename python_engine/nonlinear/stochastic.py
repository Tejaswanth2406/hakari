"""Euler-Maruyama integration for stochastic differential equations."""

from __future__ import annotations

import random
from collections.abc import Callable


def euler_maruyama_step(value: float, drift: Callable[[float, float], float], diffusion: Callable[[float, float], float], time: float, dt: float, rng: random.Random | None = None) -> float:
    if dt <= 0:
        raise ValueError("dt must be positive")
    generator = rng or random.Random()
    return value + drift(value, time) * dt + diffusion(value, time) * (dt ** 0.5) * generator.gauss(0.0, 1.0)
