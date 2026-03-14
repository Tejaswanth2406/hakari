/**
 * HAKARI v3 — debug/CognitivePhaseDetector.js
 * ─────────────────────────────────────────────
 * Detects the operational phase of the cognitive
 * field using dynamical systems theory.
 *
 * Three phases:
 *   ORDER      — frozen, low entropy, rigid graph
 *   CRITICAL   — edge of chaos, maximal complexity,
 *                ideal for learning + adaptation
 *   CHAOS      — unconstrained, high entropy, collapse
 *
 * Detection uses three independent signals:
 *
 *   1. Lyapunov exponent approximation
 *      Measures divergence of nearby trajectories.
 *      λ > 0 → chaos, λ ≈ 0 → edge, λ < 0 → order
 *
 *   2. Entropy slope
 *      dS/dt averaged over window.
 *      Rising fast → chaos, falling → order
 *
 *   3. Activation spread σ_A
 *      Std-dev of activation scores across nodes.
 *      Low spread → order, high spread → chaos,
 *      bimodal distribution → edge of chaos
 *
 * Final phase = weighted vote of 3 signals.
 * Confidence = agreement between signals (0–1).
 *
 * Also outputs:
 *   - Complexity score (peaks at CRITICAL)
 *   - Adaptability index (learning potential)
 *   - Recommendation (what to do about it)
 * ─────────────────────────────────────────────
 */

const LYAP_WINDOW     = 30;    // ticks for Lyapunov estimate
const SLOPE_WINDOW    = 20;    // ticks for entropy slope
const SPREAD_WINDOW   = 5;     // ticks for activation spread average

// Phase thresholds
const LYAP_CHAOS      = 0.02;
const LYAP_ORDER      = -0.01;
const SLOPE_CHAOS     = 0.008;
const SLOPE_ORDER     = -0.005;
const SPREAD_CHAOS    = 0.35;
const SPREAD_ORDER    = 0.08;

export class CognitivePhaseDetector {

  constructor() {
    // Rolling buffers
    this._entropyBuf    = [];
    this._strengthBuf   = [];
    this._activationBuf = [];   // arrays of node activation scores

    // Current detections
    this.phase          = 'ORDER';
    this.confidence     = 0.5;
    this.complexityScore = 0;
    this.adaptabilityIndex = 0;

    // Per-signal outputs
    this.signals = {
      lyapunov: { phase: 'ORDER', value: 0 },
      slope:    { phase: 'ORDER', value: 0 },
      spread:   { phase: 'ORDER', value: 0 },
    };

    this.tickCount      = 0;
    this._phaseHistory  = [];  // {tick, phase, confidence}
  }

  // ── UPDATE ───────────────────────────────────

  /**
   * Ingest current system state.
   * @param {object} state
   *   state.entropy       — S(t)
   *   state.avgStrength   — mean H
   *   state.nodes         — Node[] (for activation spread)
   * @param {number} tick
   */
  update(state, tick) {
    this.tickCount++;

    const S    = state.entropy      ?? 0;
    const H    = state.avgStrength  ?? 0;
    const nodes = state.nodes       ?? [];

    // Buffer entropy + strength
    this._push(this._entropyBuf,  S, LYAP_WINDOW);
    this._push(this._strengthBuf, H, LYAP_WINDOW);

    // Buffer activation scores snapshot
    if (nodes.length > 0) {
      const scores = nodes.map(n => n.activationScore ?? 0);
      this._push(this._activationBuf, scores, SPREAD_WINDOW);
    }

    // Only compute when buffers have enough data
    if (this._entropyBuf.length < 5) return;

    // ── Signal 1: Lyapunov approximation ──────
    this.signals.lyapunov = this._lyapunovSignal();

    // ── Signal 2: Entropy slope ────────────────
    this.signals.slope = this._slopeSignal();

    // ── Signal 3: Activation spread ────────────
    this.signals.spread = this._spreadSignal();

    // ── Vote ───────────────────────────────────
    this._vote(tick);
  }

  // ── READ ─────────────────────────────────────

  /**
   * @returns {{ phase, confidence, complexity, adaptability, signals, recommendation }}
   */
  report() {
    return {
      phase:            this.phase,
      confidence:       this.confidence,
      complexityScore:  this.complexityScore,
      adaptabilityIndex: this.adaptabilityIndex,
      signals:          { ...this.signals },
      recommendation:   this._recommend(),
      recentHistory:    this._phaseHistory.slice(-10),
    };
  }

  isEdgeOfChaos()   { return this.phase === 'CRITICAL'; }
  isChaotic()       { return this.phase === 'CHAOS';    }
  isOrdered()       { return this.phase === 'ORDER';    }

  /**
   * Is the system in the ideal learning regime?
   * Complexity peaks at CRITICAL, adaptability also high.
   */
  isOptimalForLearning() {
    return this.phase === 'CRITICAL' && this.adaptabilityIndex > 0.5;
  }

  // ── CLEAR ────────────────────────────────────

  clear() {
    this._entropyBuf    = [];
    this._strengthBuf   = [];
    this._activationBuf = [];
    this.phase          = 'ORDER';
    this.confidence     = 0.5;
    this.complexityScore = 0;
    this.adaptabilityIndex = 0;
    this.tickCount      = 0;
    this._phaseHistory  = [];
    this.signals        = {
      lyapunov: { phase: 'ORDER', value: 0 },
      slope:    { phase: 'ORDER', value: 0 },
      spread:   { phase: 'ORDER', value: 0 },
    };
  }

  // ── DIAGNOSTICS ──────────────────────────────

  getState() {
    return {
      phase:           this.phase,
      confidence:      this.confidence,
      complexity:      this.complexityScore,
      adaptability:    this.adaptabilityIndex,
      edgeOfChaos:     this.isEdgeOfChaos(),
      optimalLearning: this.isOptimalForLearning(),
    };
  }

  // ── PRIVATE — SIGNALS ────────────────────────

  /**
   * Approximate Lyapunov exponent from entropy trajectory.
   * Uses the divergence rate of the running entropy curve.
   * λ ≈ mean(|Δ²S|) / mean(|ΔS|)  (crude finite-difference approx)
   */
  _lyapunovSignal() {
    const buf = this._entropyBuf;
    if (buf.length < 4) return { phase: 'ORDER', value: 0 };

    const deltas  = [];
    const delta2s = [];
    for (let i = 1; i < buf.length; i++) {
      deltas.push(Math.abs(buf[i] - buf[i - 1]));
      if (i > 1) delta2s.push(Math.abs(buf[i] - 2 * buf[i - 1] + buf[i - 2]));
    }

    const mean1 = deltas.reduce((s, v) => s + v, 0) / deltas.length;
    const mean2 = delta2s.reduce((s, v) => s + v, 0) / (delta2s.length || 1);

    const lambda = mean1 > 1e-6 ? (mean2 / mean1) - 1 : 0;

    const phase = lambda >  LYAP_CHAOS  ? 'CHAOS'
               : lambda <  LYAP_ORDER  ? 'ORDER'
               : 'CRITICAL';

    return { phase, value: lambda };
  }

  /**
   * Entropy slope — direction and magnitude of S(t) trend.
   */
  _slopeSignal() {
    const buf    = this._entropyBuf.slice(-SLOPE_WINDOW);
    if (buf.length < 3) return { phase: 'ORDER', value: 0 };

    // Linear regression slope
    const n    = buf.length;
    const sumX = n * (n - 1) / 2;
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6;
    let   sumY = 0, sumXY = 0;
    for (let i = 0; i < n; i++) {
      sumY  += buf[i];
      sumXY += i * buf[i];
    }
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom > 0 ? (n * sumXY - sumX * sumY) / denom : 0;

    const phase = slope >  SLOPE_CHAOS  ? 'CHAOS'
               : slope <  SLOPE_ORDER  ? 'ORDER'
               : 'CRITICAL';

    return { phase, value: slope };
  }

  /**
   * Activation spread — std-dev of activationScore across nodes.
   * Bimodal → many inactive + some highly active = CRITICAL.
   */
  _spreadSignal() {
    if (this._activationBuf.length === 0) return { phase: 'ORDER', value: 0 };

    // Use most recent snapshot
    const scores = this._activationBuf[this._activationBuf.length - 1];
    if (!Array.isArray(scores) || scores.length < 2) return { phase: 'ORDER', value: 0 };

    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const std  = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);

    const phase = std > SPREAD_CHAOS ? 'CHAOS'
               : std < SPREAD_ORDER ? 'ORDER'
               : 'CRITICAL';

    return { phase, value: std };
  }

  // ── PRIVATE — VOTE ───────────────────────────

  /**
   * Weighted vote: lyapunov 0.4, slope 0.35, spread 0.25.
   */
  _vote(tick) {
    const weights = { lyapunov: 0.40, slope: 0.35, spread: 0.25 };
    const scores  = { ORDER: 0, CRITICAL: 0, CHAOS: 0 };

    for (const [key, w] of Object.entries(weights)) {
      const p = this.signals[key]?.phase ?? 'ORDER';
      scores[p] += w;
    }

    // Find winner
    const winner    = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    const winScore  = scores[winner];
    const total     = Object.values(scores).reduce((s, v) => s + v, 0);

    this.phase      = winner;
    this.confidence = total > 0 ? winScore / total : 0.33;

    // Complexity peaks at CRITICAL
    this.complexityScore =
        winner === 'CRITICAL' ? 0.6 + scores.CRITICAL * 0.4
      : winner === 'ORDER'    ? scores.CRITICAL * 0.5
      : scores.CRITICAL * 0.3;   // CHAOS — some complexity but declining

    // Adaptability: peaks at CRITICAL, low in ORDER + CHAOS
    this.adaptabilityIndex =
        winner === 'CRITICAL' ? Math.min(1, this.confidence + 0.3)
      : winner === 'ORDER'    ? 0.2
      : 0.15;

    // Record history
    this._phaseHistory.push({ tick, phase: winner, confidence: this.confidence });
    if (this._phaseHistory.length > 100) this._phaseHistory.shift();
  }

  // ── PRIVATE — RECOMMENDATION ─────────────────

  _recommend() {
    switch (this.phase) {
      case 'ORDER':
        return 'System is frozen. Inject entropy or spawn new nodes to unlock complexity.';
      case 'CRITICAL':
        return this.adaptabilityIndex > 0.5
          ? 'Edge of chaos — ideal for learning and concept formation. Run queries.'
          : 'Near critical. Increase query activation to push into full CRITICAL zone.';
      case 'CHAOS':
        return 'System is chaotic. Reduce entropy injection, boost reinforcement, allow natural decay.';
      default:
        return '—';
    }
  }

  _push(arr, val, max) {
    arr.push(val);
    if (arr.length > max) arr.shift();
  }
}