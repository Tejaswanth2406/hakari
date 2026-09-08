"""Shared physical state for an ecological environment."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class EnvironmentState:
    temperature: float = 288.15
    pressure: float = 101325.0
    humidity: float = 0.5
    radiation: float = 200.0
    water: float = 1.0
    nutrients: dict[str, float] = field(default_factory=dict)

    def step(self, heat_input: float = 0.0, water_input: float = 0.0, dt: float = 1.0) -> None:
        if dt < 0:
            raise ValueError("dt must be non-negative")
        self.temperature += heat_input * dt
        self.water = max(0.0, self.water + water_input * dt)
        self.humidity = max(0.0, min(1.0, self.humidity + water_input * 0.01 * dt))

    def snapshot(self) -> dict[str, object]:
        return {"temperature": self.temperature, "pressure": self.pressure, "humidity": self.humidity, "radiation": self.radiation, "water": self.water, "nutrients": dict(self.nutrients)}
