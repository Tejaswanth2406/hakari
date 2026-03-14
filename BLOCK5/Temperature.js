/**
 * HAKARI v3 — engine/Temperature.js
 * ─────────────────────────────────────────────
 * Models system temperature T(t).
 * New Hakari module.
 *
 * Temperature controls the thermodynamic regime:
 *
 *   High T → chaotic exploration, rapid structural change
 *   Low T  → stable knowledge, slow evolution
 *
 * Update law:
 *   T(t+1) = T(t) + α·ΔS − β·(T − T_ref)
 *
 * - ΔS > 0 (entropy rising)  → temperature rises
 * - ΔS < 0 (entropy falling) → temperature falls
 * - β term provides mean-reversion to T_ref
 *
 * Temperature is consumed by:
 *   DecayEngine  — modulates collapse probability
 *   FreeEnergy   — T·S term in F = E − T·S
 *   PhaseTransition — determines regime crossings
 * ─────────────────────────────────────────────
 */

import { clamp } from '../BLOCK1/math.js';
import { isFiniteNum } from '../BLOCK1/numerics.js';
import { DIAGNOSTICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class Temperature {

  /**
   * @param {object} [opts]
   * @param {number} opts.T_init   — initial temperature (default 1.0)
   * @param {number} opts.T_ref    — mean-reversion target (default 1.0)
   * @param {number} opts.T_min    — floor (default 0.1)
   * @param {number} opts.T_max    — ceiling (default 5.0)
   * @param {number} opts.alpha    — entropy coupling strength (default 0.4)
   * @param {number} opts.beta     — mean-reversion rate (default 0.05)
   */
  constructor(opts = {}) {
    this.T       = opts.T_init ?? 1.0;
    this.T_ref   = opts.T_ref  ?? 1.0;
    this.T_min   = opts.T_min  ?? 0.1;
    this.T_max   = opts.T_max  ?? 5.0;
    this.alpha   = opts.alpha  ?? 0.4;
    this.beta    = opts.beta   ?? 0.05;

    this.T_prev     = this.T;
    this.T_delta    = 0;
    this.regime     = 'TEMPERATE';   // 'COLD' | 'TEMPERATE' | 'HOT'

    this._history   = [];
    this._bufferSize = DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Advance temperature by one tick.
   *
   * T(t+1) = T + α·ΔS − β·(T − T_ref)
   *
   * @param {number} S_delta  — entropy change this tick (from EntropyField)
   * @param {number} dt       — time step
   * @returns {number} updated temperature T
   */
  update(S_delta, dt) {
    const dS = isFiniteNum(S_delta) ? S_delta : 0;

    const entropyPush     = this.alpha * dS;
    const meanReversion   = this.beta  * (this.T - this.T_ref);

    const dT = (entropyPush - meanReversion) * dt;

    this.T_prev  = this.T;
    this.T       = clamp(this.T + dT, this.T_min, this.T_max);
    this.T_delta = this.T - this.T_prev;
    this.regime  = this._classifyRegime(this.T);

    this._pushHistory(this.T);
    return this.T;
  }

  // ── MANUAL CONTROLS ─────────────────────────

  /**
   * Heat the system (inject thermal energy).
   * Used by UI entropy injection button.
   * @param {number} amount
   */
  heat(amount = 0.5) {
    this.T = clamp(this.T + amount, this.T_min, this.T_max);
  }

  /**
   * Cool the system (stabilize / crystallize).
   * @param {number} amount
   */
  cool(amount = 0.3) {
    this.T = clamp(this.T - amount, this.T_min, this.T_max);
  }

  /**
   * Reset temperature to reference (soft reset).
   */
  reset() {
    this.T = this.T_ref;
  }

  // ── QUERIES ─────────────────────────────────

  isHot()       { return this.regime === 'HOT'; }
  isCold()      { return this.regime === 'COLD'; }
  isTemperate() { return this.regime === 'TEMPERATE'; }

  /**
   * Normalized temperature ∈ [0,1] relative to max.
   */
  normalized() {
    return (this.T - this.T_min) / (this.T_max - this.T_min);
  }

  getHistory() { return [...this._history]; }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      T:          this.T,
      T_ref:      this.T_ref,
      T_delta:    this.T_delta,
      regime:     this.regime,
      normalized: this.normalized(),
    };
  }

  // ── PRIVATE ─────────────────────────────────

  _classifyRegime(T) {
    if (T < this.T_ref * 0.7) return 'COLD';
    if (T > this.T_ref * 1.5) return 'HOT';
    return 'TEMPERATE';
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}



