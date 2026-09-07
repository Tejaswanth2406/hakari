"""Probabilistic knowledge evolution model used by HAKARI integrations."""

from __future__ import annotations

from dataclasses import dataclass, field
import math
import random
from typing import Any


@dataclass
class KnowledgeNode:
    """A concept with a mutable strength and propagation links."""

    name: str
    strength: float = 1.0
    links: dict[str, float] = field(default_factory=dict)


class KnowledgeSimulation:
    """Model knowledge propagation, decay, and information entropy."""

    def __init__(self, seed: int | None = None, decay_rate: float = 0.02) -> None:
        self._random = random.Random(seed)
        self.decay_rate = max(0.0, min(decay_rate, 1.0))
        self.tick = 0
        self.nodes: dict[str, KnowledgeNode] = {}

    def add_node(self, name: str, strength: float = 1.0) -> dict[str, Any]:
        """Create or reinforce a concept and return its serialized state."""
        if not name or not name.strip():
            raise ValueError("name must not be empty")
        node = self.nodes.setdefault(name.strip(), KnowledgeNode(name=name.strip()))
        node.strength = max(0.0, min(float(strength), 1.0))
        return self.snapshot()

    def connect(self, source: str, target: str, weight: float = 0.5) -> None:
        """Connect two known concepts with a bounded propagation weight."""
        if source not in self.nodes or target not in self.nodes:
            raise KeyError("source and target must be existing nodes")
        self.nodes[source].links[target] = max(0.0, min(float(weight), 1.0))

    def step(self, evidence: dict[str, float] | None = None) -> dict[str, Any]:
        """Advance one tick using evidence, propagation, and exponential decay."""
        evidence = evidence or {}
        incoming = {name: 0.0 for name in self.nodes}

        for source in self.nodes.values():
            for target, weight in source.links.items():
                incoming[target] += source.strength * weight * 0.1

        for name, node in self.nodes.items():
            observed = max(0.0, float(evidence.get(name, 0.0)))
            node.strength = max(
                0.0,
                min(1.0, node.strength * (1.0 - self.decay_rate) + incoming[name] + observed),
            )

        self.tick += 1
        return self.snapshot()

    def entropy(self) -> float:
        """Return Shannon entropy over the current normalized knowledge field."""
        total = sum(node.strength for node in self.nodes.values())
        if total <= 0.0:
            return 0.0
        return -sum(
            (node.strength / total) * math.log2(node.strength / total)
            for node in self.nodes.values()
            if node.strength > 0.0
        )

    def snapshot(self) -> dict[str, Any]:
        """Return JSON-compatible simulation state."""
        return {
            "tick": self.tick,
            "decay_rate": self.decay_rate,
            "entropy": self.entropy(),
            "nodes": {
                name: {"strength": node.strength, "links": dict(node.links)}
                for name, node in self.nodes.items()
            },
        }
