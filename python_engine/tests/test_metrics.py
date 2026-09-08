import math

import pytest

from python_engine import calculate_metrics, estimate_true_values, normalize, root_mean_square_error


def test_metrics_contract():
    result = calculate_metrics([1.0, 3.0], [2.0, 5.0], 0.7)

    assert result["normalized_predictions"] == [0.0, 1.0]
    assert result["normalized_observations"] == [0.0, 1.0]
    assert result["true_values"] == [1.7, 4.4]
    assert math.isclose(result["rmse"], 1.106797181058933)


def test_metrics_validate_series_lengths():
    with pytest.raises(ValueError):
        estimate_true_values([1.0], [1.0, 2.0])
    with pytest.raises(ValueError):
        root_mean_square_error([1.0], [1.0, 2.0])


def test_constant_normalization_is_zero():
    assert normalize([4.0, 4.0]) == [0.0, 0.0]