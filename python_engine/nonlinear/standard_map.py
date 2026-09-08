"""Chirikov standard map for kicked-rotor dynamics."""

from __future__ import annotations

import math


def standard_map_step(state: tuple[float, float], strength: float = 1.0) -> tuple[float, float]:
    angle, momentum = state
    next_momentum = momentum + strength * math.sin(angle)
    return (angle + next_momentum) % (2.0 * math.pi), next_momentum
