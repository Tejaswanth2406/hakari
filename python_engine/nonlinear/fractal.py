"""Fractal dimension estimates from sampled points."""

from __future__ import annotations

import math


def box_counting_dimension(points: list[tuple[float, float]], scales: list[float]) -> float:
    if len(points) < 2 or not scales or any(scale <= 0 for scale in scales):
        raise ValueError("need at least two points and positive scales")
    counts = []
    for scale in scales:
        boxes = {(math.floor(x / scale), math.floor(y / scale)) for x, y in points}
        counts.append((math.log(1.0 / scale), math.log(max(1, len(boxes)))))
    mean_x = sum(x for x, _ in counts) / len(counts)
    mean_y = sum(y for _, y in counts) / len(counts)
    denominator = sum((x - mean_x) ** 2 for x, _ in counts)
    return sum((x - mean_x) * (y - mean_y) for x, y in counts) / denominator if denominator else 0.0
