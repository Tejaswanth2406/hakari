"""Recurrence plots and basic recurrence quantification measures."""

from __future__ import annotations

import math


def recurrence_matrix(states: list[tuple[float, ...]], threshold: float) -> list[list[int]]:
    if threshold < 0:
        raise ValueError("threshold must be non-negative")
    return [[int(math.dist(left, right) <= threshold) for right in states] for left in states]


def recurrence_rate(matrix: list[list[int]]) -> float:
    total = sum(sum(row) for row in matrix)
    size = sum(len(row) for row in matrix)
    return total / size if size else 0.0
