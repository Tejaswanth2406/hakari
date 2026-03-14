/**
 * HAKARI v3 — debug/Diagnostics.js  [VERSION 2 — ADVANCED]
 * ════════════════════════════════════════════════════════════════════
 *
 *  COGNITIVE INTELLIGENCE OBSERVABILITY ENGINE
 *  The single unified diagnostic core for all of HAKARI v3.
 *
 *  Replaces and supersedes:
 *    ▸ Diagnostics.js (v1)
 *    ▸ SystemStabilityAnalyzer.js
 *    ▸ CognitivePhaseDetector.js
 *    ▸ LearningCurveAnalyzer.js
 *
 * ────────────────────────────────────────────────────────────────────
 *  12 ANALYTICAL LAYERS
 * ────────────────────────────────────────────────────────────────────
 *
 *  [L1]  METRIC TELEMETRY
 *        Zero-allocation Float32 ring buffers for 12 system signals.
 *        600-tick history (20s at 30Hz). Sub-millisecond push/read.
 *
 *  [L2]  STATISTICAL ENGINE
 *        Rolling mean, variance, std-dev, skewness, kurtosis.
 *        OLS trend slope (Welford-stable). EMA velocity.
 *        Cross-metric Pearson correlation matrix.
 *        AR(1) autocorrelation for CSD detection.
 *        Runs every STATS_STRIDE ticks (default 5) to stay cheap.
 *
 *  [L3]  SPECTRAL ANALYSIS
 *        Discrete Fourier Transform on entropy ring (last 64 samples).
 *        Detects dominant oscillation frequency and amplitude.
 *        Useful to distinguish: deterministic cycles vs. chaos.
 *        Updates every SPECTRAL_STRIDE = 30 ticks.
 *
 *  [L4]  STABILITY REGIME DETECTOR
 *        STABLE / CRITICAL / CHAOTIC from composite weighted variance.
 *        Hysteresis band prevents rapid flickering.
 *        Composite = Σ wᵢ·σᵢ² + CSD_bonus.
 *
 *  [L5]  COGNITIVE PHASE DETECTOR (5-signal vote)
 *        ORDER / CRITICAL / CHAOS from dynamical systems theory.
 *        Signals:
 *          • Lyapunov exponent approximation   (weight 0.30)
 *          • Entropy slope OLS                 (weight 0.25)
 *          • Activation spread σ_A             (weight 0.20)
 *          • Spectral dominant frequency       (weight 0.15)
 *          • Variance acceleration d²σ/dt²     (weight 0.10)
 *        Confidence = vote fraction of winner.
 *        complexityScore peaks at CRITICAL.
 *        adaptabilityIdx = learning potential ∈ [0,1].
 *
 *  [L6]  CRITICAL SLOWING DOWN (CSD) ENGINE
 *        AR(1) coefficient φ → 1 before tipping points.
 *        Variance rising while recovery rate falling = CSD confirmed.
 *        Dual-trigger: both AR(1) AND variance acceleration required.
 *        isNearTippingPoint() fires when ≥2 metrics confirm CSD.
 *
 *  [L7]  LEARNING ANALYTICS
 *        Objective J tracking: rate, convergence, best-ever.
 *        Plateau detection: EMA of |ΔJ| + patience counter.
 *        Regression guard: sustained negative slope detection.
 *        Transfer detection: sudden J jump after plateau.
 *        Information gain rate: slope of I(t).
 *        Collapse reduction trend: first-half vs second-half mean.
 *        needsExploration() after 120 ticks in plateau.
 *
 *  [L8]  ANOMALY DETECTION  (20 anomaly types)
 *        Rate-limited per type. Severity: INFO / WARN / CRITICAL.
 *        Every anomaly carries: tick, message, data, causal attribution.
 *        Types:
 *          entropy_spike, collapse_cascade, energy_overload,
 *          param_runaway, param_freeze, system_stall, network_collapse,
 *          strength_freefall, entropy_deadlock, oscillation_detected,
 *          tipping_point_warning, learning_regression, information_drought,
 *          connectivity_explosion, phase_flip, lyapunov_surge,
 *          reinforcement_collapse, spectral_mode_lock,
 *          transfer_learning_event, objective_ceiling_hit.
 *
 *  [L9]  CAUSAL ATTRIBUTION ENGINE
 *        Cross-correlation + slope + velocity fusion to assign blame.
 *        Confidence score per attribution.
 *        Causal chain: up to 3 contributing factors per anomaly.
 *
 *  [L10] PERFORMANCE PROFILER
 *        Per-subsystem timing via profileStart / profileEnd.
 *        P50 / P90 / P99 tick latency. Budget tracking (33ms @ 30Hz).
 *        Slow-tick log with culprit subsystem identification.
 *
 *  [L11] COMPOSITE HEALTH SCORE
 *        Single [0,1] scalar synthesising all 12 layers.
 *        Decomposed: stability · learning · efficiency · resilience · coherence.
 *        coherence = how well the system's metrics agree with each other.
 *        Used by ExperimentPanel for cross-run ranking.
 *
 *  [L12] STRUCTURED REPORTING
 *        snapshot()       — lightweight current-value dict
 *        report()         — human-readable console summary
 *        fullReport()     — deep JSON for export/logging
 *        getCurve(key,n)  — last N values of any ring
 *        getStats(key)    — all statistical moments
 *        getAnomalies()   — filtered + sorted anomaly log
 *        getDFT()         — spectral data for UI renderer
 *        getCorrelation() — live cross-metric correlation matrix
 *
 * ────────────────────────────────────────────────────────────────────
 *  INTEGRATION — called from Hakari.js tick steps 19b–19e
 * ────────────────────────────────────────────────────────────────────
 *
 *  Every tick:
 *    diagnostics.update(state)
 *
 *  Optional profiling hooks (wrap each major step):
 *    diagnostics.profileStart('HUIE')
 *    diagnostics.profileEnd('HUIE')
 *
 *  State object (all fields gracefully optional):
 *  {
 *    tick, entropy, collapseCount, totalEnergy, objective,
 *    avgStrength, information, nodeCount, connectivity,
 *    energyOverload, paramDrifts, runawayParams,
 *    nodes: Node[],  collapseEvents: CollapseRecord[]
 *  }
 *
 * ────────────────────────────────────────────────────────────────────
 *  PERFORMANCE BUDGET
 * ────────────────────────────────────────────────────────────────────
 *
 *  update() baseline (no heavy passes):  < 0.15ms
 *  stats pass (every 5 ticks):           < 1.2ms
 *  spectral pass (every 30 ticks):       < 0.8ms  (64-point DFT)
 *  Full budget per tick:                 < 1.5ms at 1500 nodes
 *
 * ════════════════════════════════════════════════════════════════════
 */

import { DIAGNOSTICS, TIMING }  from '../core/config.js';
import { PARAMS, PARAM_BOUNDS } from '../core/constants.js';

// ══════════════════════════════════════════════════════════════════════
//  COMPILE-TIME CONSTANTS
// ══════════════════════════════════════════════════════════════════════

/** Ring buffer capacity — 600 ticks ≈ 20s at 30Hz. */
const RING_SIZE          = 600;

/** How often to run the full statistical pass (ticks). */
const STATS_STRIDE       = 5;

/** How often to run the spectral (DFT) pass (ticks). */
const SPECTRAL_STRIDE    = 30;

/** Window for per-tick statistics. Large enough for moments, fast. */
const STAT_WINDOW        = 60;

/** Window for OLS slope computation. */
const SLOPE_WINDOW       = 40;

/** DFT input size — must be power of 2. */
const DFT_N              = 64;

/** Rolling window for profiling percentiles. */
const PROFILE_WINDOW     = 90;

// ── Stability regime thresholds ──────────────────────────────────────
const REGIME_STABLE_VAR  = 0.016;
const REGIME_CHAOTIC_VAR = 0.072;
const REGIME_HYSTERESIS  = 0.007;   // prevents rapid flicker

// ── Phase detector signal thresholds ─────────────────────────────────
const LYAP_WINDOW        = 30;
const LYAP_CHAOS         =  0.022;
const LYAP_ORDER         = -0.010;
const SLOPE_CHAOS        =  0.009;
const SLOPE_ORDER        = -0.005;
const SPREAD_CHAOS       =  0.34;
const SPREAD_ORDER       =  0.07;
const FREQ_CHAOS_MIN     =  0.35;   // fast oscillation → chaos
const FREQ_ORDER_MAX     =  0.04;   // very slow/dc → order
const VARACCEL_CHAOS     =  0.006;  // variance accelerating fast → chaos

// ── CSD (Critical Slowing Down) ───────────────────────────────────────
const CSD_WINDOW         = 45;
const CSD_AR1_THRESH     = 0.70;    // AR(1) φ > threshold = CSD flag
const CSD_VAR_ACCEL_MIN  = 0.002;   // variance must also be increasing

// ── Learning analytics ────────────────────────────────────────────────
const LEARNING_EMA_α     = 0.10;
const VELOCITY_EMA_α     = 0.12;
const PLATEAU_EMA_THRESH = 0.00018;
const PLATEAU_PATIENCE   = 90;      // ticks of |ΔJ| < thresh → plateau
const TRANSFER_JUMP_MIN  = 0.015;   // sudden J jump after plateau = transfer

// ── Anomaly suppression cooldowns (ticks between same type) ──────────
const COOLDOWNS = {
  entropy_spike:          8,
  collapse_cascade:       5,
  energy_overload:        18,
  param_runaway:          30,
  param_freeze:           60,
  system_stall:           60,
  network_collapse:       10,
  strength_freefall:      18,
  entropy_deadlock:       45,
  oscillation_detected:   55,
  tipping_point_warning:  25,
  learning_regression:    45,
  information_drought:    40,
  connectivity_explosion: 22,
  phase_flip:             15,
  lyapunov_surge:         20,
  reinforcement_collapse: 25,
  spectral_mode_lock:     60,
  transfer_learning_event:30,
  objective_ceiling_hit:  80,
};

const SEV = Object.freeze({ INFO: 0, WARN: 1, CRITICAL: 2 });

// ══════════════════════════════════════════════════════════════════════
//  RING BUFFER  [L1 foundation]
// ══════════════════════════════════════════════════════════════════════

/**
 * Fixed-capacity circular buffer backed by Float32Array.
 * Zero GC after construction. All ops O(1).
 */
class RingBuffer {
  constructor(capacity) {
    this._cap  = capacity;
    this._buf  = new Float32Array(capacity);
    this._head = 0;   // next write position
    this._len  = 0;   // how many valid entries
  }

  /** Push a scalar. NaN/Infinity coerced to 0. */
  push(v) {
    this._buf[this._head] = (isFinite(v) ? v : 0);
    this._head = (this._head + 1) % this._cap;
    if (this._len < this._cap) this._len++;
  }

  /**
   * Read at logical index i (0 = oldest, len−1 = newest).
   * O(1) index arithmetic — no copies.
   */
  at(i) {
    if (i < 0 || i >= this._len) return 0;
    const base = this._len < this._cap ? 0 : this._head;
    return this._buf[(base + i) % this._cap];
  }

  /** Latest (newest) value. */
  latest()  { return this._len > 0 ? this.at(this._len - 1) : 0; }

  /** Oldest (first) value in current window. */
  oldest()  { return this._len > 0 ? this.at(0) : 0; }

  get length() { return this._len; }

  /**
   * Extract last n values into a plain Array (oldest→newest).
   * Allocates — use for stats passes, not hot path.
   */
  slice(n) {
    const count = Math.min(n, this._len);
    const out   = new Array(count);
    const start = this._len - count;
    for (let i = 0; i < count; i++) out[i] = this.at(start + i);
    return out;
  }

  /** Extract ALL current values oldest→newest. */
  toArray() { return this.slice(this._len); }

  clear() {
    this._buf.fill(0);
    this._head = 0;
    this._len  = 0;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  STATISTICAL PRIMITIVES  [L2 utils]
// ══════════════════════════════════════════════════════════════════════

/**
 * Compute mean, variance, std, min, max, skewness, kurtosis
 * over a plain number array. Single pass (Welford-adjacent).
 */
function stats(arr) {
  const n = arr.length;
  if (n === 0) return { mean:0, variance:0, std:0, min:0, max:0, skewness:0, kurtosis:0 };

  let sum = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    sum += arr[i];
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  const mean = sum / n;

  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  const variance = m2 / n;
  const std      = Math.sqrt(variance);
  const skewness = std > 1e-10 ? (m3 / n) / (std ** 3)        : 0;
  const kurtosis = std > 1e-10 ? (m4 / n) / (variance ** 2) - 3 : 0;
  return { mean, variance, std, min, max, skewness, kurtosis };
}

/**
 * Ordinary Least Squares slope over last n entries of a RingBuffer.
 * Returns slope (Δ per tick). O(n).
 */
function olsSlope(ring, n) {
  const N   = Math.min(n, ring.length);
  if (N < 2) return 0;
  const off = ring.length - N;
  let   sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (let i = 0; i < N; i++) {
    const x = i, y = ring.at(off + i);
    sumX  += x; sumY  += y;
    sumXX += x * x; sumXY += x * y;
  }
  const denom = N * sumXX - sumX * sumX;
  return denom > 1e-12 ? (N * sumXY - sumX * sumY) / denom : 0;
}

/**
 * AR(1) lag-1 autocorrelation coefficient.
 * φ = cov(x_t, x_{t-1}) / var(x)
 * φ → 1 = critical slowing down.
 */
function ar1(ring, n) {
  const w = ring.slice(n);
  if (w.length < 5) return 0;
  const mean = w.reduce((s, v) => s + v, 0) / w.length;
  let c0 = 0, c1 = 0;
  for (let i = 1; i < w.length; i++) {
    c0 += (w[i - 1] - mean) ** 2;
    c1 += (w[i - 1] - mean) * (w[i] - mean);
  }
  return c0 > 1e-14 ? c1 / c0 : 0;
}

/**
 * Pearson cross-correlation between two rings over last n samples.
 * r ∈ [-1, 1].
 */
function pearson(ringA, ringB, n) {
  const a = ringA.slice(n);
  const b = ringB.slice(n);
  const N = Math.min(a.length, b.length);
  if (N < 4) return 0;
  let sA = 0, sB = 0;
  for (let i = 0; i < N; i++) { sA += a[i]; sB += b[i]; }
  const mA = sA / N, mB = sB / N;
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < N; i++) {
    const da = a[i] - mA, db = b[i] - mB;
    num += da * db; dA += da * da; dB += db * db;
  }
  const den = Math.sqrt(dA * dB);
  return den > 1e-14 ? num / den : 0;
}

// ══════════════════════════════════════════════════════════════════════
//  DFT UTILITY  [L3]
// ══════════════════════════════════════════════════════════════════════

/**
 * Real-input DFT (not FFT — N=64 is small enough, ~4096 mults).
 * Returns { frequencies[], magnitudes[], dominantFreq, dominantAmp }.
 *
 * Input: array of N real samples.
 * Output: N/2 frequency bins, 0 = DC, 1 = 1/N cycle, etc.
 */
function computeDFT(samples) {
  const N     = samples.length;
  const half  = N >> 1;
  const freqs = new Float32Array(half);
  const mags  = new Float32Array(half);

  for (let k = 0; k < half; k++) {
    let re = 0, im = 0;
    const twoPiK = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      re += samples[n] * Math.cos(twoPiK * n);
      im -= samples[n] * Math.sin(twoPiK * n);
    }
    freqs[k] = k / N;                          // normalized frequency
    mags[k]  = Math.sqrt(re * re + im * im) / N;
  }

  // Dominant bin (skip DC at k=0)
  let domIdx = 1, domMag = mags[1];
  for (let k = 2; k < half; k++) {
    if (mags[k] > domMag) { domMag = mags[k]; domIdx = k; }
  }

  return {
    frequencies:   Array.from(freqs),
    magnitudes:    Array.from(mags),
    dominantFreq:  freqs[domIdx],
    dominantAmp:   domMag,
    dcAmplitude:   mags[0],
    spectralEntropy: _spectralEntropy(mags),
  };
}

/** Normalised spectral entropy H_spec ∈ [0,1] (uniform = 1, pure tone = 0). */
function _spectralEntropy(mags) {
  const sum = mags.reduce((s, v) => s + v, 0);
  if (sum < 1e-10) return 0;
  let H = 0;
  const logN = Math.log(mags.length);
  for (const m of mags) {
    const p = m / sum;
    if (p > 1e-12) H -= p * Math.log(p);
  }
  return H / logN;   // 0 = pure tone, 1 = white noise
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN CLASS
// ══════════════════════════════════════════════════════════════════════

export class Diagnostics {

  constructor() {
    this.enabled     = DIAGNOSTICS?.ENABLED ?? true;
    this.tickCount   = 0;
    this._statTick   = 0;
    this._specTick   = 0;

    // ── [L1] Ring buffers ─────────────────────────────────────────
    this._r = {
      entropy:      new RingBuffer(RING_SIZE),
      collapseRate: new RingBuffer(RING_SIZE),
      energy:       new RingBuffer(RING_SIZE),
      objective:    new RingBuffer(RING_SIZE),
      avgStrength:  new RingBuffer(RING_SIZE),
      information:  new RingBuffer(RING_SIZE),
      nodeCount:    new RingBuffer(RING_SIZE),
      connectivity: new RingBuffer(RING_SIZE),
      reinforcement:new RingBuffer(RING_SIZE),
      infoFlow:     new RingBuffer(RING_SIZE),
      decayRate:    new RingBuffer(RING_SIZE),
      queryHits:    new RingBuffer(RING_SIZE),
    };

    /** Parameter drift rings: one per PARAMS key. */
    this._paramR = {};
    for (const key of Object.keys(PARAMS)) {
      this._paramR[key] = new RingBuffer(RING_SIZE);
    }

    /** Per-metric variance ring — for variance acceleration. */
    this._varR = {};
    for (const key of Object.keys(this._r)) {
      this._varR[key] = new RingBuffer(120);
    }

    // ── [L2] Statistical state ────────────────────────────────────
    /** Latest statistical moments per metric. */
    this.statMoments = {};   // { key: { mean, variance, std, min, max, skewness, kurtosis } }
    this.slopes      = {};   // { key: OLS slope }
    this.ar1vals     = {};   // { key: AR(1) coefficient }
    this.velEMA      = {};   // { key: signed EMA velocity }
    this.absEMA      = {};   // { key: EMA of |Δ| }

    /** Pearson cross-correlation matrix (5 key pairs). */
    this.corrMatrix = {
      entropy_collapse:  0,
      entropy_strength:  0,
      objective_info:    0,
      collapse_strength: 0,
      strength_info:     0,
    };

    // ── [L3] Spectral state ───────────────────────────────────────
    /** Latest DFT result on entropy ring. */
    this.spectral = {
      dominantFreq:   0,
      dominantAmp:    0,
      dcAmplitude:    0,
      spectralEntropy:1,
      magnitudes:     [],
      frequencies:    [],
    };

    // ── [L4] Regime state ─────────────────────────────────────────
    this.regime          = 'STABLE';
    this.stabilityScore  = 1.0;
    this._prevRegime     = 'STABLE';
    this._regimeHyst     = 0;        // hysteresis counter
    this.regimeHistory   = [];       // { tick, from, to, composite }
    this.regimeChanges   = 0;

    // ── [L5] Phase state ──────────────────────────────────────────
    this.phase            = 'ORDER';
    this.phaseConfidence  = 0.5;
    this.complexityScore  = 0;
    this.adaptabilityIdx  = 0;
    this._prevPhase       = 'ORDER';
    this.phaseHistory     = [];   // { tick, phase, confidence }

    /** Raw signal votes from each detector. */
    this.phaseSignals = {
      lyapunov:  { phase:'ORDER', value:0, weight:0.30 },
      slope:     { phase:'ORDER', value:0, weight:0.25 },
      spread:    { phase:'ORDER', value:0, weight:0.20 },
      spectral:  { phase:'ORDER', value:0, weight:0.15 },
      varaccel:  { phase:'ORDER', value:0, weight:0.10 },
    };

    // ── [L6] CSD state ────────────────────────────────────────────
    /** Per-metric CSD flags. Both AR(1) AND variance-accelerating required. */
    this.csdFlags    = {};
    this.csdAR1      = {};   // AR(1) values
    this.csdVarAccel = {};   // variance acceleration values

    // ── [L7] Learning state ───────────────────────────────────────
    this.learningRate        = 0;
    this.convergenceScore    = 0;
    this.plateauDetected     = false;
    this.plateauSince        = null;
    this.bestObjective       = -Infinity;
    this.regressionActive    = false;
    this.transferDetected    = false;
    this.transferTick        = null;
    this.infoGainRate        = 0;
    this.collapseReduction   = 0;
    this._emaJ               = null;
    this._emaDeltaJ          = 0;
    this._plateauTicks       = 0;
    this._wasInPlateau       = false;
    this.movingAvgJ          = new RingBuffer(200);
    this._improvements       = [];   // { tick, J, delta }

    // ── [L8] Anomaly log ──────────────────────────────────────────
    this._anomalies     = [];        // AnomalyRecord[]
    this._lastAnomalyAt = {};        // { type: tick } for cooldowns
    this.anomalyCount   = 0;
    this.criticalCount  = 0;

    // ── [L10] Profiling ───────────────────────────────────────────
    this._profStart   = {};          // { name: performance.now() }
    this._profRings   = {};          // { name: RingBuffer(PROFILE_WINDOW) }
    this._tickTimeRing= new RingBuffer(PROFILE_WINDOW);
    this._tickStart   = 0;
    this._slowTicks   = [];          // { tick, ms, culprit }

    // ── [L11] Health ──────────────────────────────────────────────
    this.healthScore     = 1.0;
    this.healthBkdn      = { stability:1, learning:1, efficiency:1, resilience:1, coherence:1 };

    // ── General counters ──────────────────────────────────────────
    this.totalCollapses  = 0;
    this._prevS          = 0;
    this._prevJ          = 0;
    this._prevPhaseStr   = 'ORDER';
  }

  // ══════════════════════════════════════════════════════════════════
  //  MAIN UPDATE ENTRY POINT
  //  Called every tick from Hakari.js step 19
  // ══════════════════════════════════════════════════════════════════

  /**
   * Ingest the current system snapshot and run all diagnostic passes.
   *
   * @param {object} state
   */
  update(state) {
    if (!this.enabled) return;

    this._tickStart = performance.now();
    this.tickCount++;
    this._statTick++;
    this._specTick++;

    // ── Unpack state ──────────────────────────────────────────────
    const S   = state.entropy        ?? 0;
    const C   = state.collapseCount  ?? 0;
    const E   = state.totalEnergy    ?? 0;
    const J   = state.objective      ?? 0;
    const H   = state.avgStrength    ?? 0;
    const I   = state.information    ?? 0;
    const N   = state.nodeCount      ?? (state.nodes?.length ?? 0);
    const Cx  = state.connectivity   ?? 0;
    const Rf  = state.reinforcement  ?? 0;
    const IF  = state.infoFlow       ?? I;
    const DR  = state.decayRate      ?? 0;
    const QH  = state.queryHits      ?? 0;

    this.totalCollapses += C;

    // ── [L1] Push to rings ────────────────────────────────────────
    this._r.entropy.push(S);
    this._r.collapseRate.push(C);
    this._r.energy.push(E);
    this._r.objective.push(J);
    this._r.avgStrength.push(H);
    this._r.information.push(I);
    this._r.nodeCount.push(N);
    this._r.connectivity.push(Cx);
    this._r.reinforcement.push(Rf);
    this._r.infoFlow.push(IF);
    this._r.decayRate.push(DR);
    this._r.queryHits.push(QH);

    if (state.paramDrifts) {
      for (const [k, v] of Object.entries(state.paramDrifts)) {
        this._paramR[k]?.push(v ?? 0);
      }
    }

    // ── Per-tick light work (always) ──────────────────────────────
    this._updateVelocities(S, J, H, I, C, Cx);
    this._updateLearning(J, I, C);
    this._detectAnomalies(state, S, C, E, J, H, I, N, Cx);

    // ── [L2+L4+L5+L6+L11] Heavy statistical pass ─────────────────
    if (this._statTick >= STATS_STRIDE) {
      this._statTick = 0;
      this._runStatsPass();
      this._updateVarianceAcceleration();
      this._updateCorrelations();
      this._updateCSD();
      this._updateRegime();
      this._updatePhase(state.nodes ?? []);
      this._updateHealthScore();
    }

    // ── [L3] Spectral pass ────────────────────────────────────────
    if (this._specTick >= SPECTRAL_STRIDE) {
      this._specTick = 0;
      this._runSpectralPass();
    }

    // ── Tick timing ───────────────────────────────────────────────
    const elapsed = performance.now() - this._tickStart;
    this._tickTimeRing.push(elapsed);

    const budget = 1000 / (TIMING?.TICK_RATE ?? 30);
    if (elapsed > budget * 0.8) {
      this._slowTicks.push({ tick: this.tickCount, ms: elapsed });
      if (this._slowTicks.length > 20) this._slowTicks.shift();
    }

    // Update prev references
    this._prevS = S;
    this._prevJ = J;
  }

  // ══════════════════════════════════════════════════════════════════
  //  [L10] PROFILING API
  // ══════════════════════════════════════════════════════════════════

  /** Mark start of a named subsystem execution. */
  profileStart(name) {
    if (!this.enabled) return;
    this._profStart[name] = performance.now();
  }

  /** Mark end and record duration. */
  profileEnd(name) {
    if (!this.enabled || this._profStart[name] == null) return;
    const ms = performance.now() - this._profStart[name];
    if (!this._profRings[name]) this._profRings[name] = new RingBuffer(PROFILE_WINDOW);
    this._profRings[name].push(ms);
    this._profStart[name] = null;
  }

  /**
   * Get latency percentiles for a named subsystem.
   * @param {string} name
   * @returns {{ p50, p90, p99, mean, max, samples } | null}
   */
  getProfile(name) {
    const ring = this._profRings[name];
    if (!ring || ring.length === 0) return null;
    const arr  = ring.toArray().sort((a, b) => a - b);
    const n    = arr.length;
    return {
      p50:     arr[Math.floor(n * 0.50)] ?? 0,
      p90:     arr[Math.floor(n * 0.90)] ?? 0,
      p99:     arr[Math.floor(n * 0.99)] ?? 0,
      mean:    arr.reduce((s, v) => s + v, 0) / n,
      max:     arr[n - 1] ?? 0,
      samples: n,
    };
  }

  /**
   * Get overall tick latency percentiles.
   * @returns {{ p50, p90, p99, mean, budget_ms, budget_ok } | null}
   */
  getTickLatency() {
    if (this._tickTimeRing.length === 0) return null;
    const arr    = this._tickTimeRing.toArray().sort((a, b) => a - b);
    const n      = arr.length;
    const budget = 1000 / (TIMING?.TICK_RATE ?? 30);
    return {
      p50:       arr[Math.floor(n * 0.50)] ?? 0,
      p90:       arr[Math.floor(n * 0.90)] ?? 0,
      p99:       arr[Math.floor(n * 0.99)] ?? 0,
      mean:      arr.reduce((s, v) => s + v, 0) / n,
      budget_ms: budget,
      budget_ok: (arr[Math.floor(n * 0.99)] ?? 0) < budget,
      slowTicks: this._slowTicks.slice(-5),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  //  [L12] PUBLIC QUERY API
  // ══════════════════════════════════════════════════════════════════

  /**
   * Get last n values of any metric ring.
   * Prefix 'param:' for parameter drift rings (e.g. 'param:alpha').
   */
  getCurve(key, n = RING_SIZE) {
    if (key.startsWith('param:')) return this._paramR[key.slice(6)]?.slice(n) ?? [];
    return this._r[key]?.slice(n) ?? [];
  }

  /** Get all statistical moments for a metric key. */
  getStats(key) {
    return this.statMoments[key] ?? { mean:0, variance:0, std:0, min:0, max:0, skewness:0, kurtosis:0 };
  }

  /** Get OLS trend slope for a metric. Positive = rising, negative = falling. */
  getSlope(key)    { return this.slopes[key] ?? 0; }

  /** Get signed EMA velocity for a metric. */
  getVelocity(key) { return this.velEMA[key] ?? 0; }

  /** Get AR(1) autocorrelation coefficient for a metric. */
  getAR1(key)      { return this.ar1vals[key] ?? 0; }

  /** Is this metric currently experiencing Critical Slowing Down? */
  isCSD(key)       { return this.csdFlags[key] ?? false; }

  /** How many metrics simultaneously show CSD. ≥2 = near tipping point. */
  csdCount()       { return Object.values(this.csdFlags).filter(Boolean).length; }

  /** Get the full cross-correlation matrix. */
  getCorrelations() { return { ...this.corrMatrix }; }

  /** Get latest spectral analysis result. */
  getDFT() { return { ...this.spectral }; }

  /**
   * Get anomaly log with optional filters.
   * @param {'INFO'|'WARN'|'CRITICAL'|null} minSeverity
   * @param {number} n  — max records
   */
  getAnomalies(minSeverity = null, n = 60) {
    let log = this._anomalies;
    if (minSeverity !== null) {
      const floor = SEV[minSeverity] ?? 0;
      log = log.filter(a => SEV[a.severity] >= floor);
    }
    return log.slice(-n);
  }

  /**
   * Count anomalies by type over last windowTicks ticks.
   * @returns {{ [type]: count }}
   */
  anomalyFrequency(windowTicks = 300) {
    const cutoff = this.tickCount - windowTicks;
    const freq   = {};
    for (const a of this._anomalies) {
      if (a.tick < cutoff) continue;
      freq[a.type] = (freq[a.type] ?? 0) + 1;
    }
    return freq;
  }

  // ── Phase / Regime predicates ─────────────────────────────────────

  isEdgeOfChaos()        { return this.phase  === 'CRITICAL'; }
  isChaotic()            { return this.phase  === 'CHAOS';    }
  isOrdered()            { return this.phase  === 'ORDER';    }
  isStable()             { return this.regime === 'STABLE';   }
  isNearTippingPoint()   { return this.csdCount() >= 2;       }
  isOptimalForLearning() { return this.phase === 'CRITICAL' && this.adaptabilityIdx > 0.5; }

  // ── Learning predicates ───────────────────────────────────────────

  isLearning()       { return this.learningRate > 0.0005 && !this.plateauDetected; }
  isConverging()     { return this.convergenceScore > 0.70; }
  isRegressing()     { return this.regressionActive; }

  needsExploration() {
    return this.plateauDetected && this.plateauSince !== null
      && (this.tickCount - this.plateauSince) > 120;
  }

  // ── Snapshots & Reports ───────────────────────────────────────────

  /** Lightweight current-value snapshot. */
  snapshot() {
    const out = {};
    for (const [key, ring] of Object.entries(this._r)) out[key] = ring.latest();
    return out;
  }

  /** Deep structured JSON report for export/logging. */
  fullReport() {
    return {
      meta: {
        tick:           this.tickCount,
        totalCollapses: this.totalCollapses,
        anomalyCount:   this.anomalyCount,
        criticalCount:  this.criticalCount,
        regimeChanges:  this.regimeChanges,
      },
      current:  this.snapshot(),
      regime: {
        regime:         this.regime,
        stabilityScore: this.stabilityScore,
        history:        this.regimeHistory.slice(-8),
      },
      phase: {
        phase:           this.phase,
        confidence:      this.phaseConfidence,
        complexity:      this.complexityScore,
        adaptability:    this.adaptabilityIdx,
        signals:         { ...this.phaseSignals },
        history:         this.phaseHistory.slice(-8),
        recommendation:  this._recommend(),
      },
      csd: {
        flags:     { ...this.csdFlags },
        ar1:       { ...this.csdAR1 },
        varAccel:  { ...this.csdVarAccel },
        count:     this.csdCount(),
        nearTip:   this.isNearTippingPoint(),
      },
      spectral: { ...this.spectral },
      learning: {
        learningRate:      this.learningRate,
        convergenceScore:  this.convergenceScore,
        plateau:           this.plateauDetected,
        plateauSince:      this.plateauSince,
        bestObjective:     this.bestObjective,
        regression:        this.regressionActive,
        transfer:          this.transferDetected,
        transferTick:      this.transferTick,
        infoGainRate:      this.infoGainRate,
        collapseReduction: this.collapseReduction,
        improvementCount:  this._improvements.length,
        recentImprovements:this._improvements.slice(-5),
      },
      correlations: { ...this.corrMatrix },
      stats:        { ...this.statMoments },
      slopes:       { ...this.slopes },
      health: {
        score:      this.healthScore,
        breakdown:  { ...this.healthBkdn },
      },
      profiling: {
        tick:       this.getTickLatency(),
        subsystems: Object.fromEntries(
          Object.keys(this._profRings).map(k => [k, this.getProfile(k)])
        ),
      },
      anomalies:      this.getAnomalies('WARN', 25),
      recommendation: this._recommend(),
    };
  }

  /** Compact human-readable console report. */
  report() {
    const s   = this.snapshot();
    const lat = this.getTickLatency();
    const an  = this.getAnomalies('WARN', 5);
    const csdList = Object.entries(this.csdFlags).filter(([,v])=>v).map(([k])=>k).join(', ');

    return [
      '══ HAKARI v3 DIAGNOSTICS v2 ═══════════════════════════════════════════',
      `  Tick: ${this.tickCount}  │  Collapses: ${this.totalCollapses}  │  Health: ${(this.healthScore*100).toFixed(0)}%  │  Regime changes: ${this.regimeChanges}`,
      `  Phase: ${this.phase.padEnd(8)} conf:${(this.phaseConfidence*100).toFixed(0)}%  │  Regime: ${this.regime.padEnd(8)} stability:${(this.stabilityScore*100).toFixed(0)}%`,
      `  Entropy S:   ${s.entropy.toFixed(4)}  slope=${this.getSlope('entropy').toFixed(5)}  vel=${this.getVelocity('entropy').toFixed(5)}  AR1=${this.getAR1('entropy').toFixed(3)}`,
      `  Strength H:  ${(s.avgStrength*100).toFixed(1)}%    slope=${this.getSlope('avgStrength').toFixed(5)}`,
      `  Objective J: ${s.objective.toFixed(4)}  best=${this.bestObjective.toFixed(4)}  lr=${this.learningRate.toFixed(5)}  conv=${(this.convergenceScore*100).toFixed(0)}%`,
      `  Spectral:    f=${this.spectral.dominantFreq.toFixed(3)}  amp=${this.spectral.dominantAmp.toFixed(4)}  Hspec=${this.spectral.spectralEntropy.toFixed(3)}`,
      `  Plateau: ${this.plateauDetected?'YES tick '+this.plateauSince:'no '.padEnd(12)}  Transfer: ${this.transferDetected?'YES tick '+this.transferTick:'no'}  Regression: ${this.regressionActive?'YES':'no'}`,
      `  CSD:     ${this.csdCount()} active ${csdList?'('+csdList+')':''}  ${this.isNearTippingPoint()?'⚠ TIPPING POINT IMMINENT':''}`,
      `  Complexity: ${(this.complexityScore*100).toFixed(1)}%  Adaptability: ${(this.adaptabilityIdx*100).toFixed(1)}%  Coherence: ${(this.healthBkdn.coherence*100).toFixed(0)}%`,
      lat?`  Latency: p50=${lat.p50.toFixed(2)}ms  p90=${lat.p90.toFixed(2)}ms  p99=${lat.p99.toFixed(2)}ms  ${lat.budget_ok?'✓ OK':'⚠ OVER BUDGET'}  slow_ticks:${this._slowTicks.length}`:'',
      an.length?`  Anomalies: ${an.map(a=>`[${a.severity}]${a.type}`).join('  ')}`:   '  Anomalies: none',
      `  Advice: ${this._recommend()}`,
      '═══════════════════════════════════════════════════════════════════════',
    ].filter(Boolean).join('\n');
  }

  // ── Legacy compatibility ──────────────────────────────────────────

  /** Backward compat: original getCurve(key) without prefix. */
  getCurveCompat(key) { return this.getCurve(key); }

  getParamDrift(key)  { return this._paramR[key]?.toArray() ?? []; }
  getWarnings()       { return this.getAnomalies('WARN').map(a => a.message); }
  clearWarnings()     { this._anomalies = this._anomalies.filter(a => SEV[a.severity] < SEV.WARN); }

  getState() {
    return {
      tick:          this.tickCount,
      healthScore:   this.healthScore,
      regime:        this.regime,
      phase:         this.phase,
      plateau:       this.plateauDetected,
      anomalyCount:  this.anomalyCount,
      csdCount:      this.csdCount(),
      complexity:    this.complexityScore,
      adaptability:  this.adaptabilityIdx,
    };
  }

  clear() {
    for (const r of Object.values(this._r))      r.clear();
    for (const r of Object.values(this._paramR)) r.clear();
    for (const r of Object.values(this._varR))   r.clear();
    for (const r of Object.values(this._profRings)) r.clear();
    this._tickTimeRing.clear();
    this.movingAvgJ.clear();

    this._anomalies     = [];
    this._improvements  = [];
    this.regimeHistory  = [];
    this.phaseHistory   = [];
    this._slowTicks     = [];
    this._lastAnomalyAt = {};

    this.tickCount      = 0;
    this._statTick      = 0;
    this._specTick      = 0;
    this.totalCollapses = 0;
    this.anomalyCount   = 0;
    this.criticalCount  = 0;
    this.regimeChanges  = 0;
    this.bestObjective  = -Infinity;
    this._emaJ          = null;
    this._emaDeltaJ     = 0;
    this._plateauTicks  = 0;
    this.plateauDetected = false;
    this.plateauSince   = null;
    this.transferDetected = false;
    this.transferTick   = null;
    this._wasInPlateau  = false;
    this.regressionActive = false;
    this.regime         = 'STABLE';
    this.phase          = 'ORDER';
    this.healthScore    = 1.0;
    this.velEMA         = {};
    this.absEMA         = {};
    this.statMoments    = {};
    this.slopes         = {};
    this.ar1vals        = {};
    this.csdFlags       = {};
    this.csdAR1         = {};
    this.csdVarAccel    = {};
    this.learningRate   = 0;
    this.convergenceScore = 0;
    this._prevS         = 0;
    this._prevJ         = 0;
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L2] STATISTICAL PASS
  // ══════════════════════════════════════════════════════════════════

  _runStatsPass() {
    for (const [key, ring] of Object.entries(this._r)) {
      if (ring.length === 0) continue;
      const arr = ring.slice(STAT_WINDOW);
      this.statMoments[key] = stats(arr);
      this.slopes[key]      = olsSlope(ring, SLOPE_WINDOW);
      this.ar1vals[key]     = ar1(ring, Math.min(CSD_WINDOW, ring.length));

      // Push variance into its own ring for variance-acceleration tracking
      this._varR[key]?.push(this.statMoments[key].variance);
    }
    // Param rings
    for (const [key, ring] of Object.entries(this._paramR)) {
      if (ring.length < 5) continue;
      const arr = ring.slice(50);
      this.statMoments[`param_${key}`] = stats(arr);
      this.slopes[`param_${key}`]      = olsSlope(ring, 40);
    }
  }

  _updateVelocities(S, J, H, I, C, Cx) {
    const a = VELOCITY_EMA_α;
    const snapshot = { entropy:S, objective:J, avgStrength:H, information:I, collapseRate:C, connectivity:Cx };
    for (const [key, val] of Object.entries(snapshot)) {
      const ring = this._r[key];
      const prev = ring.length >= 2 ? ring.at(ring.length - 2) : val;
      const d    = val - prev;
      this.velEMA[key] = a * d + (1 - a) * (this.velEMA[key] ?? 0);
      this.absEMA[key] = a * Math.abs(d) + (1 - a) * (this.absEMA[key] ?? 0);
    }
  }

  _updateCorrelations() {
    const N = 50;
    this.corrMatrix.entropy_collapse  = pearson(this._r.entropy,      this._r.collapseRate, N);
    this.corrMatrix.entropy_strength  = pearson(this._r.entropy,      this._r.avgStrength,  N);
    this.corrMatrix.objective_info    = pearson(this._r.objective,     this._r.information,  N);
    this.corrMatrix.collapse_strength = pearson(this._r.collapseRate,  this._r.avgStrength,  N);
    this.corrMatrix.strength_info     = pearson(this._r.avgStrength,   this._r.information,  N);
  }

  _updateVarianceAcceleration() {
    for (const [key, ring] of Object.entries(this._varR)) {
      if (ring.length < 4) { this.csdVarAccel[key] = 0; continue; }
      // slope of variance ring = variance acceleration
      this.csdVarAccel[key] = olsSlope(ring, Math.min(10, ring.length));
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L3] SPECTRAL PASS
  // ══════════════════════════════════════════════════════════════════

  _runSpectralPass() {
    const ring = this._r.entropy;
    if (ring.length < DFT_N) return;
    const samples = ring.slice(DFT_N);

    // Remove mean (centre around zero) to suppress DC leakage
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const centred = samples.map(v => v - mean);

    // Apply Hann window to reduce spectral leakage
    for (let i = 0; i < centred.length; i++) {
      centred[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (centred.length - 1)));
    }

    this.spectral = computeDFT(centred);
    this.spectral.dcAmplitude += Math.abs(mean); // re-add DC energy for display
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L4] STABILITY REGIME
  // ══════════════════════════════════════════════════════════════════

  _updateRegime() {
    const wts = {
      entropy:      0.30,
      collapseRate: 0.28,
      objective:    0.20,
      avgStrength:  0.14,
      information:  0.08,
    };

    let composite = 0;
    for (const [key, w] of Object.entries(wts)) {
      composite += (this.statMoments[key]?.variance ?? 0) * w;
    }
    composite += this.csdCount() * 0.014;   // CSD instability bonus

    // Stability score
    this.stabilityScore = Math.max(0, Math.min(1, 1 - composite / REGIME_CHAOTIC_VAR));

    // Hysteresis transition logic
    let target = this.regime;
    if (composite > REGIME_CHAOTIC_VAR + REGIME_HYSTERESIS)  target = 'CHAOTIC';
    else if (composite > REGIME_STABLE_VAR + REGIME_HYSTERESIS) target = 'CRITICAL';
    else if (composite < REGIME_STABLE_VAR - REGIME_HYSTERESIS) target = 'STABLE';

    if (target !== this._prevRegime) {
      this.regimeHistory.push({ tick: this.tickCount, from: this._prevRegime, to: target, composite });
      if (this.regimeHistory.length > 80) this.regimeHistory.shift();
      this.regimeChanges++;
      this._prevRegime = target;

      // Fire phase_flip anomaly when regime changes
      if (this.tickCount > 10) {
        this._anomaly('phase_flip', 'INFO',
          `Regime transition: ${this.regime} → ${target}  (composite=${composite.toFixed(4)})`,
          { from: this.regime, to: target });
      }
    }
    this.regime = target;
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L5] PHASE DETECTION (5-signal vote)
  // ══════════════════════════════════════════════════════════════════

  _updatePhase(nodes) {
    // Signal 1: Lyapunov approximation (weight 0.30)
    {
      const ring = this._r.entropy;
      const buf  = ring.slice(Math.min(LYAP_WINDOW, ring.length));
      let sumD1 = 0, sumD2 = 0, n1 = 0, n2 = 0;
      for (let i = 1; i < buf.length; i++) {
        sumD1 += Math.abs(buf[i] - buf[i-1]); n1++;
        if (i > 1) { sumD2 += Math.abs(buf[i] - 2*buf[i-1] + buf[i-2]); n2++; }
      }
      const m1 = n1 > 0 ? sumD1 / n1 : 0;
      const m2 = n2 > 0 ? sumD2 / n2 : 0;
      const λ  = m1 > 1e-7 ? (m2 / m1) - 1 : 0;
      this.phaseSignals.lyapunov = {
        phase:  λ > LYAP_CHAOS ? 'CHAOS' : λ < LYAP_ORDER ? 'ORDER' : 'CRITICAL',
        value:  λ,
        weight: 0.30,
      };
    }

    // Signal 2: Entropy slope OLS (weight 0.25)
    {
      const slope = this.slopes.entropy ?? 0;
      this.phaseSignals.slope = {
        phase:  slope > SLOPE_CHAOS ? 'CHAOS' : slope < SLOPE_ORDER ? 'ORDER' : 'CRITICAL',
        value:  slope,
        weight: 0.25,
      };
    }

    // Signal 3: Activation spread σ_A (weight 0.20)
    {
      let spreadPhase = 'ORDER', spreadVal = 0;
      if (nodes.length > 2) {
        const scores = nodes.map(n => n.activationScore ?? 0);
        const s = stats(scores);
        spreadVal  = s.std;
        spreadPhase = spreadVal > SPREAD_CHAOS ? 'CHAOS'
                    : spreadVal < SPREAD_ORDER  ? 'ORDER'
                    : 'CRITICAL';
      }
      this.phaseSignals.spread = {
        phase:  spreadPhase,
        value:  spreadVal,
        weight: 0.20,
      };
    }

    // Signal 4: Spectral dominant frequency (weight 0.15)
    {
      const f = this.spectral.dominantFreq;
      const spectralPhase = f > FREQ_CHAOS_MIN ? 'CHAOS'
                          : f < FREQ_ORDER_MAX  ? 'ORDER'
                          : 'CRITICAL';
      this.phaseSignals.spectral = {
        phase:  spectralPhase,
        value:  f,
        weight: 0.15,
      };
    }

    // Signal 5: Variance acceleration d²σ/dt² (weight 0.10)
    {
      const accel = this.csdVarAccel.entropy ?? 0;
      const accelPhase = accel > VARACCEL_CHAOS ? 'CHAOS'
                       : accel < 0              ? 'ORDER'
                       : 'CRITICAL';
      this.phaseSignals.varaccel = {
        phase:  accelPhase,
        value:  accel,
        weight: 0.10,
      };
    }

    // Weighted vote
    const votes = { ORDER: 0, CRITICAL: 0, CHAOS: 0 };
    for (const sig of Object.values(this.phaseSignals)) {
      votes[sig.phase] += sig.weight;
    }

    const winner   = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    const winVotes = votes[winner];
    const total    = Object.values(votes).reduce((s, v) => s + v, 0);

    this.phaseConfidence = total > 0 ? winVotes / total : 0.33;

    // Complexity: peaks sharply at CRITICAL
    this.complexityScore =
        winner === 'CRITICAL' ? Math.min(1, 0.55 + winVotes * 0.50 + votes.CHAOS * 0.10)
      : winner === 'ORDER'    ? votes.CRITICAL * 0.45
      : votes.CRITICAL * 0.25;

    // Adaptability: ability to learn and reorganise
    this.adaptabilityIdx =
        winner === 'CRITICAL' ? Math.min(1, 0.50 + this.phaseConfidence * 0.55)
      : winner === 'ORDER'    ? 0.18
      : 0.12;

    const newPhase = winner;
    if (newPhase !== this._prevPhaseStr) {
      this.phaseHistory.push({ tick: this.tickCount, phase: newPhase, confidence: this.phaseConfidence });
      if (this.phaseHistory.length > 120) this.phaseHistory.shift();
      this._prevPhaseStr = newPhase;
    }
    this.phase = newPhase;
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L6] CSD (CRITICAL SLOWING DOWN)
  // ══════════════════════════════════════════════════════════════════

  _updateCSD() {
    for (const [key, ring] of Object.entries(this._r)) {
      if (ring.length < CSD_WINDOW) { this.csdFlags[key] = false; continue; }

      const phi     = ar1(ring, CSD_WINDOW);
      const varAccel = this.csdVarAccel[key] ?? 0;

      this.csdAR1[key] = phi;

      // Dual-trigger: AR(1) high AND variance accelerating
      this.csdFlags[key] = phi > CSD_AR1_THRESH && varAccel > CSD_VAR_ACCEL_MIN;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L7] LEARNING ANALYTICS
  // ══════════════════════════════════════════════════════════════════

  _updateLearning(J, I, C) {
    const a = LEARNING_EMA_α;

    // EMA of J
    this._emaJ = this._emaJ === null ? J : a * J + (1 - a) * this._emaJ;
    this.movingAvgJ.push(this._emaJ);

    // EMA of |ΔJ|
    const prevJ  = this._r.objective.length >= 2 ? this._r.objective.at(this._r.objective.length - 2) : J;
    const dJ     = J - prevJ;
    this._emaDeltaJ = a * Math.abs(dJ) + (1 - a) * this._emaDeltaJ;

    // Best objective tracking
    if (J > this.bestObjective) {
      const delta = J - (this.bestObjective === -Infinity ? J : this.bestObjective);
      if (this.bestObjective !== -Infinity && delta > 0) {
        this._improvements.push({ tick: this.tickCount, J, delta });
        if (this._improvements.length > 60) this._improvements.shift();
      }
      this.bestObjective = J;
    }

    // OLS learning rate
    this.learningRate     = olsSlope(this._r.objective, 35);

    // Convergence: asymptotic approach to bestJ
    this.convergenceScore = (this.bestObjective > -Infinity && this.bestObjective !== 0)
      ? Math.min(1, 1 - Math.exp(-5 * Math.max(0, J / this.bestObjective)))
      : 0;

    // Regression: sustained negative slope
    this.regressionActive = this.learningRate < -0.0012 && this.tickCount > 80;

    // Plateau detection
    const wasPlat = this.plateauDetected;
    if (this._emaDeltaJ < PLATEAU_EMA_THRESH) {
      this._plateauTicks++;
      if (this._plateauTicks >= PLATEAU_PATIENCE && !this.plateauDetected) {
        this.plateauDetected = true;
        this.plateauSince    = this.tickCount - PLATEAU_PATIENCE;
        this._wasInPlateau   = true;
      }
    } else {
      // Possible transfer learning: J jumped after plateau
      if (this._wasInPlateau && !wasPlat && Math.abs(dJ) > TRANSFER_JUMP_MIN) {
        this.transferDetected = true;
        this.transferTick     = this.tickCount;
        this._anomaly('transfer_learning_event', 'INFO',
          `Transfer learning event: J jumped +${dJ.toFixed(4)} after plateau`,
          { delta: dJ, tick: this.tickCount });
      }
      this._plateauTicks   = 0;
      this.plateauDetected = false;
      this.plateauSince    = null;
      this._wasInPlateau   = false;
    }

    // Info gain rate
    this.infoGainRate = olsSlope(this._r.information, 30);

    // Collapse reduction (first vs second half of recent buffer)
    const cbuf = this._r.collapseRate.slice(Math.min(60, this._r.collapseRate.length));
    if (cbuf.length >= 10) {
      const half = Math.floor(cbuf.length / 2);
      const aH   = cbuf.slice(0, half).reduce((s, v) => s + v, 0) / half;
      const bH   = cbuf.slice(half).reduce((s, v)   => s + v, 0) / (cbuf.length - half);
      this.collapseReduction = aH - bH;   // positive = improving
    }

    // Objective ceiling detection
    if (this.convergenceScore > 0.97 && this.tickCount > 200) {
      this._anomaly('objective_ceiling_hit', 'INFO',
        `Objective ceiling: J=${J.toFixed(4)} ≈ best (conv=${(this.convergenceScore*100).toFixed(1)}%)`,
        { J, convergence: this.convergenceScore });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L11] HEALTH SCORE
  // ══════════════════════════════════════════════════════════════════

  _updateHealthScore() {
    // Stability sub-score
    const stability = this.stabilityScore;

    // Learning sub-score
    const learning = Math.max(0, Math.min(1,
      0.45
      + (this.isLearning()       ?  0.25 : 0)
      + (this.isConverging()     ?  0.20 : 0)
      + (this.transferDetected   ?  0.10 : 0)
      - (this.plateauDetected    ?  0.20 : 0)
      - (this.regressionActive   ?  0.30 : 0)
    ));

    // Efficiency sub-score (tick latency)
    const lat = this.getTickLatency();
    const efficiency = lat
      ? (lat.budget_ok ? 1.0 : Math.max(0, 1 - (lat.p99 - lat.budget_ms) / lat.budget_ms))
      : 1.0;

    // Resilience sub-score
    const cr       = this._r.collapseRate.latest();
    const critRate = this.criticalCount / Math.max(1, this.tickCount);
    const resilience = Math.max(0, Math.min(1, 1 - cr * 0.045 - critRate * 60));

    // Coherence: cross-metric agreement (are expected correlations present?)
    // Entropy↔Strength should be negative. Objective↔Info should be positive.
    const coherence = Math.max(0, Math.min(1,
      0.5
      + (this.corrMatrix.entropy_strength  < -0.25 ?  0.25 : 0)
      + (this.corrMatrix.objective_info    >  0.20 ?  0.25 : 0)
      - (this.corrMatrix.entropy_collapse  >  0.70 ?  0.20 : 0)  // bad: entropy causing cascades
      - (this.csdCount() * 0.08)
    ));

    this.healthBkdn = { stability, learning, efficiency, resilience, coherence };

    this.healthScore = Math.max(0, Math.min(1,
      stability  * 0.28 +
      learning   * 0.27 +
      resilience * 0.22 +
      efficiency * 0.13 +
      coherence  * 0.10
    ));
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L8] ANOMALY DETECTION (20 types)
  // ══════════════════════════════════════════════════════════════════

  _detectAnomalies(state, S, C, E, J, H, I, N, Cx) {

    // ── 1. Entropy spike ─────────────────────────────────────────
    const ΔS = S - this._prevS;
    if (ΔS > 0.25) {
      this._anomaly('entropy_spike', 'WARN',
        `Entropy spike +${ΔS.toFixed(3)} (S=${S.toFixed(3)})`,
        { delta: ΔS, S, attribution: this._attributeCause('entropy_spike', {}) });
    }

    // ── 2. Collapse cascade ──────────────────────────────────────
    if (C >= 5) {
      this._anomaly('collapse_cascade', 'CRITICAL',
        `Collapse cascade: ${C} nodes collapsed this tick`,
        { count: C, entropy: S, strength: H });
    }

    // ── 3. Energy overload ───────────────────────────────────────
    if (state.energyOverload) {
      this._anomaly('energy_overload', 'WARN',
        `Energy overload — field rescaled (E=${E.toFixed(2)})`,
        { totalEnergy: E });
    }

    // ── 4. Parameter runaway ─────────────────────────────────────
    if (state.runawayParams?.length > 0) {
      this._anomaly('param_runaway', 'WARN',
        `Param bounds exceeded: ${state.runawayParams.join(', ')}`,
        { params: state.runawayParams });
    }

    // ── 5. Parameter freeze ───────────────────────────────────────
    {
      const frozen = [];
      for (const [k, ring] of Object.entries(this._paramR)) {
        if (ring.length >= 40) {
          const s = stats(ring.slice(40));
          if (s.variance < 5e-11 && s.mean !== 0) frozen.push(k);
        }
      }
      if (frozen.length >= 4) {
        this._anomaly('param_freeze', 'INFO',
          `${frozen.length} parameters frozen — MetaOptimizer may be stalled`,
          { params: frozen });
      }
    }

    // ── 6. System stall ───────────────────────────────────────────
    if (H < 0.025 && N < 4) {
      this._anomaly('system_stall', 'CRITICAL',
        `System near death — ${N} nodes, meanH=${(H*100).toFixed(1)}%`,
        { nodeCount: N, avgStrength: H });
    }

    // ── 7. Network collapse (accelerating rate) ───────────────────
    if ((this.velEMA.collapseRate ?? 0) > 0.55) {
      this._anomaly('network_collapse', 'CRITICAL',
        `Network collapse accelerating — vel=${(this.velEMA.collapseRate).toFixed(3)}`,
        { velocity: this.velEMA.collapseRate });
    }

    // ── 8. Strength freefall ──────────────────────────────────────
    if ((this.velEMA.avgStrength ?? 0) < -0.007) {
      this._anomaly('strength_freefall', 'WARN',
        `Strength freefall — meanH dropping fast (vel=${(this.velEMA.avgStrength).toFixed(4)})`,
        { velocity: this.velEMA.avgStrength, H });
    }

    // ── 9. Entropy deadlock (high S, zero variance) ───────────────
    if (this._r.entropy.length >= 70) {
      const s = stats(this._r.entropy.slice(70));
      if (s.mean > 0.88 && s.variance < 0.0008) {
        this._anomaly('entropy_deadlock', 'WARN',
          `Entropy deadlock — S=${s.mean.toFixed(3)} frozen high`,
          { mean: s.mean, variance: s.variance });
      }
    }

    // ── 10. Oscillation detected (zero-crossings) ─────────────────
    if (this._r.entropy.length >= 44) {
      const arr = this._r.entropy.slice(44);
      const mid = stats(arr).mean;
      let xings = 0;
      for (let i = 1; i < arr.length; i++) {
        if ((arr[i-1] - mid) * (arr[i] - mid) < 0) xings++;
      }
      if (xings >= 14) {
        this._anomaly('oscillation_detected', 'INFO',
          `System oscillating — ${xings} entropy zero-crossings in 44 ticks`,
          { crossings: xings, frequency: this.spectral.dominantFreq });
      }
    }

    // ── 11. Tipping point warning (CSD dual-trigger) ──────────────
    if (this.csdCount() >= 2) {
      this._anomaly('tipping_point_warning', 'WARN',
        `Tipping point risk — ${this.csdCount()} metrics show CSD (AR1+VarAccel)`,
        { csdFlags: { ...this.csdFlags }, csdAR1: { ...this.csdAR1 } });
    }

    // ── 12. Learning regression ───────────────────────────────────
    if (this.regressionActive) {
      this._anomaly('learning_regression', 'WARN',
        `Learning regression — J declining (rate=${this.learningRate.toFixed(5)})`,
        { learningRate: this.learningRate, J, bestJ: this.bestObjective });
    }

    // ── 13. Information drought ───────────────────────────────────
    if (I < 0.0008 && this.tickCount > 60) {
      this._anomaly('information_drought', 'INFO',
        `Information drought — I=${I.toFixed(4)}, knowledge flow near zero`,
        { information: I, infoGainRate: this.infoGainRate });
    }

    // ── 14. Connectivity explosion ────────────────────────────────
    if (Cx > 0.94) {
      this._anomaly('connectivity_explosion', 'WARN',
        `Connectivity explosion — C=${Cx.toFixed(3)}, edge overhead critical`,
        { connectivity: Cx });
    }

    // ── 15. Phase flip (handled in _updateRegime) ─────────────────
    // (fired from _updateRegime on regime change)

    // ── 16. Lyapunov surge ────────────────────────────────────────
    const λ = this.phaseSignals.lyapunov?.value ?? 0;
    if (λ > 0.08) {
      this._anomaly('lyapunov_surge', 'WARN',
        `Lyapunov surge λ=${λ.toFixed(4)} — trajectory divergence accelerating`,
        { lambda: λ });
    }

    // ── 17. Reinforcement collapse ────────────────────────────────
    if ((this.velEMA.reinforcement ?? 0) < -0.015 && this._r.reinforcement.latest() < 0.05) {
      this._anomaly('reinforcement_collapse', 'WARN',
        `Reinforcement signal collapsed — network losing self-reinforcement capacity`,
        { reinforcement: this._r.reinforcement.latest(), velocity: this.velEMA.reinforcement });
    }

    // ── 18. Spectral mode lock ─────────────────────────────────────
    //    (entropy oscillating at one strong fixed frequency for a long time)
    if (this.spectral.spectralEntropy < 0.12 && this.spectral.dominantAmp > 0.04) {
      this._anomaly('spectral_mode_lock', 'INFO',
        `Spectral mode lock — entropy stuck in f=${this.spectral.dominantFreq.toFixed(3)} cycle (amp=${this.spectral.dominantAmp.toFixed(4)})`,
        { freq: this.spectral.dominantFreq, amp: this.spectral.dominantAmp, hspec: this.spectral.spectralEntropy });
    }

    // ── 19. Transfer learning event (in _updateLearning) ─────────
    // (fired from _updateLearning)

    // ── 20. Objective ceiling (in _updateLearning) ────────────────
    // (fired from _updateLearning)
  }

  // ── Anomaly record builder ─────────────────────────────────────────

  _anomaly(type, severity, message, data = {}) {
    const cd     = COOLDOWNS[type] ?? 20;
    const lastAt = this._lastAnomalyAt[type] ?? -Infinity;
    if (this.tickCount - lastAt < cd) return;

    this._lastAnomalyAt[type] = this.tickCount;
    this.anomalyCount++;
    if (severity === 'CRITICAL') this.criticalCount++;

    const record = {
      type,
      severity,
      tick:         this.tickCount,
      message,
      data,
      attribution:  data.attribution ?? this._attributeCause(type, data),
    };

    this._anomalies.push(record);
    if (this._anomalies.length > 600) this._anomalies.shift();

    if (severity === 'CRITICAL') console.error(`[HAKARI❌] ${message}`);
    else if (severity === 'WARN') console.warn(`[HAKARI⚠] ${message}`);
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — [L9] CAUSAL ATTRIBUTION
  // ══════════════════════════════════════════════════════════════════

  /**
   * Multi-factor causal attribution.
   * Returns { cause, confidence, chain: [factor1, factor2, ...] }
   * where chain lists contributing factors in order of contribution.
   */
  _attributeCause(type, data) {
    const eSlope  = this.slopes.entropy      ?? 0;
    const hSlope  = this.slopes.avgStrength  ?? 0;
    const cSlope  = this.slopes.collapseRate ?? 0;
    const jSlope  = this.slopes.objective    ?? 0;
    const eCorrC  = this.corrMatrix.entropy_collapse  ?? 0;
    const eCorrH  = this.corrMatrix.entropy_strength  ?? 0;
    const oCorrI  = this.corrMatrix.objective_info    ?? 0;
    const cVelEMA = this.velEMA.collapseRate ?? 0;
    const hVelEMA = this.velEMA.avgStrength  ?? 0;

    const factors = [];

    switch (type) {

      case 'entropy_spike':
        if (cVelEMA > 0.2)   factors.push({ f:'cascade_feedback',    c:0.78, d:'Collapse wave raised system entropy' });
        if (eSlope  > 0.008) factors.push({ f:'sustained_rise',      c:0.65, d:'Entropy has been rising for several ticks' });
        if (this._r.nodeCount.latest() < 12) factors.push({ f:'graph_sparsity', c:0.60, d:'Few nodes concentrate entropy' });
        if (!factors.length) factors.push({ f:'stochastic',          c:0.35, d:'No structural cause — noise peak' });
        break;

      case 'collapse_cascade':
        if (eSlope  > 0.005) factors.push({ f:'entropy_pressure',   c:0.84, d:'Rising S exceeds reinforcement capacity' });
        if (hSlope  < -0.004)factors.push({ f:'strength_depletion', c:0.72, d:'Systematic strength loss preceded cascade' });
        if (eCorrC  > 0.65)  factors.push({ f:'entropy_collapse_coupling', c:0.70, d:`Entropy↔collapse corr r=${eCorrC.toFixed(2)}` });
        if (!factors.length) factors.push({ f:'multi_factor',       c:0.30, d:'Multiple simultaneous causes' });
        break;

      case 'strength_freefall':
        if (eCorrH  < -0.55) factors.push({ f:'entropy_suppression',  c:0.82, d:`Entropy↔strength anticorr r=${eCorrH.toFixed(2)}` });
        if (cSlope  >  0.012)factors.push({ f:'collapse_drainage',    c:0.72, d:'Rising collapses draining mean strength' });
        if (oCorrI  <  0.20) factors.push({ f:'info_flow_starvation', c:0.55, d:'Weak info flow starving strength growth' });
        if (!factors.length) factors.push({ f:'natural_decay',        c:0.45, d:'Decay exceeds reinforcement' });
        break;

      case 'learning_regression':
        if (eCorrC  > 0.65) factors.push({ f:'entropy_cascade_loop',    c:0.80, d:'Entropy↔collapse loop hurting J' });
        if (jSlope  < -0.003)factors.push({ f:'metaoptimizer_overshoot',c:0.60, d:'Parameter evolution may have overshot' });
        if (oCorrI  < 0.10) factors.push({ f:'info_drought',            c:0.55, d:'Low information starving objective' });
        if (!factors.length) factors.push({ f:'local_maximum',          c:0.45, d:'System at local J ceiling' });
        break;

      case 'tipping_point_warning':
        factors.push({
          f: 'critical_slowing_down',
          c: Math.min(0.98, 0.70 + this.csdCount() * 0.07),
          d: `${this.csdCount()} metrics AR1>${CSD_AR1_THRESH} + variance accelerating`,
        });
        if (eCorrC > 0.5) factors.push({ f:'entropy_cascade_coupling', c:0.55, d:'Entropy driving collapse escalation' });
        break;

      case 'network_collapse':
        if (eSlope > 0.01) factors.push({ f:'entropy_overload',    c:0.78, d:'Rapid entropy rise killing nodes' });
        if (hSlope < -0.005)factors.push({ f:'reinforcement_loss', c:0.65, d:'Strength loss removing mutual stabilisation' });
        if (!factors.length) factors.push({ f:'decay_cascade',     c:0.50, d:'Adaptive decay exceeding birth rate' });
        break;

      default:
        factors.push({ f: 'unattributed', c: 0.20, d: 'Insufficient causal signal' });
    }

    // Sort by confidence descending
    factors.sort((a, b) => b.c - a.c);

    return {
      cause:      factors[0]?.f ?? 'unknown',
      confidence: factors[0]?.c ?? 0.20,
      detail:     factors[0]?.d ?? '',
      chain:      factors.slice(0, 3).map(f => ({ factor: f.f, confidence: f.c, detail: f.d })),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRIVATE — RECOMMENDATION ENGINE
  // ══════════════════════════════════════════════════════════════════

  _recommend() {
    const N = this._r.nodeCount.latest();
    if (N < 5)
      return '🔴 CRITICAL: System near death — spawn nodes immediately.';

    if (this.csdCount() >= 3)
      return '⚠ TIPPING POINT IMMINENT — reduce entropy injection, boost reinforcement now.';

    if (this.regime === 'CHAOTIC' && this.phase === 'CHAOS')
      return '⚠ System chaotic — halt entropy injection, reinforce key nodes, allow natural decay.';

    if (this.regressionActive && this.tickCount > 200)
      return '⬇ Learning regression — reset MetaOptimizer or inject novelty nodes.';

    if (this.needsExploration())
      return `⏸ Plateau since tick ${this.plateauSince} (${this.tickCount - this.plateauSince} ticks) — inject entropy or spawn nodes.`;

    if (this.spectral.spectralEntropy < 0.15 && this.spectral.dominantAmp > 0.04)
      return '🔁 Spectral mode lock — system in deterministic cycle, inject noise to escape.';

    if (this.phase === 'ORDER' && this.regime === 'STABLE')
      return '🔵 System frozen — inject entropy or query to unlock adaptive dynamics.';

    if (this.isOptimalForLearning())
      return '✅ Edge of chaos — OPTIMAL learning state. Run queries now for maximum impact.';

    if (this.phase === 'CRITICAL')
      return '🟡 Critical phase — system adaptive. Query and reinforce to consolidate.';

    if (this.transferDetected)
      return `⚡ Transfer event at tick ${this.transferTick} — reinforce immediately to consolidate gains.`;

    if (this.healthScore > 0.88)
      return '✅ System healthy. Continue current operation.';

    return '👁 Monitor: system in transition. Avoid large perturbations.';
  }
}