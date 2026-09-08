"""Nonlinear pendulum with optional damping and forcing."""

from __future__ import annotations

import math


def pendulum_step(state: tuple[float, float], dt: float = 0.01, gravity: float = 9.81, length: float = 1.0, damping: float = 0.05, forcing: float = 0.0, frequency: float = 1.0, time: float = 0.0) -> tuple[float, float]:
    angle, velocity = state
    acceleration = -(gravity / length) * math.sin(angle) - damping * velocity + forcing * math.cos(frequency * time)
    return angle + dt * velocity, velocity + dt * acceleration
