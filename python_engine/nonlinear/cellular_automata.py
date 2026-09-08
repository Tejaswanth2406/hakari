"""Binary cellular automata with configurable local rules."""

from __future__ import annotations


def step_automaton(cells: list[int], rule: int = 30) -> list[int]:
    if rule < 0 or rule > 255 or not cells:
        raise ValueError("rule must be in [0, 255] and cells must be non-empty")
    next_cells = []
    for index in range(len(cells)):
        left = cells[index - 1] if index else 0
        center = cells[index]
        right = cells[index + 1] if index + 1 < len(cells) else 0
        pattern = (left << 2) | (center << 1) | right
        next_cells.append((rule >> pattern) & 1)
    return next_cells


def evolve(cells: list[int], steps: int, rule: int = 30) -> list[list[int]]:
    history = [list(cells)]
    for _ in range(steps):
        history.append(step_automaton(history[-1], rule))
    return history
