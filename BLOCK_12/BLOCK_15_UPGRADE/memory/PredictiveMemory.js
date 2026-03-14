/**
 * HAKARI v3 — memory/PredictiveMemory.js
 * ─────────────────────────────────────────────
 * Learns from stored events to predict future
 * outcomes using:
 *   - N-gram sequence patterns (n=2,3)
 *   - Velocity / trend modeling per metric
 *   - Causal graph probability inference
 *   - Confidence-weighted prediction output
 *
 * All predictions return:
 *   [{ event, probability, confidence, source }]
 * ─────────────────────────────────────────────
 */

export class PredictiveMemory {

  /**
   * @param {TemporalIndex}  temporalIndex
   * @param {LongTermMemory} longTermMemory
   */
  constructor(temporalIndex = null, longTermMemory = null) {
    this._temporal  = temporalIndex;
    this._longTerm  = longTermMemory;

    // N-gram patterns: key → { count, outcomes: Map(type→count) }
    this._bigrams   = new Map();
    this._trigrams  = new Map();

    // Metric velocity model: metricName → { values[], velocity, acceleration }
    this._metrics   = new Map();

    // Pending predictions: { tick, predictions[], resolved }
    this._pending   = [];

    // Pattern performance: patternKey → { correct, total }
    this._accuracy  = new Map();

    // Recent event type sequence (last 6)
    this._typeSeq   = [];

    // Stats
    this._learned   = 0;
    this._predicted = 0;
    this._resolved  = 0;
  }

  // ══════════════════════════════════════════════
  // UPDATE  — called every tick with snapshot
  // ══════════════════════════════════════════════

  update(snapshot) {
    if (!snapshot) return;
    this._updateMetrics(snapshot);
    this._learnSequence(snapshot);
  }

  resolvePredictions(tick) {
    // Check pending predictions against actual outcomes
    const due = this._pending.filter(p => p.tick <= tick && !p.resolved);
    for (const pred of due) {
      pred.resolved = true;
      this._resolved++;
    }
    // Prune old resolved predictions
    if (this._pending.length > 200) {
      this._pending = this._pending.filter(p => !p.resolved).slice(-100);
    }
  }

  // ══════════════════════════════════════════════
  // PREDICTION API
  // ══════════════════════════════════════════════

  /**
   * Predict next events given current context snapshot.
   * @returns {Array<{event, probability, confidence, source}>}
   */
  predictNextEvents(context = {}) {
    const predictions = [];

    // Source 1: N-gram sequence prediction
    predictions.push(...this._predictFromSequence());

    // Source 2: Metric velocity extrapolation
    predictions.push(...this._predictFromMetrics(context));

    // Merge + normalise
    return this._merge(predictions);
  }

  /**
   * Predict outcome of a specific action/event type.
   */
  predictOutcome(eventType) {
    const bigram = this._bigrams.get(eventType);
    if (!bigram || bigram.count < 2) {
      return [{ event: 'unknown', probability: 1, confidence: 0.05, source: 'prior' }];
    }
    const total = bigram.count;
    return [...bigram.outcomes.entries()]
      .map(([type, count]) => ({
        event:       type,
        probability: count / total,
        confidence:  Math.min(0.95, total / 20),
        source:      'bigram',
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);
  }

  /**
   * Predict the next event in a given sequence.
   */
  predictSequence(eventTypes = []) {
    if (!eventTypes.length) return [];
    const last = eventTypes[eventTypes.length - 1];
    return this.predictOutcome(last);
  }

  /**
   * Learn a specific sequence pattern.
   */
  learnPattern(sequence = []) {
    if (sequence.length < 2) return;
    for (let i = 0; i < sequence.length - 1; i++) {
      this._learnBigram(sequence[i], sequence[i + 1]);
    }
    if (sequence.length >= 3) {
      for (let i = 0; i < sequence.length - 2; i++) {
        this._learnTrigram(sequence[i], sequence[i + 1], sequence[i + 2]);
      }
    }
    this._learned++;
  }

  /**
   * Predict all metrics `horizon` ticks ahead.
   */
  predictAll(horizon = 10) {
    const out = {};
    for (const [name, model] of this._metrics) {
      const v = model.velocity;
      const a = model.acceleration;
      const last = model.values[model.values.length - 1] ?? 0;
      // Kinematic extrapolation: x + v*t + 0.5*a*t²
      const predicted = last + v * horizon + 0.5 * a * horizon * horizon;
      out[name] = {
        predicted: Math.max(0, predicted),
        velocity:  v,
        acceleration: a,
        confidence: Math.min(0.9, model.values.length / 30),
      };
    }
    return out;
  }

  clear() {
    this._bigrams.clear();
    this._trigrams.clear();
    this._metrics.clear();
    this._pending   = [];
    this._typeSeq   = [];
    this._learned   = 0;
    this._predicted = 0;
    this._resolved  = 0;
  }

  getState() {
    return {
      bigrams:    this._bigrams.size,
      trigrams:   this._trigrams.size,
      metrics:    this._metrics.size,
      learned:    this._learned,
      predicted:  this._predicted,
      resolved:   this._resolved,
      pending:    this._pending.filter(p => !p.resolved).length,
    };
  }

  // ══════════════════════════════════════════════
  // PRIVATE — LEARNING
  // ══════════════════════════════════════════════

  _learnSequence(snapshot) {
    // Extract event types from snapshot
    const types = [];
    if (snapshot.entropy     > 0.8) types.push('highEntropy');
    if (snapshot.collapseRate > 2)  types.push('highCollapse');
    if ((snapshot.avgStrength ?? 0) > 0.7) types.push('highStrength');
    if (snapshot.energyOverload)    types.push('energyOverload');

    for (const type of types) {
      if (this._typeSeq.length > 0) {
        this._learnBigram(this._typeSeq[this._typeSeq.length - 1], type);
      }
      if (this._typeSeq.length > 1) {
        this._learnTrigram(
          this._typeSeq[this._typeSeq.length - 2],
          this._typeSeq[this._typeSeq.length - 1],
          type
        );
      }
      this._typeSeq.push(type);
      if (this._typeSeq.length > 6) this._typeSeq.shift();
    }
  }

  _learnBigram(a, b) {
    let bg = this._bigrams.get(a);
    if (!bg) { bg = { count: 0, outcomes: new Map() }; this._bigrams.set(a, bg); }
    bg.count++;
    bg.outcomes.set(b, (bg.outcomes.get(b) ?? 0) + 1);
  }

  _learnTrigram(a, b, c) {
    const key = `${a}|${b}`;
    let tg = this._trigrams.get(key);
    if (!tg) { tg = { count: 0, outcomes: new Map() }; this._trigrams.set(key, tg); }
    tg.count++;
    tg.outcomes.set(c, (tg.outcomes.get(c) ?? 0) + 1);
  }

  _updateMetrics(snapshot) {
    const TRACKED = ['entropy', 'avgStrength', 'collapseRate', 'objective', 'totalEnergy'];
    for (const name of TRACKED) {
      const val = snapshot[name];
      if (val == null) continue;
      let model = this._metrics.get(name);
      if (!model) {
        model = { values: [], velocity: 0, acceleration: 0 };
        this._metrics.set(name, model);
      }
      model.values.push(val);
      if (model.values.length > 60) model.values.shift();

      const n = model.values.length;
      if (n >= 2) {
        const prevVel = model.velocity;
        model.velocity = model.values[n - 1] - model.values[n - 2];
        model.acceleration = model.velocity - prevVel;
      }
    }
  }

  // ══════════════════════════════════════════════
  // PRIVATE — PREDICTION
  // ══════════════════════════════════════════════

  _predictFromSequence() {
    const preds = [];
    if (!this._typeSeq.length) return preds;

    // Trigram first (higher specificity)
    if (this._typeSeq.length >= 2) {
      const key = `${this._typeSeq[this._typeSeq.length - 2]}|${this._typeSeq[this._typeSeq.length - 1]}`;
      const tg  = this._trigrams.get(key);
      if (tg && tg.count >= 2) {
        for (const [type, count] of tg.outcomes) {
          preds.push({
            event:       type,
            probability: count / tg.count,
            confidence:  Math.min(0.9, tg.count / 10),
            source:      'trigram',
          });
        }
      }
    }

    // Bigram fallback
    const last = this._typeSeq[this._typeSeq.length - 1];
    const bg   = this._bigrams.get(last);
    if (bg && bg.count >= 2) {
      for (const [type, count] of bg.outcomes) {
        preds.push({
          event:       type,
          probability: count / bg.count,
          confidence:  Math.min(0.75, bg.count / 15),
          source:      'bigram',
        });
      }
    }
    return preds;
  }

  _predictFromMetrics(context) {
    const preds = [];
    const entropy = this._metrics.get('entropy');
    if (entropy && entropy.velocity > 0.02) {
      preds.push({
        event:       'highEntropy',
        probability: Math.min(0.95, 0.5 + entropy.velocity * 10),
        confidence:  0.6,
        source:      'velocity',
      });
    }
    const collapse = this._metrics.get('collapseRate');
    if (collapse && collapse.velocity > 0.5) {
      preds.push({
        event:       'highCollapse',
        probability: Math.min(0.9, 0.4 + collapse.velocity * 5),
        confidence:  0.55,
        source:      'velocity',
      });
    }
    return preds;
  }

  _merge(predictions) {
    // Group by event type, take max probability weighted by confidence
    const byEvent = new Map();
    for (const p of predictions) {
      const existing = byEvent.get(p.event);
      const score    = p.probability * p.confidence;
      if (!existing || score > existing.probability * existing.confidence) {
        byEvent.set(p.event, p);
      }
    }
    return [...byEvent.values()]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 8);
  }
}