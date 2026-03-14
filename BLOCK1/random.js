/**
 * HAKARI v3 — random.js
 * ─────────────────────────────────────────────
 * Deterministic random number generation layer.
 * Stateless API — state is held by the RNG instance.
 * No imports from engine, nodes, network, or memory.
 *
 * Implements:
 *   - Mulberry32 seeded PRNG (fast, well-distributed)
 *   - Gaussian sampling (Box-Muller)
 *   - Uniform [0,1) sampling
 *   - Integer range sampling
 *   - Dirichlet sampling
 *   - Global seedable RNG for experiments
 * ─────────────────────────────────────────────
 */

// ── SEEDED PRNG — MULBERRY32 ──────────────────

/**
 * Create a seeded Mulberry32 PRNG.
 * Fast, high quality 32-bit PRNG with period 2³².
 *
 * @param {number} seed  integer seed (use integer for reproducibility)
 * @returns {Function}   prng() → float ∈ [0, 1)
 */
export function createRNG(seed) {
  let s = seed >>> 0; // ensure 32-bit unsigned
  return function mulberry32() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── GLOBAL RNG ────────────────────────────────

/** Module-level global RNG. Defaults to Math.random. */
let _globalRNG = Math.random;

/**
 * Seed the global RNG for reproducible experiments.
 *
 * @param {number} seed
 */
export function seedGlobal(seed) {
  _globalRNG = createRNG(seed);
}

/**
 * Reset global RNG to Math.random (non-deterministic).
 */
export function resetGlobal() {
  _globalRNG = Math.random;
}

/**
 * Sample from the global RNG.
 * Use as default rng parameter in stochastic functions.
 *
 * @returns {number} ∈ [0, 1)
 */
export function sampleUniform() {
  return _globalRNG();
}

// ── UNIFORM SAMPLING ──────────────────────────

/**
 * Sample a float uniformly from [min, max).
 *
 * @param {number}   min
 * @param {number}   max
 * @param {Function} [rng=sampleUniform]
 * @returns {number}
 */
export function uniformFloat(min, max, rng = sampleUniform) {
  return min + rng() * (max - min);
}

/**
 * Sample an integer uniformly from [min, max] inclusive.
 *
 * @param {number}   min
 * @param {number}   max
 * @param {Function} [rng=sampleUniform]
 * @returns {number}
 */
export function uniformInt(min, max, rng = sampleUniform) {
  return Math.floor(min + rng() * (max - min + 1));
}

// ── GAUSSIAN SAMPLING ─────────────────────────

/**
 * Sample from N(0, 1) using Box-Muller transform.
 *
 * @param {Function} [rng=sampleUniform]
 * @returns {number}
 */
export function sampleStandardNormal(rng = sampleUniform) {
  const u1 = Math.max(rng(), 1e-12); // guard log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Sample from N(mu, sigma²).
 *
 * @param {number}   mu     mean
 * @param {number}   sigma  standard deviation (> 0)
 * @param {Function} [rng]
 * @returns {number}
 */
export function sampleGaussian(mu, sigma, rng = sampleUniform) {
  return mu + sigma * sampleStandardNormal(rng);
}

/**
 * Sample Gaussian noise scaled by √dt (Itô consistent).
 * noise = N(0,1) · sigma · √dt
 *
 * Mirrors gaussianNoise() in math.js but uses seeded RNG.
 *
 * @param {number}   sigma  noise amplitude
 * @param {number}   dt     time step
 * @param {Function} [rng]
 * @returns {number}
 */
export function stochasticNoise(sigma, dt, rng = sampleUniform) {
  return sampleStandardNormal(rng) * sigma * Math.sqrt(dt);
}

// ── VECTOR SAMPLING ───────────────────────────

/**
 * Sample N values from N(0, 1).
 *
 * @param {number}   N
 * @param {Function} [rng]
 * @returns {number[]}
 */
export function sampleNormalVector(N, rng = sampleUniform) {
  return Array.from({ length: N }, () => sampleStandardNormal(rng));
}

/**
 * Sample a random unit vector in R^N.
 * Samples from N(0,1) and normalizes.
 *
 * @param {number}   N
 * @param {Function} [rng]
 * @returns {number[]}
 */
export function sampleUnitVector(N, rng = sampleUniform) {
  const raw  = sampleNormalVector(N, rng);
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0)) + 1e-12;
  return raw.map(v => v / norm);
}

// ── DIRICHLET SAMPLING ────────────────────────

/**
 * Sample from a symmetric Dirichlet distribution Dir(α).
 * Used for generating random probability distributions.
 *
 * Approximation: sample Gamma(α, 1) via Marsaglia-Tsang, then normalize.
 * For small α (< 1), uses a simple rejection-free approximation.
 *
 * @param {number}   K      dimension (number of categories)
 * @param {number}   alpha  concentration parameter (> 0)
 * @param {Function} [rng]
 * @returns {number[]} probability simplex of length K
 */
export function sampleDirichlet(K, alpha, rng = sampleUniform) {
  // Gamma approximation via log-normal for alpha > 0.5
  // For small alpha, use the stick-breaking approximation
  const gammas = Array.from({ length: K }, () => sampleGamma(alpha, rng));
  const total  = gammas.reduce((s, g) => s + g, 0) + 1e-12;
  return gammas.map(g => g / total);
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia-Tsang method.
 *
 * @param {number}   shape  α > 0
 * @param {Function} [rng]
 * @returns {number}
 */
export function sampleGamma(shape, rng = sampleUniform) {
  if (shape < 1) {
    // Boost: Gamma(α) = Gamma(α+1) · U^(1/α)
    return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    const x2 = x * x;
    if (u < 1 - 0.0331 * x2 * x2) return d * v;
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
  }
}

// ── SHUFFLING ─────────────────────────────────

/**
 * Fisher-Yates shuffle (in-place).
 *
 * @param {any[]}    arr  array to shuffle
 * @param {Function} [rng]
 * @returns {any[]}  same array, shuffled
 */
export function shuffleInPlace(arr, rng = sampleUniform) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Shuffle a copy of an array (non-mutating).
 *
 * @param {any[]}    arr
 * @param {Function} [rng]
 * @returns {any[]}
 */
export function shuffle(arr, rng = sampleUniform) {
  return shuffleInPlace([...arr], rng);
}

/**
 * Sample K items from arr without replacement.
 *
 * @param {any[]}    arr
 * @param {number}   K
 * @param {Function} [rng]
 * @returns {any[]}
 */
export function sampleWithoutReplacement(arr, K, rng = sampleUniform) {
  const copy = [...arr];
  shuffleInPlace(copy, rng);
  return copy.slice(0, Math.min(K, copy.length));
}