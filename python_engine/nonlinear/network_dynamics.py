"""State dynamics on a weighted adjacency network."""

from __future__ import annotations


def network_step(state: list[float], adjacency: list[list[float]], local_rate: float = 1.0, coupling: float = 0.1, dt: float = 0.01) -> list[float]:
    if len(state) != len(adjacency) or any(len(row) != len(state) for row in adjacency):
        raise ValueError("adjacency must be square and match state length")
    outputs = []
    for index, value in enumerate(state):
        influence = sum(adjacency[index][neighbor] * (state[neighbor] - value) for neighbor in range(len(state)))
        outputs.append(value + dt * (local_rate * value * (1.0 - value) + coupling * influence))
    return outputs
