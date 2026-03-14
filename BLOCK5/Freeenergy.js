/**
 * HAKARI v3 — engine/FreeEnergy.js
 * ─────────────────────────────────────────────
 * Computes system free energy F.
 * New Hakari module. Inspired by Karl Friston's
 * Free Energy Principle for cognitive systems.
 *
 * Formula:
 *   F = E_network − T · S
 *
 * Where:
 *   E_network = total network energy (from GraphEnergy or EnergyField)
 *   T         = system temperature
 *   S         = system entropy
 *
 * Interpretation:
 *   Low F  → stable, organized knowledge state
 *   High F → unstable, system seeks lower-F configuration
 *
 * The system naturally minimizes free energy over time —
 * this drives self-organization:
 *   - nodes strengthen meaningful connections
 *   - weak nodes collapse
 *   - clusters emerge around coherent concepts
 *
 * Also computes:
 *   - F gradient (ΔF per tick) — instability signal
 *   - F history for diagnostics
 *   - variational bound (surrogate for true F)
 * ─────────────────────────────────────────────
 */

import { clamp } from '../BLOCK1/math.js';
import { isFiniteNum } from '../BLOCK1/numerics.js';
import { DIAGNOSTICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class FreeEnergy {

  constructor() {
    this.F         = 0;    // current free energy
    this.F_prev    = 0;
    this.F_delta   = 0;    // ΔF per tick
    this.F_min     = Infinity;  // historical minimum (best state seen)
    this.F_norm    = 0;    // normalized ∈ [0,1] over recent range

    this._history  = [];
    this._bufferSize = DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Compute free energy for this tick.
   *
   * F = E_network − T · S
   *
   * @param {number} E  — total network / field energy
   * @param {number} T  — system temperature
   * @param {number} S  — system entropy (clamped)
   * @returns {number} F
   */
  update(E, T, S) {
    const energy  = isFiniteNum(E) ? E : 0;
    const temp    = isFiniteNum(T) ? Math.max(T, 0) : 1.0;
    const entropy = isFiniteNum(S) ? S : 0;

    this.F_prev  = this.F;
    this.F       = energy - temp * entropy;
    this.F_delta = this.F - this.F_prev;

    // Track historical minimum (Friston: system drives toward minimum F)
    if (this.F < this.F_min) this.F_min = this.F;

    this._pushHistory(this.F);
    this._updateNorm();

    return this.F;
  }

  // ── VARIATIONAL BOUND ────────────────────────

  /**
   * Variational free energy bound.
   * Adds a KL divergence penalty from belief uncertainty.
   *
   * F_var = F + λ_kl · mean_belief_entropy
   *
   * Lower F_var = better model fit to current state.
   *
   * @param {number} meanBeliefEntropy — from BeliefField
   * @param {number} klWeight          — default 0.2
   * @returns {number}
   */
  variationalBound(meanBeliefEntropy, klWeight = 0.2) {
    const H_belief = isFiniteNum(meanBeliefEntropy) ? meanBeliefEntropy : 0;
    return this.F + klWeight * H_belief;
  }

  // ── SIGNALS ──────────────────────────────────

  /**
   * True if free energy is rising sharply (system destabilizing).
   * @param {number} threshold
   */
  isUnstable(threshold = 0.5) {
    return this.F_delta > threshold;
  }

  /**
   * True if free energy is falling (system self-organizing).
   * @param {number} threshold
   */
  isOrganizing(threshold = 0.1) {
    return this.F_delta < -threshold && this.F > this.F_min;
  }

  /**
   * Distance from historical minimum (0 = best state ever).
   */
  distanceFromMinimum() {
    return isFiniteNum(this.F_min) ? this.F - this.F_min : 0;
  }

  getHistory() { return [...this._history]; }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      F:          this.F,
      F_delta:    this.F_delta,
      F_min:      this.F_min,
      F_norm:     this.F_norm,
      unstable:   this.isUnstable(),
      organizing: this.isOrganizing(),
      distFromMin: this.distanceFromMinimum(),
    };
  }

  // ── PRIVATE ─────────────────────────────────

  _updateNorm() {
    if (this._history.length < 2) { this.F_norm = 0; return; }
    const min = Math.min(...this._history);
    const max = Math.max(...this._history);
    const range = max - min;
    this.F_norm = range > 1e-9 ? clamp((this.F - min) / range, 0, 1) : 0;
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}



