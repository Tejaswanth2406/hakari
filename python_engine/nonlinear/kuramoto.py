"""All-to-all Kuramoto oscillator synchronization."""

from __future__ import annotations

import math


def kuramoto_step(phases: list[float], frequencies: list[float], coupling: float = 1.0, dt: float = 0.01) -> list[float]:
    if len(phases) != len(frequencies) or not phases:
        raise ValueError("phases and frequencies must have the same non-empty length")
    count = len(phases)
    next_phases = []
    for index, phase in enumerate(phases):
        interaction = sum(math.sin(other - phase) for other in phases) / count
        next_phases.append(phase + dt * (frequencies[index] + coupling * interaction))
    return next_phases


def order_parameter(phases: list[float]) -> float:
    if not phases:
        return 0.0
    real = sum(math.cos(phase) for phase in phases) / len(phases)
    imaginary = sum(math.sin(phase) for phase in phases) / len(phases)
    return (real * real + imaginary * imaginary) ** 0.5
