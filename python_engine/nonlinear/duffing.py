"""Forced Duffing nonlinear oscillator."""

from __future__ import annotations


class DuffingOscillator:
    def __init__(self, alpha: float = 1.0, beta: float = 5.0, delta: float = 0.2, gamma: float = 8.0, omega: float = 0.5) -> None:
        self.alpha, self.beta, self.delta = alpha, beta, delta
        self.gamma, self.omega = gamma, omega

    def acceleration(self, position: float, velocity: float, time: float) -> float:
        return self.gamma * __import__("math").cos(self.omega * time) - self.delta * velocity - self.alpha * position - self.beta * position ** 3

    def step(self, position: float, velocity: float, time: float, dt: float = 0.01) -> tuple[float, float]:
        if dt <= 0:
            raise ValueError("dt must be positive")
        next_velocity = velocity + dt * self.acceleration(position, velocity, time)
        return position + dt * next_velocity, next_velocity
