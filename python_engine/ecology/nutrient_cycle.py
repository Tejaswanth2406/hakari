"""Generic nutrient pools and limiting-resource detection."""

from __future__ import annotations


def nutrient_update(pool: dict[str, float], inputs: dict[str, float], outputs: dict[str, float], dt: float = 1.0) -> dict[str, float]:
    names = set(pool) | set(inputs) | set(outputs)
    return {name: max(0.0, pool.get(name, 0.0) + dt * (inputs.get(name, 0.0) - outputs.get(name, 0.0))) for name in names}


def limiting_nutrient(pool: dict[str, float]) -> str | None:
    return min(pool, key=pool.get, default=None)
