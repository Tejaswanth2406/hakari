/**
 * HAKARI v3 — engine/PhaseTransition.js
 * ─────────────────────────────────────────────
 * Detects thermodynamic phase transitions in the
 * cognitive field. New Hakari module.
 *
 * A phase transition occurs when the system crosses
 * from one qualitative regime to another:
 *
 *   ORDER → CHAOS     : entropy rising, clusters fragmenting
 *   CHAOS → ORDER     : entropy falling, clusters consolidating
 *   EMERGENCE         : free energy minimum reached + cluster growth
 *   COLLAPSE          : free energy spike + mass node loss
 *
 * Detection uses multi-signal fusion:
 *   - entropy regime change (EntropyField)
 *   - temperature regime change (Temperature)
 *   - free energy gradient (FreeEnergy)
 *   - graph coherence gradient (GraphEnergy)
 *   - cluster health (ClusterEntropy)
 *
 * Fires events that the main engine can log and act on.
 * ─────────────────────────────────────────────
 */

import { DIAGNOSTICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';
import { isFiniteNum }  from '../BLOCK1/numerics.js';

// Transition event types
export const TRANSITION = {
  ORDER_TO_CHAOS:  'ORDER_TO_CHAOS',
  CHAOS_TO_ORDER:  'CHAOS_TO_ORDER',
  EMERGENCE:       'EMERGENCE',
  COLLAPSE:        'COLLAPSE',
  STABLE:          'STABLE',
};

export class PhaseTransition {

  constructor() {
    this.currentPhase    = 'ORDER';   // 'ORDER' | 'MIXED' | 'CHAOS'
    this.lastTransition  = null;      // most recent TRANSITION event
    this.transitionHistory = [];      // rolling log

    this._prevEntropyRegime = 'LOW';
    this._prevTRegime       = 'TEMPERATE';
    this._bufferSize        = DIAGNOSTICS.CURVE_BUFFER_SIZE;

    // Smoothed signals for debouncing false positives
    this._entropyRising   = 0;   // exponential smoothed bool
    this._energyFalling   = 0;
    this._collapseSignal  = 0;
    this._smoothing       = 0.2;
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Evaluate all signals and detect phase transitions.
   *
   * @param {object} signals — assembled from all subsystems
   *   signals.entropyRegime    — 'LOW'|'MEDIUM'|'HIGH'
   *   signals.S_delta          — entropy change this tick
   *   signals.T                — current temperature
   *   signals.T_regime         — 'COLD'|'TEMPERATE'|'HOT'
   *   signals.F_delta          — free energy change
   *   signals.coherence        — graph coherence ∈ [0,1]
   *   signals.coherenceGradient— graph energy change
   *   signals.healthScore      — cluster health ∈ [0,1]
   *   signals.collapseRate     — nodes collapsed this tick
   *   signals.nodeCount        — alive node count
   * @returns {string} TRANSITION event type
   */
  update(signals) {
    const {
      entropyRegime = 'LOW',
      S_delta       = 0,
      T_regime      = 'TEMPERATE',
      F_delta       = 0,
      coherence     = 0,
      coherenceGradient = 0,
      healthScore   = 1,
      collapseRate  = 0,
      nodeCount     = 1,
    } = signals;

    const sm = this._smoothing;

    // Smooth binary signals to debounce noise
    this._entropyRising  = sm * (S_delta > 0 ? 1 : 0) + (1 - sm) * this._entropyRising;
    this._energyFalling  = sm * (coherenceGradient < -0.05 ? 1 : 0) + (1 - sm) * this._energyFalling;
    this._collapseSignal = sm * Math.min(collapseRate / Math.max(nodeCount * 0.01, 1), 1)
                         + (1 - sm) * this._collapseSignal;

    // ── Detect transition ─────────────────────
    let event = TRANSITION.STABLE;

    // COLLAPSE: mass death + free energy spike + high entropy
    if (this._collapseSignal > 0.4 && F_delta > 0.3 && entropyRegime === 'HIGH') {
      event = TRANSITION.COLLAPSE;
      this.currentPhase = 'CHAOS';
    }

    // ORDER → CHAOS: entropy climbing, coherence falling, T rising
    else if (
      this._prevEntropyRegime !== 'HIGH' && entropyRegime === 'HIGH' &&
      this._energyFalling > 0.3 &&
      T_regime !== 'COLD'
    ) {
      event = TRANSITION.ORDER_TO_CHAOS;
      this.currentPhase = 'CHAOS';
    }

    // CHAOS → ORDER: entropy falling, coherence recovering
    else if (
      this._prevEntropyRegime === 'HIGH' && entropyRegime !== 'HIGH' &&
      coherenceGradient > 0 &&
      this._collapseSignal < 0.1
    ) {
      event = TRANSITION.CHAOS_TO_ORDER;
      this.currentPhase = 'ORDER';
    }

    // EMERGENCE: low F delta, high coherence, healthy network, low collapse
    else if (
      F_delta < -0.05 &&
      coherence > 0.5 &&
      healthScore > 0.6 &&
      this._collapseSignal < 0.05 &&
      entropyRegime === 'LOW'
    ) {
      event = TRANSITION.EMERGENCE;
      this.currentPhase = 'ORDER';
    }

    // Mixed state
    else if (entropyRegime === 'MEDIUM' || T_regime === 'TEMPERATE') {
      this.currentPhase = 'MIXED';
    }

    // Record
    this._prevEntropyRegime = entropyRegime;
    this._prevTRegime       = T_regime;

    if (event !== TRANSITION.STABLE) {
      const entry = { tick: Date.now(), event, phase: this.currentPhase };
      this.lastTransition = entry;
      this._pushHistory(entry);
    }

    return event;
  }

  // ── QUERIES ─────────────────────────────────

  isInChaos()     { return this.currentPhase === 'CHAOS'; }
  isInOrder()     { return this.currentPhase === 'ORDER'; }
  isEmergent()    { return this.lastTransition?.event === TRANSITION.EMERGENCE; }
  isCollapsing()  { return this.lastTransition?.event === TRANSITION.COLLAPSE; }

  /**
   * Recent transition log.
   * @param {number} n
   * @returns {object[]}
   */
  recentTransitions(n = 10) {
    return this.transitionHistory.slice(-n);
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      currentPhase:    this.currentPhase,
      lastTransition:  this.lastTransition?.event ?? 'STABLE',
      entropyRising:   this._entropyRising,
      collapseSignal:  this._collapseSignal,
      energyFalling:   this._energyFalling,
    };
  }

  // ── PRIVATE ─────────────────────────────────

  _pushHistory(entry) {
    this.transitionHistory.push(entry);
    if (this.transitionHistory.length > this._bufferSize) {
      this.transitionHistory.shift();
    }
  }
}



