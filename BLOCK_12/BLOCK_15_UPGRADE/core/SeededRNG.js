/**
 * HAKARI v3 â€” core/SeededRNG.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Deterministic pseudo-random number generator.
 * Algorithm: Mulberry32 (fast, high quality, 32-bit)
 *
 * Used by:
 *   NodeFactory  â€” node positions, initial strengths
 *   DecayEngine  â€” stochastic collapse decisions
 *   MetaOptimizer â€” gradient perturbation
 *   ConceptSpace  â€” vector initialisation
 *   HUIE          â€” noise term ÏƒÎ·
 *
 * Global singleton: GLOBAL_RNG
 * Seed via: GLOBAL_RNG.seed(n)
 *
 * All subsystems that need randomness must call
 * rng() instead of Math.random() to ensure
 * experiments are reproducible when seeded.
 *
 * Normal random (Box-Muller):
 *   rng.gaussian(mean, std)
 *
 * The singleton is exported so any module can:
 *   import { rng } from './core/SeededRNG.js';
 *   const x = rng();
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

export class SeededRNG {

  /**
   * @param {number} seed â€” integer seed value
   */
  constructor(seed = 42) {
    this._seed = seed >>> 0;  // force uint32
    this._s    = this._seed;
    this._gaussSpare = null;
    this._hasSpare   = false;
  }

  // â”€â”€ SEED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Re-seed the generator. All subsequent calls
   * to rng() will produce the same sequence.
   * @param {number} seed
   */
  seed(s) {
    this._seed      = s >>> 0;
    this._s         = this._seed;
    this._hasSpare  = false;
    this._gaussSpare = null;
  }

  /**
   * Current seed value (for saving/restoring state).
   * @returns {number}
   */
  get currentSeed() { return this._seed; }

  // â”€â”€ GENERATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Generate a uniform float in [0, 1).
   * Uses Mulberry32 algorithm.
   * @returns {number}
   */
  random() {
    let t = (this._s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this._s = t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  /**
   * Float in [min, max).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  range(min, max) {
    return min + this.random() * (max - min);
  }

  /**
   * Integer in [min, max] inclusive.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Gaussian sample via Box-Muller transform.
   * Uses spare value to halve generator calls.
   *
   * @param {number} mean
   * @param {number} std
   * @returns {number}
   */
  gaussian(mean = 0, std = 1) {
    if (this._hasSpare) {
      this._hasSpare = false;
      return this._gaussSpare * std + mean;
    }
    let u, v, s;
    do {
      u = this.random() * 2 - 1;
      v = this.random() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mag        = Math.sqrt(-2 * Math.log(s) / s);
    this._gaussSpare = v * mag;
    this._hasSpare   = true;
    return u * mag * std + mean;
  }

  /**
   * Sample from a standard normal distribution (Î¼=0, Ïƒ=1).
   * @returns {number}
   */
  standardNormal() {
    return this.gaussian(0, 1);
  }

  /**
   * Randomly shuffle an array in place (Fisher-Yates).
   * @param {Array} arr
   * @returns {Array} same array, shuffled
   */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Pick a random element from an array.
   * @param {Array} arr
   * @returns {*}
   */
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * Boolean with probability p of being true.
   * @param {number} p â€” probability [0, 1]
   * @returns {boolean}
   */
  chance(p) {
    return this.random() < p;
  }

  // â”€â”€ STATE SNAPSHOT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Save RNG state for later restore.
   * @returns {object}
   */
  save() {
    return { s: this._s, seed: this._seed, hasSpare: this._hasSpare, spare: this._gaussSpare };
  }

  /**
   * Restore a previously saved state.
   * @param {object} state
   */
  restore(state) {
    this._s          = state.s;
    this._seed       = state.seed;
    this._hasSpare   = state.hasSpare;
    this._gaussSpare = state.spare;
  }
}

// â”€â”€ GLOBAL SINGLETON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// All subsystems call rng() for randomness.
// Seeded at startup; re-seed via GLOBAL_RNG.seed(n).

export const GLOBAL_RNG = new SeededRNG(42);

/**
 * Drop-in replacement for Math.random().
 * Replace all Math.random() calls in HAKARI
 * subsystems with rng() for reproducibility.
 * @returns {number} âˆˆ [0, 1)
 */
export function rng() {
  return GLOBAL_RNG.random();
}

