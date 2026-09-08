"""Parameter sweeps for bifurcation diagrams."""

from __future__ import annotations

from collections.abc import Callable


def scan_parameter(step: Callable[[float, float], float], parameters: list[float], initial: float = 0.5, transient: int = 100, samples: int = 50) -> list[dict[str, object]]:
    if transient < 0 or samples < 1:
        raise ValueError("transient must be non-negative and samples positive")
    results = []
    for parameter in parameters:
        value = initial
        for _ in range(transient):
            value = step(value, parameter)
        values = []
        for _ in range(samples):
            value = step(value, parameter)
            values.append(value)
        results.append({"parameter": parameter, "values": values})
    return results
