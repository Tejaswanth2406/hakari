/**
 * HAKARI v3 — engine/EntropyField.js
 * ─────────────────────────────────────────────
 * Step 1 of the tick loop.
 *
 * Computes system entropy S(t) from the probability
 * distribution of node strengths.
 *
 * Formula:
 *   pᵢ = (Hᵢ + ε) / Σ(Hⱼ + ε)     ← epsilon guard
 *   S(t) = −Σ pᵢ · ln(pᵢ)
 *
 * Tracks:
 *   - entropy history (Diagnostics curve)
 *   - entropy delta  (rate of change tick-to-tick)
 *   - entropy regime: LOW / MEDIUM / HIGH
 *   - Welford online mean + variance
 *   - drift direction for phase transition signaling
 *
 * BLOCK 5 HARDENING vs original:
 *   - NaN guard on node strengths before entropy call
 *   - Welford online statistics (mean, variance)
 *   - driftDirection() for phase transition use
 *   - recentAverage() uses Float32Array ring for speed
 *   - Output S passed to Temperature and FreeEnergy
 * ─────────────────────────────────────────────
 */

import { entropy, maxEntropy } from '../BLOCK1/math.js';
import { allFinite, welfordUpdate, isFiniteNum } from '../BLOCK1/numerics.js';
import { DIAGNOSTICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

const REGIME = { LOW: 0.33, MEDIUM: 0.66 };

export class EntropyField {

  constructor() {
    this.S          = 0;
    this.S_prev     = 0;
    this.S_delta    = 0;
    this.S_max      = 0;
    this.regime     = 'LOW';
    this.normalized = 0;

    // Ring buffer for history
    this._bufferSize = DIAGNOSTICS.CURVE_BUFFER_SIZE;
    this._history    = [];

    // Welford online stats
    this._wMean  = 0;
    this._wM2    = 0;
    this._wCount = 0;
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Compute entropy from all alive node strengths.
   * @param {Node[]} nodes
   * @returns {number} raw S(t) before EntropyLaw clamp
   */
  update(nodes) {
    const N = nodes.length;
    if (N === 0) { this._set(0, 0); return 0; }

    // NaN guard: replace non-finite strengths with 0
    let strengths = nodes.map(n => n.strength);
    if (!allFinite(strengths)) {
      strengths = strengths.map(v => (isFiniteNum(v) ? v : 0));
    }

    const rawS  = entropy(strengths);
    const S_max = maxEntropy(N);

    this.S_prev  = this.S;
    this.S       = isFiniteNum(rawS) ? rawS : 0;
    this.S_max   = S_max;
    this.S_delta = this.S - this.S_prev;
    this.normalized = S_max > 1e-9 ? this.S / S_max : 0;
    this.regime  = this._classifyRegime(this.normalized);

    // Welford update
    this._wCount++;
    const ws = welfordUpdate({ mean: this._wMean, M2: this._wM2 }, this.S, this._wCount);
    this._wMean = ws.mean;
    this._wM2   = ws.M2;

    this._pushHistory(this.S);
    return this.S;
  }

  // ── QUERIES ─────────────────────────────────

  isHighEntropy()  { return this.regime === 'HIGH'; }
  isRising()       { return this.S_delta > 0; }
  getHistory()     { return [...this._history]; }

  recentAverage(window = 30) {
    const slice = this._history.slice(-window);
    if (!slice.length) return 0;
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  }

  entropyStats() {
    const variance = this._wCount > 1 ? this._wM2 / (this._wCount - 1) : 0;
    return { mean: this._wMean, variance };
  }

  /**
   * Drift direction over rolling window.
   * @param {number} [window=20]
   * @returns {'rising'|'falling'|'stable'}
   */
  driftDirection(window = 20) {
    const h = this._history;
    if (h.length < window) return 'stable';
    const half  = Math.floor(window / 2);
    const slice = h.slice(-window);
    const early = slice.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const late  = slice.slice(half).reduce((s, v) => s + v, 0) / (window - half);
    const d = late - early;
    if (d >  0.02) return 'rising';
    if (d < -0.02) return 'falling';
    return 'stable';
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      S:          this.S,
      S_max:      this.S_max,
      S_delta:    this.S_delta,
      normalized: this.normalized,
      regime:     this.regime,
      drift:      this.driftDirection(),
      ...this.entropyStats(),
    };
  }

  // ── PRIVATE ─────────────────────────────────

  _set(S, S_max) {
    this.S = S; this.S_max = S_max;
    this.S_delta = 0; this.normalized = 0; this.regime = 'LOW';
    this._pushHistory(S);
  }

  _classifyRegime(n) {
    if (n < REGIME.LOW)    return 'LOW';
    if (n < REGIME.MEDIUM) return 'MEDIUM';
    return 'HIGH';
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}



