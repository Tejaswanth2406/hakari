"""Hénon discrete chaotic map."""

from __future__ import annotations


def henon_step(state: tuple[float, float], a: float = 1.4, b: float = 0.3) -> tuple[float, float]:
    x, y = state
    return 1.0 - a * x * x + y, b * x


class HenonMap:
    """Stateful wrapper around the Hénon map."""

    def __init__(self, state: tuple[float, float] = (0.0, 0.0), a: float = 1.4, b: float = 0.3) -> None:
        self.state = state
        self.a, self.b = a, b

    def step(self) -> tuple[float, float]:
        self.state = henon_step(self.state, self.a, self.b)
        return self.state
