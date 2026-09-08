"""Van der Pol self-sustaining oscillator."""

from __future__ import annotations


def van_der_pol_step(state: tuple[float, float], mu: float = 1.0, dt: float = 0.01) -> tuple[float, float]:
    if dt <= 0:
        raise ValueError("dt must be positive")
    position, velocity = state
    acceleration = mu * (1.0 - position ** 2) * velocity - position
    return position + dt * velocity, velocity + dt * acceleration
