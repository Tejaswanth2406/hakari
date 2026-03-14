/**
 * HAKARI v3 — debug/LearningCurveAnalyzer.js
 * ─────────────────────────────────────────────
 * Tracks and analyses HAKARI's learning progress
 * over time. Answers the question:
 * "Is HAKARI actually getting smarter?"
 *
 * Metrics tracked:
 *   - Objective improvement rate   dJ/dt
 *   - Information gain trajectory  I(t)
 *   - Collapse reduction trend     ΔC
 *   - Strength accumulation rate   dH̄/dt
 *   - MetaOptimizer step quality   J after step
 *
 * Analysis outputs:
 *   learningRate       — normalised speed of improvement
 *   convergenceScore   — how close to asymptote (0 = diverging, 1 = converged)
 *   plateauDetected    — true if learning has stalled
 *   plateauSince       — tick when plateau began
 *   bestObjective      — peak J ever seen
 *   regressionActive   — system is getting worse
 *   movingAvgJ         — smoothed objective curve
 *
 * Plateau detection:
 *   If the EMA of |dJ/dt| falls below PLATEAU_THRESHOLD
 *   for PLATEAU_PATIENCE ticks → plateau declared.
 *
 * Convergence:
 *   As J approaches bestJ asymptotically, convergence
 *   score rises toward 1. Computed via exponential fit.
 * ─────────────────────────────────────────────
 */

const J_WINDOW          = 50;   // objective rolling window
const LEARNING_WINDOW   = 30;   // learning rate window
const PLATEAU_THRESHOLD = 0.0003; // |dJ/dt| EMA below = plateau
const PLATEAU_PATIENCE  = 60;     // ticks to confirm plateau
const EMA_ALPHA         = 0.12;

export class LearningCurveAnalyzer {

  constructor() {
    // Rolling data
    this._jBuf       = [];   // J(t) values
    this._iBuf       = [];   // I(t) information values
    this._cBuf       = [];   // collapseRate values
    this._hBuf       = [];   // avgStrength values

    // EMA states
    this._emaJ       = null;
    this._emaDeltaJ  = 0;   // EMA of |ΔJ|

    // Analysis results
    this.learningRate     = 0;
    this.convergenceScore = 0;
    this.plateauDetected  = false;
    this.plateauSince     = null;
    this.bestObjective    = -Infinity;
    this.regressionActive = false;
    this.movingAvgJ       = [];   // recent smoothed J values

    // Improvement events (when J hit new best)
    this._improvements   = [];   // {tick, J, delta}

    this._plateauTicks   = 0;
    this._tickCount      = 0;
  }

  // ── UPDATE ───────────────────────────────────

  /**
   * Ingest current system metrics.
   * @param {object} state
   *   state.objective    — J
   *   state.information  — I
   *   state.collapseRate
   *   state.avgStrength
   * @param {number} tick
   */
  update(state, tick) {
    this._tickCount++;

    const J  = state.objective    ?? 0;
    const I  = state.information  ?? 0;
    const C  = state.collapseRate ?? 0;
    const H  = state.avgStrength  ?? 0;

    // Push to buffers
    this._pushBuf(this._jBuf, J, J_WINDOW);
    this._pushBuf(this._iBuf, I, J_WINDOW);
    this._pushBuf(this._cBuf, C, J_WINDOW);
    this._pushBuf(this._hBuf, H, J_WINDOW);

    if (this._jBuf.length < 3) return;

    // EMA of J
    this._emaJ = this._emaJ === null
      ? J
      : EMA_ALPHA * J + (1 - EMA_ALPHA) * this._emaJ;

    // Track moving average
    this.movingAvgJ.push(this._emaJ);
    if (this.movingAvgJ.length > J_WINDOW) this.movingAvgJ.shift();

    // Delta J EMA
    const prevJ  = this._jBuf[this._jBuf.length - 2];
    const deltaJ = J - prevJ;
    this._emaDeltaJ = EMA_ALPHA * Math.abs(deltaJ) + (1 - EMA_ALPHA) * this._emaDeltaJ;

    // Best objective
    if (J > this.bestObjective) {
      const improvement = J - this.bestObjective;
      if (this.bestObjective !== -Infinity) {
        this._improvements.push({ tick, J, delta: improvement });
        if (this._improvements.length > 50) this._improvements.shift();
      }
      this.bestObjective = J;
    }

    // Learning rate = slope of J over window
    this.learningRate = this._slopeOverWindow(this._jBuf, LEARNING_WINDOW);

    // Convergence score
    this.convergenceScore = this._computeConvergence(J);

    // Regression detection
    this.regressionActive = this.learningRate < -0.001;

    // Plateau detection
    this._detectPlateau(tick);
  }

  // ── READ ─────────────────────────────────────

  /**
   * Full learning analysis report.
   * @returns {LearningReport}
   */
  report() {
    return {
      learningRate:     this.learningRate,
      convergenceScore: this.convergenceScore,
      plateauDetected:  this.plateauDetected,
      plateauSince:     this.plateauSince,
      bestObjective:    this.bestObjective,
      currentObjective: this._jBuf[this._jBuf.length - 1] ?? 0,
      regressionActive: this.regressionActive,
      improvementCount: this._improvements.length,
      recentImprovements: this._improvements.slice(-5),
      movingAvgJ:       [...this.movingAvgJ],
      collapseReduction: this._collapseReduction(),
      infoGainRate:      this._infoGainRate(),
    };
  }

  /**
   * Is the system learning (improving J trend)?
   * @returns {boolean}
   */
  isLearning() {
    return this.learningRate > 0.0005 && !this.plateauDetected;
  }

  /**
   * Is the system converging toward optimal?
   * @returns {boolean}
   */
  isConverging() {
    return this.convergenceScore > 0.7;
  }

  /**
   * Should MetaOptimizer be given a nudge?
   * True if in plateau for a long time.
   * @returns {boolean}
   */
  needsExploration() {
    if (!this.plateauSince) return false;
    return (this._tickCount - this.plateauSince) > 100;
  }

  // ── CLEAR ────────────────────────────────────

  clear() {
    this._jBuf = []; this._iBuf = []; this._cBuf = []; this._hBuf = [];
    this._emaJ = null; this._emaDeltaJ = 0;
    this.learningRate     = 0;
    this.convergenceScore = 0;
    this.plateauDetected  = false;
    this.plateauSince     = null;
    this.bestObjective    = -Infinity;
    this.regressionActive = false;
    this.movingAvgJ       = [];
    this._improvements    = [];
    this._plateauTicks    = 0;
    this._tickCount       = 0;
  }

  // ── DIAGNOSTICS ──────────────────────────────

  getState() {
    return {
      learningRate:     this.learningRate,
      convergenceScore: this.convergenceScore,
      plateauDetected:  this.plateauDetected,
      bestObjective:    this.bestObjective,
      regressionActive: this.regressionActive,
    };
  }

  // ── PRIVATE ──────────────────────────────────

  _detectPlateau(tick) {
    if (this._emaDeltaJ < PLATEAU_THRESHOLD) {
      this._plateauTicks++;
      if (this._plateauTicks >= PLATEAU_PATIENCE && !this.plateauDetected) {
        this.plateauDetected = true;
        this.plateauSince    = tick - PLATEAU_PATIENCE;
      }
    } else {
      this._plateauTicks   = 0;
      this.plateauDetected = false;
      this.plateauSince    = null;
    }
  }

  _computeConvergence(J) {
    if (this.bestObjective === -Infinity || this.bestObjective === 0) return 0;
    // Convergence = how close is current J to bestJ
    const ratio = J / this.bestObjective;
    // Exponential saturation curve
    return Math.min(1, 1 - Math.exp(-5 * ratio));
  }

  /**
   * Ordinary least-squares slope over last n samples.
   */
  _slopeOverWindow(buf, n) {
    const w = buf.slice(-n);
    if (w.length < 2) return 0;
    const N    = w.length;
    const sumX = N * (N - 1) / 2;
    const sumX2 = N * (N - 1) * (2 * N - 1) / 6;
    let   sumY = 0, sumXY = 0;
    for (let i = 0; i < N; i++) {
      sumY  += w[i];
      sumXY += i * w[i];
    }
    const denom = N * sumX2 - sumX * sumX;
    return denom > 0 ? (N * sumXY - sumX * sumY) / denom : 0;
  }

  _collapseReduction() {
    if (this._cBuf.length < 10) return 0;
    const firstHalf  = this._cBuf.slice(0, Math.floor(this._cBuf.length / 2));
    const secondHalf = this._cBuf.slice(Math.floor(this._cBuf.length / 2));
    const avgFirst   = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond  = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    return avgFirst - avgSecond;  // positive = improving
  }

  _infoGainRate() {
    return this._slopeOverWindow(this._iBuf, LEARNING_WINDOW);
  }

  _pushBuf(arr, val, max) {
    arr.push(val);
    if (arr.length > max) arr.shift();
  }
}