"""Thermodynamic measurements for the shared environment."""

from __future__ import annotations

import math

from .environment import EnvironmentState


def environment_entropy(state: EnvironmentState, boltzmann: float = 1.380649e-23) -> float:
    """Approximate entropy proxy from humidity, water, and temperature."""
    temperature = max(state.temperature, 1e-12)
    probabilities = [max(1e-12, state.humidity), max(1e-12, 1.0 - state.humidity)]
    mixing = -sum(probability * math.log(probability) for probability in probabilities)
    return boltzmann * temperature * mixing


def environment_free_energy(state: EnvironmentState, energy: float, entropy: float | None = None) -> float:
    entropy_value = environment_entropy(state) if entropy is None else entropy
    return energy - state.temperature * entropy_value
