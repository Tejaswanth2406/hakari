"""Avalanche statistics and simple self-organized criticality tools."""

from __future__ import annotations


def avalanche_sizes(loads: list[float], threshold: float = 1.0) -> list[int]:
    """Return contiguous overload cluster sizes."""
    if threshold <= 0:
        raise ValueError("threshold must be positive")
    sizes, current = [], 0
    for load in loads:
        if load >= threshold:
            current += 1
        elif current:
            sizes.append(current)
            current = 0
    if current:
        sizes.append(current)
    return sizes


def criticality_score(events: list[int]) -> float:
    if not events:
        return 0.0
    mean = sum(events) / len(events)
    variance = sum((event - mean) ** 2 for event in events) / len(events)
    return variance ** 0.5 / mean if mean else 0.0
