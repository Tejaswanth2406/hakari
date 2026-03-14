/**
 * HAKARI v3 — debug/SystemStabilityAnalyzer.js
 * ─────────────────────────────────────────────
 * Detects cognitive phase transitions by computing
 * rolling statistical variance across key system
 * metrics. Identifies three operational regimes:
 *
 *   STABLE    — low variance, system in equilibrium
 *   CRITICAL  — variance spiking, edge of chaos
 *   CHAOTIC   — high variance, system destabilising
 *
 * Also computes:
 *   - Stability score ∈ [0, 1]  (1 = most stable)
 *   - Variance per metric
 *   - Rate of change (velocity) per metric
 *   - Early warning signals (critical slowing down)
 *
 * Critical slowing down (CSD) is a statistical
 * precursor to phase transitions — autocorrelation
 * of a metric rises sharply before a tipping point.
 * Used in climate science and neuroscience to
 * predict collapses before they happen.
 *
 * Rolling window: WINDOW_SIZE = 200 ticks.
 * ─────────────────────────────────────────────
 */

const WINDOW_SIZE     = 200;  // rolling analysis window
const STABLE_THRESH   = 0.02; // variance below = stable
const CHAOTIC_THRESH  = 0.08; // variance above = chaotic
const CSD_WINDOW      = 30;   // autocorrelation window for CSD
const CSD_THRESHOLD   = 0.7;  // AR(1) coefficient above = CSD warning

const METRICS_TRACKED = ['entropy', 'collapseRate', 'objective', 'avgStrength'];

export class SystemStabilityAnalyzer {

  constructor() {
    // Rolling buffers per metric
    this._windows = {};
    for (const m of METRICS_TRACKED) this._windows[m] = [];

    // Current analysis results
    this.regime        = 'STABLE';
    this.stabilityScore = 1.0;

    this.variances  = {};   // { metric: number }
    this.velocities = {};   // { metric: number } — EMA of delta
    this.csd        = {};   // { metric: boolean } — critical slowing down flag

    this._emaVelocity = {}; // EMA state per metric
    this._emaAlpha    = 0.15;

    this.tickCount        = 0;
    this.transitionCount  = 0;  // times regime changed
    this._lastRegime      = 'STABLE';

    // Transition history
    this._transitions = [];   // {tick, from, to, stability}
  }

  // ── UPDATE ───────────────────────────────────

  /**
   * Ingest a new system snapshot.
   * Called every tick by Diagnostics or Hakari.js.
   *
   * @param {object} state
   *   state.entropy, collapseRate, objective, avgStrength
   * @param {number} tick — current tick
   */
  update(state, tick) {
    this.tickCount++;

    for (const m of METRICS_TRACKED) {
      const val = state[m] ?? 0;

      // Push into rolling window
      const w = this._windows[m];
      w.push(val);
      if (w.length > WINDOW_SIZE) w.shift();

      // EMA velocity
      const prevEMA = this._emaVelocity[m] ?? 0;
      const prevVal = w.length >= 2 ? w[w.length - 2] : val;
      const delta   = val - prevVal;
      this._emaVelocity[m] = this._emaAlpha * delta + (1 - this._emaAlpha) * prevEMA;
      this.velocities[m]   = this._emaVelocity[m];

      // Variance
      this.variances[m] = this._rollingVariance(w, Math.min(50, w.length));

      // Critical slowing down (AR(1) autocorrelation)
      this.csd[m] = this._detectCSD(w);
    }

    // Compute composite stability score
    this._updateRegime(tick);
  }

  // ── READ ─────────────────────────────────────

  /**
   * Full analysis result.
   * @returns {StabilityReport}
   */
  report() {
    return {
      regime:         this.regime,
      stabilityScore: this.stabilityScore,
      variances:      { ...this.variances },
      velocities:     { ...this.velocities },
      csdActive:      { ...this.csd },
      transitions:    this._transitions.slice(-10),
      transitionCount: this.transitionCount,
    };
  }

  /**
   * Is the system near a tipping point?
   * @returns {boolean}
   */
  isNearTippingPoint() {
    return Object.values(this.csd).filter(Boolean).length >= 2;
  }

  /**
   * Is the system currently chaotic?
   * @returns {boolean}
   */
  isChaotic() {
    return this.regime === 'CHAOTIC';
  }

  /**
   * Is the system near the edge of chaos?
   * (Optimal regime for complex adaptive behaviour)
   * @returns {boolean}
   */
  isEdgeOfChaos() {
    return this.regime === 'CRITICAL';
  }

  /**
   * Metric with highest current variance.
   * @returns {string}
   */
  mostUnstableMetric() {
    return Object.entries(this.variances)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'entropy';
  }

  // ── CLEAR ────────────────────────────────────

  clear() {
    for (const m of METRICS_TRACKED) this._windows[m] = [];
    this.regime         = 'STABLE';
    this.stabilityScore = 1.0;
    this.variances      = {};
    this.velocities     = {};
    this.csd            = {};
    this._emaVelocity   = {};
    this.tickCount      = 0;
    this.transitionCount = 0;
    this._transitions   = [];
    this._lastRegime    = 'STABLE';
  }

  // ── DIAGNOSTICS ──────────────────────────────

  getState() {
    return {
      regime:         this.regime,
      stabilityScore: this.stabilityScore,
      csdActive:      Object.values(this.csd).filter(Boolean).length,
      transitionCount: this.transitionCount,
    };
  }

  // ── PRIVATE ──────────────────────────────────

  _updateRegime(tick) {
    // Composite score: mean variance across metrics, weighted
    const weights = { entropy: 0.35, collapseRate: 0.30, objective: 0.20, avgStrength: 0.15 };
    let   wSum    = 0;
    for (const m of METRICS_TRACKED) {
      wSum += (this.variances[m] ?? 0) * (weights[m] ?? 0.25);
    }

    // CSD bonus — adds instability warning
    const csdCount  = Object.values(this.csd).filter(Boolean).length;
    const csdBonus  = csdCount * 0.015;
    const composite = wSum + csdBonus;

    // Map composite variance to stability score
    this.stabilityScore = Math.max(0, 1 - composite / CHAOTIC_THRESH);

    // Regime assignment with hysteresis (prevents flicker)
    const newRegime =
        composite > CHAOTIC_THRESH  ? 'CHAOTIC'
      : composite > STABLE_THRESH   ? 'CRITICAL'
      : 'STABLE';

    if (newRegime !== this._lastRegime) {
      this._transitions.push({
        tick,
        from:       this._lastRegime,
        to:         newRegime,
        stability:  this.stabilityScore,
        composite,
      });
      if (this._transitions.length > 50) this._transitions.shift();
      this.transitionCount++;
      this._lastRegime = newRegime;
    }

    this.regime = newRegime;
  }

  /**
   * Rolling variance over last n samples.
   * @param {number[]} arr
   * @param {number}   n
   * @returns {number}
   */
  _rollingVariance(arr, n) {
    const window = arr.slice(-n);
    if (window.length < 2) return 0;
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    return window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
  }

  /**
   * Detect critical slowing down via AR(1) coefficient.
   * AR(1): rₜ = φ·rₜ₋₁ + εₜ
   * φ → 1 as system approaches tipping point.
   *
   * @param {number[]} arr
   * @returns {boolean}
   */
  _detectCSD(arr) {
    const w = arr.slice(-CSD_WINDOW);
    if (w.length < 10) return false;

    // Estimate AR(1) coefficient via lag-1 autocorrelation
    const mean  = w.reduce((s, v) => s + v, 0) / w.length;
    let   c0 = 0, c1 = 0;
    for (let i = 1; i < w.length; i++) {
      c0 += (w[i - 1] - mean) ** 2;
      c1 += (w[i - 1] - mean) * (w[i] - mean);
    }
    const phi = c0 > 1e-10 ? c1 / c0 : 0;
    return phi > CSD_THRESHOLD;
  }
}