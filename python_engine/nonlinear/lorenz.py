"""Lorenz chaotic attractor integration."""

from __future__ import annotations


def lorenz_derivative(state: tuple[float, float, float], sigma: float = 10.0, rho: float = 28.0, beta: float = 8.0 / 3.0) -> tuple[float, float, float]:
    x, y, z = state
    return sigma * (y - x), x * (rho - z) - y, x * y - beta * z


def lorenz_step(state: tuple[float, float, float], dt: float = 0.01, **parameters: float) -> tuple[float, float, float]:
    if dt <= 0:
        raise ValueError("dt must be positive")
    derivative = lorenz_derivative(state, **parameters)
    return tuple(value + dt * delta for value, delta in zip(state, derivative))
