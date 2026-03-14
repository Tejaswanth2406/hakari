/**
 * HAKARI v3 — numerics.js
 * ─────────────────────────────────────────────
 * Numerical stability layer. Stateless. Pure.
 * No other HAKARI module imports here.
 *
 * Implements:
 *   - logSumExp (the log-sum-exp trick)
 *   - safeLog / safeExp
 *   - Stable softmax
 *   - Finite difference gradient estimation
 *   - Safe division
 *   - Numerical gradient checking
 * ─────────────────────────────────────────────
 */

// ── LOG-SUM-EXP TRICK ─────────────────────────

/**
 * Numerically stable log-sum-exp.
 *
 * log(Σᵢ exp(xᵢ)) = max + log(Σᵢ exp(xᵢ − max))
 *
 * Essential for Bayesian computations in log domain.
 * Prevents overflow/underflow.
 *
 * @param {number[]} logValues  array of log-space values
 * @returns {number}            log(Σ exp(xᵢ))
 */
export function logSumExp(logValues) {
  if (logValues.length === 0) return -Infinity;
  const max = Math.max(...logValues);
  if (!isFinite(max)) return max;
  const sumExp = logValues.reduce((s, lv) => s + Math.exp(lv - max), 0);
  return max + Math.log(sumExp);
}

/**
 * Log-sum-exp of exactly two values (optimized path).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function logSumExp2(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return hi + Math.log1p(Math.exp(lo - hi));
}

// ── SAFE LOGARITHM / EXPONENT ─────────────────

/**
 * Safely compute log(x), guarding against log(0) = -∞.
 *
 * @param {number} x
 * @param {number} [eps=1e-12]  floor applied before log
 * @returns {number}
 */
export function safeLog(x, eps = 1e-12) {
  return Math.log(Math.max(x, eps));
}

/**
 * Safely compute exp(x), clamping to prevent overflow.
 *
 * @param {number} x
 * @param {number} [maxX=500]  clamp input to avoid Infinity
 * @returns {number}
 */
export function safeExp(x, maxX = 500) {
  return Math.exp(Math.max(-maxX, Math.min(maxX, x)));
}

/**
 * Safe division with epsilon guard.
 *
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} [eps=1e-12]
 * @returns {number}
 */
export function safeDiv(numerator, denominator, eps = 1e-12) {
  return numerator / (Math.abs(denominator) < eps ? Math.sign(denominator) * eps : denominator);
}

// ── STABLE SOFTMAX ────────────────────────────

/**
 * Numerically stable softmax using max-shift trick.
 *
 * Equivalent to math.js softmax but importable by modules
 * that only depend on numerics (preventing circular import).
 *
 * @param {number[]} logits
 * @returns {number[]} probability distribution
 */
export function stableSoftmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v - max));
  const sum  = exps.reduce((s, e) => s + e, 0) + 1e-12;
  return exps.map(e => e / sum);
}

/**
 * Log-softmax — numerically stable log of softmax output.
 *
 * logSoftmax(xᵢ) = xᵢ − log(Σⱼ exp(xⱼ))
 *                = xᵢ − logSumExp(x)
 *
 * @param {number[]} logits
 * @returns {number[]} log-probability distribution
 */
export function logSoftmax(logits) {
  const lse = logSumExp(logits);
  return logits.map(x => x - lse);
}

// ── FINITE DIFFERENCE GRADIENT ────────────────

/**
 * Estimate the gradient of a scalar function f
 * at point x using central finite differences.
 *
 * ∂f/∂xᵢ ≈ [f(x + hᵢ) − f(x − hᵢ)] / (2h)
 *
 * @param {Function}  f     scalar-valued function f(x: number[]) → number
 * @param {number[]}  x     parameter vector
 * @param {number}    [h=1e-4]  step size
 * @returns {number[]}  gradient vector ∇f(x)
 */
export function finiteDifferenceGradient(f, x, h = 1e-4) {
  return x.map((xi, i) => {
    const xPlus  = [...x]; xPlus[i]  = xi + h;
    const xMinus = [...x]; xMinus[i] = xi - h;
    return (f(xPlus) - f(xMinus)) / (2 * h);
  });
}

/**
 * Forward finite difference gradient (cheaper, less accurate).
 *
 * ∂f/∂xᵢ ≈ [f(x + hᵢ) − f(x)] / h
 *
 * @param {Function}  f
 * @param {number[]}  x
 * @param {number}    [h=1e-4]
 * @returns {number[]}
 */
export function forwardDifferenceGradient(f, x, h = 1e-4) {
  const fx = f(x);
  return x.map((xi, i) => {
    const xPlus = [...x]; xPlus[i] = xi + h;
    return (f(xPlus) - fx) / h;
  });
}

/**
 * Numerical gradient check.
 * Compares analytical gradient to finite difference estimate.
 * Returns max absolute difference per dimension.
 *
 * @param {number[]} analytical   analytically computed gradient
 * @param {Function} f            scalar function for numerical estimate
 * @param {number[]} x            point of evaluation
 * @param {number}   [h=1e-5]
 * @returns {{ maxError: number, errors: number[] }}
 */
export function gradientCheck(analytical, f, x, h = 1e-5) {
  const numerical = finiteDifferenceGradient(f, x, h);
  const errors = analytical.map((g, i) => Math.abs(g - numerical[i]));
  return {
    maxError: Math.max(...errors),
    errors,
    analytical,
    numerical,
  };
}

// ── NUMERICAL HEALTH CHECKS ───────────────────

/**
 * Check if a value is finite (not NaN, not ±Infinity).
 *
 * @param {number} v
 * @returns {boolean}
 */
export function isFiniteNum(v) {
  return typeof v === 'number' && isFinite(v) && !isNaN(v);
}

/**
 * Assert all values in an array are finite.
 * Returns false if any value is NaN or Infinite.
 *
 * @param {number[]} arr
 * @returns {boolean}
 */
export function allFinite(arr) {
  return arr.every(isFiniteNum);
}

/**
 * Sanitize an array, replacing NaN/Infinity with a fallback.
 *
 * @param {number[]} arr
 * @param {number}   [fallback=0]
 * @returns {number[]}
 */
export function sanitize(arr, fallback = 0) {
  return arr.map(v => isFiniteNum(v) ? v : fallback);
}

/**
 * Running average (online / incremental update).
 * newMean = oldMean + (x − oldMean) / n
 *
 * @param {number} oldMean
 * @param {number} x       new observation
 * @param {number} n       total count including x
 * @returns {number}
 */
export function onlineMean(oldMean, x, n) {
  return oldMean + (x - oldMean) / n;
}

/**
 * Welford's online variance update.
 * Returns updated {mean, M2} — variance = M2 / (n − 1).
 *
 * @param {{ mean: number, M2: number }} state  prior state
 * @param {number} x  new observation
 * @param {number} n  count after this update
 * @returns {{ mean: number, M2: number }}
 */
export function welfordUpdate({ mean, M2 }, x, n) {
  const delta  = x - mean;
  const newMean = mean + delta / n;
  const delta2 = x - newMean;
  return { mean: newMean, M2: M2 + delta * delta2 };
}