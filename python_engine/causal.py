"""Directed causal graph with observational and intervention evaluation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class CausalNode:
    name: str
    value: float = 0.0
    parents: set[str] = field(default_factory=set)


class CausalGraph:
    """Evaluate simple acyclic structural equations."""

    def __init__(self) -> None:
        self.nodes: dict[str, CausalNode] = {}
        self.equations: dict[str, Callable[[dict[str, float]], float]] = {}

    def add_node(self, name: str, value: float = 0.0) -> None:
        self.nodes[name] = CausalNode(name, float(value))

    def add_edge(self, cause: str, effect: str, equation: Callable[[dict[str, float]], float]) -> None:
        if cause not in self.nodes or effect not in self.nodes:
            raise KeyError("causal edges require known nodes")
        self.nodes[effect].parents.add(cause)
        self.equations[effect] = equation

    def run(self, interventions: dict[str, float] | None = None) -> dict[str, float]:
        values = {name: node.value for name, node in self.nodes.items()}
        interventions = interventions or {}
        values.update({name: float(value) for name, value in interventions.items()})
        for name, equation in self.equations.items():
            if name not in interventions:
                values[name] = float(equation(values))
        for name, value in values.items():
            self.nodes[name].value = value
        return values

    def snapshot(self) -> dict[str, object]:
        return {name: {"value": node.value, "parents": sorted(node.parents)} for name, node in self.nodes.items()}
