/**
 * HAKARI v3 — math.js
 * ─────────────────────────────────────────────
 * Pure math layer. Stateless. No imports from
 * other HAKARI modules. Everything else imports
 * from here.
 *
 * Implements:
 *   - Entropy (Shannon, epsilon-guarded)
 *   - Exponential decay
 *   - HUIE master differential
 *   - Adaptive decay constant Λᵢ
 *   - Collapse probability
 *   - Gaussian noise (√dt scaled)
 *   - Softmax
 *   - Cosine similarity
 *   - tanh reinforcement bound
 *   - Clamp / normalize helpers
 *
 * BLOCK 1 HARDENING — preserved pure layer.
 * New math domains live in probability.js,
 * decisionMath.js, information.js, numerics.js.
 * ─────────────────────────────────────────────
 */

// ✅ FIXED: removed import from constants.js entirely.
// math.js must be a pure layer with zero imports.
// Constants are inlined directly below.

// ── Inlined constants (from core/constants.js) ─
const EPSILON_ENTROPY = 1e-9;   // PHYSICS.EPSILON_ENTROPY
const DECAY_a = 0.3;            // DECAY.a  — entropy coefficient
const DECAY_b = 0.2;            // DECAY.b  — error rate coefficient
const DECAY_c = 0.1;            // DECAY.c  — connectivity coefficient

// ── ENTROPY ───────────────────────────────────────────────────────

/**
 * Shannon entropy over an array of node strengths.
 * Epsilon guard prevents log(0).
 *
 * pᵢ = (Hᵢ + ε) / Σ(Hⱼ + ε)
 * S  = −Σ pᵢ · ln(pᵢ)
 *
 * @param {number[]} strengths  — array of Hᵢ values
 * @returns {number} S ∈ [0, ln(N)]
 */
export function entropy(strengths) {
  const eps   = EPSILON_ENTROPY;
  const total = strengths.reduce((s, h) => s + h + eps, 0);
  return -strengths.reduce((sum, h) => {
    const p = (h + eps) / total;
    return sum + p * Math.log(p);
  }, 0);
}

/**
 * Maximum possible entropy for N nodes = ln(N).
 * Used for normalisation and information flow.
 *
 * @param {number} N
 * @returns {number}
 */
export function maxEntropy(N) {
  return N > 1 ? Math.log(N) : 0;
}

// ── EXPONENTIAL DECAY ─────────────────────────────────────────────

/**
 * Classic radioactive / memory decay.
 * N(t) = N₀ · e^(−λ · t)
 *
 * @param {number} N0     initial value
 * @param {number} lambda decay constant
 * @param {number} t      elapsed time
 * @returns {number}
 */
export function exponentialDecay(N0, lambda, t) {
  return N0 * Math.exp(-lambda * t);
}

// ── ADAPTIVE DECAY CONSTANT ───────────────────────────────────────

/**
 * Λᵢ = λ₀ + a·S + b·E_error − c·Cᵢ
 *
 * @param {number} lambda0      base decay (λ₀)
 * @param {number} S            system entropy
 * @param {number} errorRate    node or system error rate
 * @param {number} connectivity Cᵢ — node connectivity score
 * @returns {number} adaptive lambda, floored at 0
 */
export function adaptiveLambda(lambda0, S, errorRate, connectivity) {
  const raw = lambda0
    + DECAY_a * S
    + DECAY_b * errorRate
    - DECAY_c * connectivity;
  return Math.max(0, raw);
}

// ── COLLAPSE PROBABILITY ──────────────────────────────────────────

/**
 * P_collapse = 1 − e^(−Λᵢ · t)
 * Probability that a node has collapsed by time t.
 *
 * @param {number} lambda adaptive decay constant
 * @param {number} t      node age in seconds
 * @returns {number} probability ∈ [0, 1)
 */
export function collapseProb(lambda, t) {
  return 1 - Math.exp(-lambda * t);
}

// ── HUIE MASTER DIFFERENTIAL ─────────────────────────────────────

/**
 * Full HUIE equation — rate of change of node strength.
 *
 * dH/dt = α·I + β·E − γ·S − Λ·H + κ·R + noise + φ·A
 *
 * @param {object} p  — named parameters
 *   p.I      information input for node
 *   p.E      energy from neighbors (β·ΣwH)
 *   p.S      system entropy
 *   p.lambda adaptive decay constant Λᵢ
 *   p.H      current node strength
 *   p.R      reinforcement value (tanh-bounded)
 *   p.noise  pre-computed scaled noise
 *   p.A      query activation score
 *   p.params reference to live PARAMS object
 * @param {number} dt  delta time (seconds)
 * @returns {number} dH — raw change (apply clamp after)
 */
export function huieDifferential({ I, E, S, lambda, H, R, noise, A, params }, dt) {
  const dH =
      params.alpha  * I
    + params.beta   * E
    - params.gamma  * S
    - lambda        * H
    + params.kappa  * R
    + noise
    + params.phi    * A;
  return dH * dt;
}

// ── STOCHASTIC NOISE ──────────────────────────────────────────────

/**
 * Gaussian noise scaled by √dt for Itô consistency.
 * noise = N(0,1) · σ · √dt
 *
 * Uses Box-Muller transform for standard normal sample.
 * For seeded experiments use stochasticNoise() from random.js instead.
 *
 * @param {number} sigma noise amplitude σ
 * @param {number} dt    delta time
 * @returns {number}
 */
export function gaussianNoise(sigma, dt) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
  return z * sigma * Math.sqrt(dt);
}

// ── SOFTMAX ───────────────────────────────────────────────────────

/**
 * Numerically stable softmax.
 * Pᵢ = e^(Aᵢ − max) / Σ e^(Aⱼ − max)
 *
 * @param {number[]} values  activation scores
 * @returns {number[]}       probability distribution
 */
export function softmax(values) {
  const max  = Math.max(...values);
  const exps = values.map(v => Math.exp(v - max));
  const sum  = exps.reduce((s, e) => s + e, 0) + 1e-12;
  return exps.map(e => e / sum);
}

// ── COSINE SIMILARITY ─────────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 * Returns value ∈ [−1, 1]. Returns 0 for zero vectors.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-12 ? 0 : dot / denom;
}

// ── REINFORCEMENT (TANH BOUNDED) ──────────────────────────────────

/**
 * Bounded reinforcement from neighbor activations.
 * Rᵢ = tanh( Σ wᵢⱼ · Aⱼ )
 *
 * @param {Array<{weight: number, activation: number}>} neighbors
 * @returns {number} Rᵢ ∈ (−1, 1)
 */
export function reinforcement(neighbors) {
  const raw = neighbors.reduce((s, n) => s + n.weight * n.activation, 0);
  return Math.tanh(raw);
}

// ── QUERY ACTIVATION ──────────────────────────────────────────────

/**
 * Aᵢ = τ · Hᵢ · Sim(q, vᵢ)
 *
 * @param {number}   tau         retrieval temperature τ
 * @param {number}   strength    node strength Hᵢ
 * @param {number[]} queryVec    query embedding q
 * @param {number[]} nodeVec     node embedding vᵢ
 * @returns {number}
 */
export function queryActivation(tau, strength, queryVec, nodeVec) {
  return tau * strength * cosineSimilarity(queryVec, nodeVec);
}

// ── INFORMATION FLOW ──────────────────────────────────────────────

/**
 * Iᵢ = H_max − S   (information-entropy duality)
 * High entropy → low information value.
 *
 * @param {number} S    system entropy
 * @param {number} N    number of alive nodes
 * @returns {number}    information value ∈ [0, ln(N)]
 */
export function informationValue(S, N) {
  return Math.max(0, maxEntropy(N) - S);
}

// ── ENERGY ────────────────────────────────────────────────────────

/**
 * Eᵢ = ε · Hᵢ
 *
 * @param {number} epsilon energy scaling constant
 * @param {number} H       node strength
 * @returns {number}
 */
export function nodeEnergy(epsilon, H) {
  return epsilon * H;
}

// ── HELPERS ───────────────────────────────────────────────────────

/**
 * Clamp value to [min, max].
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Linear interpolation.
 * @param {number} a
 * @param {number} b
 * @param {number} t  ∈ [0,1]
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Normalize array to [0, 1] range.
 * Returns zero array if all values are equal.
 * @param {number[]} arr
 * @returns {number[]}
 */
export function normalize(arr) {
  const min   = Math.min(...arr);
  const max   = Math.max(...arr);
  const range = max - min;
  if (range < 1e-12) return arr.map(() => 0);
  return arr.map(v => (v - min) / range);
}

/**
 * Compute √N edge cap for graph density.
 * @param {number} N  node count
 * @returns {number}
 */
export function edgeCap(N) {
  return Math.max(1, Math.floor(Math.sqrt(N)));
}