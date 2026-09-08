"""Rössler oscillator vector field and Euler step."""

from __future__ import annotations


def rossler_derivative(state: tuple[float, float, float], a: float = 0.2, b: float = 0.2, c: float = 5.7) -> tuple[float, float, float]:
    x, y, z = state
    return -y - z, x + a * y, b + z * (x - c)


def rossler_step(state: tuple[float, float, float], dt: float = 0.01, **parameters: float) -> tuple[float, float, float]:
    if dt <= 0:
        raise ValueError("dt must be positive")
    derivative = rossler_derivative(state, **parameters)
    return tuple(value + dt * delta for value, delta in zip(state, derivative))
