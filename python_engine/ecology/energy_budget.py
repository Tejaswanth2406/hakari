"""Energy accounting for environmental and biological flows."""

from __future__ import annotations


def energy_budget(inputs: dict[str, float], outputs: dict[str, float]) -> dict[str, float]:
    incoming = sum(max(0.0, value) for value in inputs.values())
    outgoing = sum(max(0.0, value) for value in outputs.values())
    return {"incoming": incoming, "outgoing": outgoing, "net": incoming - outgoing, "efficiency": outgoing / incoming if incoming else 0.0}
