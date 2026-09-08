"""Small dependency-free nonlinear dynamical systems for experiments."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class DynamicalRun:
    """A trajectory and the final state of a discrete simulation."""

    trajectory: list[tuple[float, ...]]

    @property
    def final_state(self) -> tuple[float, ...]:
        return self.trajectory[-1] if self.trajectory else ()


class LogisticMap:
    """The canonical discrete population and bifurcation map."""

    def __init__(self, rate: float = 3.7, initial: float = 0.5) -> None:
        self.rate = float(rate)
        self.state = float(initial)
        if not 0.0 <= self.state <= 1.0:
            raise ValueError("initial state must be in [0, 1]")

    def step(self) -> float:
        self.state = self.rate * self.state * (1.0 - self.state)
        return self.state

    def run(self, steps: int) -> DynamicalRun:
        if steps < 0:
            raise ValueError("steps must be non-negative")
        trajectory = [(self.state,)]
        trajectory.extend((self.step(),) for _ in range(steps))
        return DynamicalRun(trajectory)


class LorenzSystem:
    """Euler-integrated Lorenz attractor with configurable parameters."""

    def __init__(self, sigma: float = 10.0, rho: float = 28.0, beta: float = 8.0 / 3.0) -> None:
        self.sigma, self.rho, self.beta = float(sigma), float(rho), float(beta)

    def derivative(self, state: tuple[float, float, float]) -> tuple[float, float, float]:
        x, y, z = state
        return self.sigma * (y - x), x * (self.rho - z) - y, x * y - self.beta * z

    def step(self, state: tuple[float, float, float], dt: float = 0.01) -> tuple[float, float, float]:
        if dt <= 0.0:
            raise ValueError("dt must be positive")
        derivative = self.derivative(state)
        return tuple(value + dt * delta for value, delta in zip(state, derivative))

    def run(self, steps: int, initial: tuple[float, float, float] = (1.0, 1.0, 1.0), dt: float = 0.01) -> DynamicalRun:
        state = initial
        trajectory = [state]
        for _ in range(steps):
            state = self.step(state, dt)
            trajectory.append(state)
        return DynamicalRun(trajectory)


def simulate_map(step: Callable[[], float], initial: float, steps: int) -> list[float]:
    """Collect a scalar trajectory from any discrete map."""
    values = [float(initial)]
    values.extend(float(step()) for _ in range(steps))
    return values
