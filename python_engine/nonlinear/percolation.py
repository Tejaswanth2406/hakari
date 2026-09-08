"""Site percolation connectivity and cluster utilities."""

from __future__ import annotations

from collections import deque


def percolates(grid: list[list[bool]]) -> bool:
    if not grid or not grid[0]:
        return False
    width = len(grid[0])
    queue = deque((0, column) for column, active in enumerate(grid[0]) if active)
    visited = set(queue)
    while queue:
        row, column = queue.popleft()
        if row == len(grid) - 1:
            return True
        for next_row, next_column in ((row - 1, column), (row + 1, column), (row, column - 1), (row, column + 1)):
            if 0 <= next_row < len(grid) and 0 <= next_column < width and grid[next_row][next_column] and (next_row, next_column) not in visited:
                visited.add((next_row, next_column))
                queue.append((next_row, next_column))
    return False
