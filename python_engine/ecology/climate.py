"""Climate forcing and seasonal temperature dynamics."""

from __future__ import annotations

from dataclasses import dataclass
import math


@dataclass
class ClimateState:
    baseline_temperature: float = 288.15
    forcing: float = 0.0
    season_amplitude: float = 8.0
    period: float = 365.0

    def temperature_at(self, time: float) -> float:
        return self.baseline_temperature + self.forcing + self.season_amplitude * math.sin(2.0 * math.pi * time / self.period)

    def apply_forcing(self, delta: float) -> float:
        self.forcing += delta
        return self.forcing
