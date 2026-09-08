"""Memory retention, retrieval reinforcement, and adaptive decay."""

from __future__ import annotations

from dataclasses import dataclass
import math


@dataclass
class MemoryRecord:
    key: str
    value: object
    strength: float = 1.0
    importance: float = 0.5
    retrievals: int = 0


class DecayingMemory:
    """A small memory store with temperature-sensitive retention."""

    def __init__(self, decay_rate: float = 0.05) -> None:
        self.decay_rate = max(0.0, float(decay_rate))
        self.records: dict[str, MemoryRecord] = {}

    def store(self, key: str, value: object, importance: float = 0.5) -> MemoryRecord:
        if not key.strip():
            raise ValueError("memory key must not be empty")
        record = MemoryRecord(key, value, 1.0, max(0.0, min(1.0, importance)))
        self.records[key] = record
        return record

    def retrieve(self, key: str) -> object | None:
        record = self.records.get(key)
        if record is None or record.strength <= 0.0:
            return None
        record.retrievals += 1
        record.strength = min(1.0, record.strength + 0.05 * record.importance)
        return record.value

    def decay(self, dt: float = 1.0, environmental_pressure: float = 0.0) -> None:
        pressure = max(0.0, float(environmental_pressure))
        for record in self.records.values():
            effective_rate = self.decay_rate * (1.0 + pressure) * (1.0 - record.importance)
            record.strength *= math.exp(-effective_rate * max(0.0, dt))

    def snapshot(self) -> dict[str, dict[str, object]]:
        return {
            key: {"value": record.value, "strength": record.strength, "importance": record.importance, "retrievals": record.retrievals}
            for key, record in self.records.items()
        }
