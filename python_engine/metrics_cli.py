"""JSON-line bridge for invoking HAKARI's Python metrics from Node or Rust."""

from __future__ import annotations

import json
import sys
from typing import Any

from .simulation_engine import calculate_metrics


def handle(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("operation", "metrics") != "metrics":
        raise ValueError("unsupported operation")
    return calculate_metrics(
        request.get("predictions", []),
        request.get("observations", []),
        request.get("observation_weight", 0.7),
    )


for line in sys.stdin:
    if not line.strip():
        continue
    try:
        print(json.dumps({"ok": True, "result": handle(json.loads(line))}), flush=True)
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}), flush=True)