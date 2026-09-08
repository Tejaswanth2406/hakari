use hakari_metrics::{estimate_true_values, normalize, rmse};

fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    let predictions = parse_values(arguments.get(1).map(String::as_str).unwrap_or("1,3"));
    let observations = parse_values(arguments.get(2).map(String::as_str).unwrap_or("2,5"));
    let weight = arguments
        .get(3)
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.7);
    let true_values = estimate_true_values(&predictions, &observations, weight).unwrap();
    println!(
        "{{\"normalized_predictions\":{},\"normalized_observations\":{},\"true_values\":{:?},\"rmse\":{}}}",
        json_numbers(&normalize(&predictions).unwrap()),
        json_numbers(&normalize(&observations).unwrap()),
        true_values,
        rmse(&true_values, &predictions).unwrap(),
    );
}

fn parse_values(input: &str) -> Vec<f64> {
    input.split(',').filter_map(|value| value.parse().ok()).collect()
}

fn json_numbers(values: &[f64]) -> String {
    format!("[{}]", values.iter().map(|value| value.to_string()).collect::<Vec<_>>().join(","))
}