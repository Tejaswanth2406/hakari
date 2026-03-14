/**
 * HAKARI v3 — probability.js
 *
 * Pure Bayesian probability layer. Stateless.
 * No imports from engine, nodes, network, or memory.
 *
 * Implements:
 *   - Bayes update (log-domain)
 *   - Distribution normalization (safe)
 *   - Log-likelihood computation
 *   - Categorical sampling
 *   - Prior / posterior utilities
 * 
 */

import { logSumExp, safeLog } from '../BLOCK1/numerics.js';
import { sampleUniform } from '../BLOCK1/random.js';


/**
 * Bayesian update in probability domain.
 *
 * P(H|D) ∝ P(D|H) · P(H)
 *
 * Returns a normalized posterior distribution.
 *
 * @param {number[]} prior       P(H)   — prior distribution over hypotheses
 * @param {number[]} likelihood  P(D|H) — likelihood of data given each hypothesis
 * @returns {number[]} posterior — normalized P(H|D)
 */
export function bayesUpdate(prior, likelihood) {
  if (prior.length !== likelihood.length) {
    throw new Error(`bayesUpdate: dimension mismatch (${prior.length} vs ${likelihood.length})`);
  }
  const unnorm = prior.map((p, i) => p * likelihood[i]);
  return normalizeDistribution(unnorm);
}

/**
 * Bayesian update in log domain for numerical stability.
 * Preferred over bayesUpdate() for small probabilities.
 *
 * logP(H|D) = logP(D|H) + logP(H) − logZ
 *
 * @param {number[]} logPrior      log P(H)
 * @param {number[]} logLikelihood log P(D|H)
 * @returns {number[]} normalized log posterior log P(H|D)
 */
export function bayesUpdateLog(logPrior, logLikelihood) {
  if (logPrior.length !== logLikelihood.length) {
    throw new Error(`bayesUpdateLog: dimension mismatch`);
  }
  const logUnnorm = logPrior.map((lp, i) => lp + logLikelihood[i]);
  const logZ = logSumExp(logUnnorm);
  return logUnnorm.map(lu => lu - logZ);
}

// DISTRIBUTION NORMALIZATION 

/**
 * Normalize an array of non-negative values to a valid
 * probability distribution summing to 1.
 *
 * Adds epsilon guard to prevent zero-division.
 * Clamps negatives to 0 before normalization.
 *
 * @param {number[]} dist  — unnormalized weights
 * @param {number}   [eps=1e-12]
 * @returns {number[]}     — normalized P ∈ [0,1], Σ = 1
 */
export function normalizeDistribution(dist, eps = 1e-12) {
  const clamped = dist.map(v => Math.max(0, v));
  const total   = clamped.reduce((s, v) => s + v, 0) + eps;
  return clamped.map(v => v / total);
}

/**
 * Normalize a log-distribution.
 * Returns an array of probabilities (not log).
 *
 * @param {number[]} logDist
 * @returns {number[]} normalized probabilities
 */
export function normalizeLogDistribution(logDist) {
  const logZ = logSumExp(logDist);
  return logDist.map(ld => Math.exp(ld - logZ));
}

//  LOG-LIKELIHOOD 

/**
 * Gaussian log-likelihood of observed value x
 * under N(mu, sigma).
 *
 * logL = −0.5 · log(2π·σ²) − (x−μ)² / (2σ²)
 *
 * @param {number} x      observed value
 * @param {number} mu     distribution mean
 * @param {number} sigma  distribution std dev (> 0)
 * @returns {number} log P(x | mu, sigma)
 */
export function gaussianLogLikelihood(x, mu, sigma) {
  const s2 = Math.max(sigma * sigma, 1e-12);
  return -0.5 * Math.log(2 * Math.PI * s2) - ((x - mu) ** 2) / (2 * s2);
}

/**
 * Categorical log-likelihood.
 * log P(x = category) under distribution probs.
 *
 * @param {number}   category  index of observed category
 * @param {number[]} probs     probability distribution over categories
 * @returns {number}
 */
export function categoricalLogLikelihood(category, probs) {
  return safeLog(probs[category]);
}

/**
 * Joint log-likelihood of N independent observations
 * from a Gaussian distribution.
 *
 * @param {number[]} observations
 * @param {number}   mu
 * @param {number}   sigma
 * @returns {number}
 */
export function jointGaussianLogLikelihood(observations, mu, sigma) {
  return observations.reduce((sum, x) => sum + gaussianLogLikelihood(x, mu, sigma), 0);
}

//  CATEGORICAL SAMPLING 
/**
 * Sample a category index from a probability distribution.
 * Uses linear scan with cumulative probability.
 *
 * @param {number[]} probs  normalized probability distribution
 * @param {Function} [rng]  optional RNG returning [0,1) — defaults to Math.random
 * @returns {number} sampled index ∈ [0, probs.length − 1]
 */
export function sampleCategorical(probs, rng = sampleUniform) {
  const u = rng();
  let cumulative = 0;
  for (let i = 0; i < probs.length; i++) {
    cumulative += probs[i];
    if (u < cumulative) return i;
  }
  return probs.length - 1; // float guard
}

/**
 * Sample from a log-probability distribution.
 * Converts to probs then samples categorically.
 *
 * @param {number[]} logProbs
 * @param {Function} [rng]
 * @returns {number} sampled index
 */
export function sampleFromLogDist(logProbs, rng = sampleUniform) {
  const probs = normalizeLogDistribution(logProbs);
  return sampleCategorical(probs, rng);
}

//  BELIEF STATE UTILITIES 

/**
 * Compute the entropy of a probability distribution.
 * H(P) = −Σ pᵢ · log(pᵢ)
 *
 * @param {number[]} probs  normalized distribution
 * @param {number}   [eps=1e-12]
 * @returns {number} entropy in nats
 */
export function distributionEntropy(probs, eps = 1e-12) {
  return -probs.reduce((sum, p) => {
    const pc = Math.max(p, eps);
    return sum + pc * Math.log(pc);
  }, 0);
}

/**
 * Check if a distribution is sufficiently peaked
 * (belief is confident) based on entropy threshold.
 *
 * @param {number[]} probs
 * @param {number}   threshold  max allowed entropy
 * @returns {boolean}
 */
export function isConfident(probs, threshold) {
  return distributionEntropy(probs) <= threshold;
}

/**
 * Maximum a posteriori (MAP) estimate.
 * Returns the index with the highest probability.
 *
 * @param {number[]} probs
 * @returns {number} argmax index
 */
export function mapEstimate(probs) {
  let best = 0;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[best]) best = i;
  }
  return best;
}

/**
 * Uniform prior distribution over N hypotheses.
 *
 * @param {number} N  number of hypotheses
 * @returns {number[]} uniform distribution
 */
export function uniformPrior(N) {
  return Array(N).fill(1 / N);
}

