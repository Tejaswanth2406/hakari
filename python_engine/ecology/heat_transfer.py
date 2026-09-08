"""Conduction, radiation, and sensible heat calculations."""

from __future__ import annotations


def conductive_flux(conductivity: float, area: float, temperature_difference: float, distance: float) -> float:
    if distance <= 0:
        raise ValueError("distance must be positive")
    return conductivity * area * temperature_difference / distance


def radiative_flux(emissivity: float, area: float, temperature: float, stefan_boltzmann: float = 5.670374419e-8) -> float:
    return max(0.0, emissivity) * area * stefan_boltzmann * temperature ** 4
