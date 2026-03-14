/**
 * HAKARI v3 — constants.js (Advanced)
 * ─────────────────────────────────────────────
 * Single source of truth for all system parameters.
 * Designed for research-grade modular AI with memory,
 * meta-optimization, probabilistic reasoning, and task modules.
 *
 * Includes:
 *   - Expanded DECISION parameters
 *   - Adaptive BAYESIAN parameters
 *   - INFORMATION THEORY scaling
 *   - Meta-Learning & Attention coefficients
 *   - Node lifecycle + stochastic modulation
 * ─────────────────────────────────────────────
 */

// ── CORE EQUATION PARAMETERS ──────────────────
export const PARAMS = {
  lambda0: 0.015,     // Base decay rate
  alpha:   0.9,       // Information gain weight
  beta:    0.7,       // Network energy weight
  gamma:   0.6,       // Entropy pressure weight
  kappa:   0.8,       // Reinforcement strength
  sigma:   0.05,      // Stochastic noise amplitude
  delta:   0.4,       // Connectivity decay protection
  epsilon: 1.0,       // Energy scaling factor
  phi:     1.2,       // Query activation influence
  mu:      0.0008,    // Meta-learning rate
  tau:     1.3,       // Retrieval temperature
  theta:   0.85,      // Attention scaling coefficient
  xi:      0.02,      // Stochastic modulation for meta-learning
};

// ── METAOPTIMIZER PARAMETER BOUNDS ────────────
export const PARAM_BOUNDS = {
  lambda0: [0.0001, 0.1],
  alpha:   [0.0,    2.0],
  beta:    [0.0,    2.0],
  gamma:   [0.0,    2.0],
  kappa:   [0.0,    2.0],
  sigma:   [0.0,    0.5],
  delta:   [0.0,    1.0],
  epsilon: [0.1,    3.0],
  phi:     [0.0,    3.0],
  mu:      [0.0001, 0.02],
  tau:     [0.1,    5.0],
  theta:   [0.5,    1.5],
  xi:      [0.0,    0.05],
};

// ── PHYSICS CONSTANTS ─────────────────────────
export const PHYSICS = {
  EPSILON_ENTROPY: 1e-9,
  H_MIN:           0.0,
  H_MAX:           1.0,
  H_COLLAPSE:      0.02,
  E_MAX_FACTOR:    2.0,
  STABILITY_FACTOR:1e-3,
};

// ── ADAPTIVE DECAY COEFFICIENTS ───────────────
export const DECAY = {
  a: 0.3,
  b: 0.2,
  c: 0.25,
  d: 0.15,       // advanced decay modulation
  e: 0.05,       // stochastic fluctuation
};

// ── OBJECTIVE FUNCTION WEIGHTS ────────────────
export const OBJECTIVE = {
  omega_I: 1.0,
  omega_S: 0.8,
  omega_C: 1.2,
  omega_M: 1.1,  // meta-objective weight
};

// ── NODE LIFECYCLE CONSTANTS ──────────────────
export const NODES = {
  INITIAL_SPAWN: 18,
  SPAWN_BATCH:   6,
  MAX:           150,     // raised node cap for large-scale experiments
  INIT_STRENGTH: 0.55,
  INIT_LAMBDA:   0.015,
  ATTENTION_BIAS:0.1,     // initial node attention weight
  MEMORY_RETENTION: 0.85, // how long nodes remember activation
};

// ── TIMING CONSTANTS ──────────────────────────
export const TIMING = {
  TARGET_FPS:       60,
  DT_FIXED:         1 / 60,
  MEMORY_INTERVAL:  30,
  COMPRESS_INTERVAL:150,
  CONSOLIDATE_EVERY:200,
  METAOPT_INTERVAL: 50,   // meta-optimization frequency
};

// ── DECISION THEORY PARAMETERS ────────────────
export const DECISION = {
  RISK_AVERSION:   0.5,
  UTILITY_SCALE:   1.0,
  TEMPERATURE:     0.5,
  EPSILON_EXPLORE: 0.05,
  REGRET_DECAY:    0.99,
  DECAY_MODULATOR: 0.02,  // adaptively scale exploration decay
};

// ── BAYESIAN / PROBABILISTIC PARAMETERS ───────
export const BAYESIAN = {
  PRIOR_STRENGTH:   1.0,
  BELIEF_FLOOR:     1e-6,
  POSTERIOR_SMOOTH: 0.01,
  LOG_DOMAIN:       true,
  VARIANCE_SCALE:   0.05,   // modulate posterior uncertainty
};

// ── INFORMATION THEORY PARAMETERS ─────────────
export const INFORMATION = {
  KL_REGULARIZER: 0.1,
  JS_DISTANCE_CAP: 0.693,
  MI_FLOOR:        1e-8,
  ENTROPY_BITS:    false,
  ATTENTION_GAIN:  1.2,   // scales node information weighting
  INFO_DECAY:      0.98,  // decay factor for historical info
};

// ── NUMERICAL STABILITY PARAMETERS ────────────
export const NUMERICS = {
  LOG_EPS:      1e-12,
  EXP_CLAMP:    500,
  GRAD_H:       1e-4,
  GRAD_H_CHECK: 1e-5,
  FLOAT_EPS:    2.22e-16,
  STABILITY_FACTOR: 1e-8,
};

// ── META-LEARNING / ADAPTIVE LEARNING PARAMETERS ──
export const METALEARNING = {
  LR_DECAY:      0.995,   // learning rate decay per cycle
  ATTENTION_LR:  0.001,   // learning rate for attention coefficients
  NOISE_SCALE:   0.01,    // stochastic modulation during meta-learning
  ADAPTIVE_PSI:  0.8,     // scaling for meta-adaptive nodes
};