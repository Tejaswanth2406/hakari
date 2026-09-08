"""One explicit Gray-Scott reaction-diffusion update."""

from __future__ import annotations


def reaction_diffusion_step(u: list[list[float]], v: list[list[float]], diffusion_u: float = 0.16, diffusion_v: float = 0.08, feed: float = 0.06, kill: float = 0.062, dt: float = 1.0) -> tuple[list[list[float]], list[list[float]]]:
    rows, columns = len(u), len(u[0]) if u else 0
    if not rows or any(len(row) != columns for row in v) or any(len(row) != columns for row in u):
        raise ValueError("u and v must be non-empty rectangular grids")
    def laplacian(grid: list[list[float]], row: int, column: int) -> float:
        center = grid[row][column]
        total = -center
        for next_row, next_column in ((row - 1, column), (row + 1, column), (row, column - 1), (row, column + 1)):
            total += grid[next_row][next_column] if 0 <= next_row < rows and 0 <= next_column < columns else center
        return total
    next_u, next_v = [[0.0] * columns for _ in range(rows)], [[0.0] * columns for _ in range(rows)]
    for row in range(rows):
        for column in range(columns):
            uvv = u[row][column] * v[row][column] ** 2
            next_u[row][column] = u[row][column] + dt * (diffusion_u * laplacian(u, row, column) - uvv + feed * (1 - u[row][column]))
            next_v[row][column] = v[row][column] + dt * (diffusion_v * laplacian(v, row, column) + uvv - (feed + kill) * v[row][column])
    return next_u, next_v
