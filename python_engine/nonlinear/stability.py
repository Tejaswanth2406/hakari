"""Local stability classification from a real 2x2 Jacobian."""

from __future__ import annotations

import math


def classify_linear_stability(jacobian: tuple[tuple[float, float], tuple[float, float]], tolerance: float = 1e-9) -> str:
    a, b = jacobian[0]
    c, d = jacobian[1]
    trace, determinant = a + d, a * d - b * c
    discriminant = trace * trace - 4.0 * determinant
    real_part = trace / 2.0
    if abs(real_part) <= tolerance:
        return "marginal" if determinant > 0 else "unstable"
    if real_part < 0:
        return "stable_focus" if discriminant < 0 else "stable"
    return "unstable_focus" if discriminant < 0 else "unstable"


def spectral_radius(matrix: list[list[float]]) -> float:
    """Power-iteration estimate useful for larger discrete systems."""
    vector = [1.0] * len(matrix)
    for _ in range(50):
        product = [sum(row[index] * vector[index] for index in range(len(vector))) for row in matrix]
        scale = max((abs(value) for value in product), default=0.0)
        if scale == 0.0:
            return 0.0
        vector = [value / scale for value in product]
    return math.sqrt(sum(value * value for value in product))
