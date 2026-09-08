"""Discrete delay differential equation integration."""

from __future__ import annotations

from collections.abc import Callable


def delay_step(history: list[float], derivative: Callable[[float, float], float], dt: float, delay_steps: int) -> float:
    if not history or delay_steps < 0 or dt <= 0:
        raise ValueError("history must be non-empty, delay_steps non-negative, and dt positive")
    delayed = history[-1 - delay_steps] if len(history) > delay_steps else history[0]
    return history[-1] + dt * derivative(history[-1], delayed)
