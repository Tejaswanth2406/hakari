"""Information and thermodynamic entropy helpers."""

from __future__ import annotations

import math


def shannon_entropy(probabilities: list[float]) -> float:
    total = sum(max(0.0, value) for value in probabilities)
    if total <= 0.0:
        return 0.0
    return -sum((value / total) * math.log(value / total, 2) for value in probabilities if value > 0.0)


def normalized_entropy(probabilities: list[float]) -> float:
    if len(probabilities) <= 1:
        return 0.0
    return shannon_entropy(probabilities) / math.log(len(probabilities), 2)
