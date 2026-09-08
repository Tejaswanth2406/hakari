"""Simple trajectory-based attractor classification."""

from __future__ import annotations


def classify_attractor(values: list[float], tolerance: float = 1e-5) -> str:
    if len(values) < 4:
        return "insufficient_data"
    tail = values[len(values) // 2:]
    if max(tail) - min(tail) <= tolerance:
        return "fixed_point"
    rounded = [round(value, 6) for value in tail]
    for period in range(2, min(16, len(rounded) // 2 + 1)):
        if all(abs(rounded[index] - rounded[index - period]) <= tolerance for index in range(period, len(rounded))):
            return "periodic"
    return "complex_or_chaotic"
