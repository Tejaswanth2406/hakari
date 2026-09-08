"""Validated numerical metrics shared by Python, JavaScript, and Rust."""

from __future__ import annotations

import math


def _finite_values(values: list[float]) -> list[float]:
    cleaned = [float(value) for value in values]
    if any(not math.isfinite(value) for value in cleaned):
        raise ValueError("values must contain only finite numbers")
    return cleaned


def normalize(values: list[float]) -> list[float]:
    """Normalize a numeric series to [0, 1] with min-max scaling."""
    cleaned = _finite_values(values)
    if not cleaned:
        return []
    low, high = min(cleaned), max(cleaned)
    spread = high - low
    return [0.0 for _ in cleaned] if spread == 0.0 else [
        (value - low) / spread for value in cleaned
    ]


def root_mean_square_error(actual: list[float], predicted: list[float]) -> float:
    """Return RMSE after validating equal-length finite numeric series."""
    observed = _finite_values(actual)
    estimate = _finite_values(predicted)
    if len(observed) != len(estimate):
        raise ValueError("actual and predicted must have the same length")
    if not observed:
        return 0.0
    return math.sqrt(sum((a - p) ** 2 for a, p in zip(observed, estimate)) / len(observed))


def estimate_true_values(
    predictions: list[float],
    observations: list[float],
    observation_weight: float = 0.7,
) -> list[float]:
    """Estimate latent values by blending model predictions and observations."""
    prediction_values = _finite_values(predictions)
    observation_values = _finite_values(observations)
    if len(prediction_values) != len(observation_values):
        raise ValueError("predictions and observations must have the same length")
    weight = max(0.0, min(1.0, float(observation_weight)))
    return [
        (weight * observation) + ((1.0 - weight) * prediction)
        for prediction, observation in zip(prediction_values, observation_values)
    ]


def calculate_metrics(
    predictions: list[float],
    observations: list[float],
    observation_weight: float = 0.7,
) -> dict[str, object]:
    """Return the stable cross-language HAKARI metrics contract."""
    true_values = estimate_true_values(predictions, observations, observation_weight)
    return {
        "normalized_predictions": normalize(predictions),
        "normalized_observations": normalize(observations),
        "true_values": true_values,
        "rmse": root_mean_square_error(true_values, predictions),
        "observation_weight": max(0.0, min(1.0, float(observation_weight))),
    }