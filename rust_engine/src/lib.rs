//! Dependency-free numeric primitives shared by the HAKARI Rust runtime.

pub fn normalize(values: &[f64]) -> Result<Vec<f64>, String> {
    if values.iter().any(|value| !value.is_finite()) {
        return Err("values must contain only finite numbers".into());
    }
    if values.is_empty() {
        return Ok(Vec::new());
    }
    let low = values.iter().copied().fold(f64::INFINITY, f64::min);
    let high = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let spread = high - low;
    if spread == 0.0 {
        return Ok(vec![0.0; values.len()]);
    }
    Ok(values.iter().map(|value| (value - low) / spread).collect())
}

pub fn estimate_true_values(
    predictions: &[f64],
    observations: &[f64],
    observation_weight: f64,
) -> Result<Vec<f64>, String> {
    if predictions.len() != observations.len() {
        return Err("predictions and observations must have the same length".into());
    }
    if predictions.iter().chain(observations).any(|value| !value.is_finite()) {
        return Err("values must contain only finite numbers".into());
    }
    let weight = observation_weight.clamp(0.0, 1.0);
    Ok(predictions
        .iter()
        .zip(observations)
        .map(|(prediction, observation)| {
            (weight * observation) + ((1.0 - weight) * prediction)
        })
        .collect())
}

pub fn rmse(actual: &[f64], predicted: &[f64]) -> Result<f64, String> {
    if actual.len() != predicted.len() {
        return Err("actual and predicted must have the same length".into());
    }
    if actual.iter().chain(predicted).any(|value| !value.is_finite()) {
        return Err("values must contain only finite numbers".into());
    }
    if actual.is_empty() {
        return Ok(0.0);
    }
    Ok((actual
        .iter()
        .zip(predicted)
        .map(|(left, right)| (left - right).powi(2))
        .sum::<f64>()
        / actual.len() as f64)
        .sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_metrics_primitives() {
        assert_eq!(normalize(&[2.0, 4.0, 6.0]).unwrap(), vec![0.0, 0.5, 1.0]);
        let truth = estimate_true_values(&[1.0, 3.0], &[2.0, 5.0], 0.5).unwrap();
        assert_eq!(truth, vec![1.5, 4.0]);
        assert!((rmse(&truth, &[1.0, 3.0]).unwrap() - 0.7905694150).abs() < 1e-9);
    }
}