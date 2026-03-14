/**
 * HAKARI v3 — memory/LongTermMemory.js
 * ─────────────────────────────────────────────
 * Stores high-importance memories for long-term
 * retention. Applies decay, reinforces frequently
 * accessed memories, detects recurring patterns,
 * and removes weak memories.
 *
 * Decay rule: strength *= 0.999 per decay() call
 * Remove when: strength < 0.05
 * Capacity: 500 long-term memories
 * ─────────────────────────────────────────────
 */

export class LongTermMemory {

  constructor(opts = {}) {
    this._maxSize      = opts.maxSize      ?? 500;
    this._decayRate    = opts.decayRate    ?? 0.999;
    this._minStrength  = opts.minStrength  ?? 0.05;
    this._importanceThreshold = opts.importanceThreshold ?? 0.55;

    // id → longTermRecord
    this._store        = new Map();

    // Pattern detection: signature → { count, examples[] }
    this._patterns     = new Map();

    // Consolidation log
    this._consolidated = 0;
    this._decayTick    = 0;
  }

  // ══════════════════════════════════════════════
  // STORE / EVALUATE
  // ══════════════════════════════════════════════

  /**
   * Evaluate a snapshot and store it if important enough.
   * Called every tick by Hakari.
   */
  evaluate(snapshot, birthCount = 0) {
    if (!snapshot) return;
    const imp = this._scoreSnapshot(snapshot, birthCount);
    if (imp >= this._importanceThreshold) {
      this.forceConsolidate(snapshot, 'auto');
    }
  }

  /**
   * Force consolidation of a snapshot regardless of importance.
   */
  forceConsolidate(snapshot, reason = 'forced') {
    if (!snapshot) return;
    const id  = `ltm:${snapshot.tick ?? Date.now()}`;
    const imp = this._scoreSnapshot(snapshot, 0);

    const record = {
      id,
      snapshot:     { ...snapshot },
      importance:   imp,
      strength:     Math.max(imp, 0.6),
      reason,
      consolidatedAt: Date.now(),
      accessCount:  0,
      signature:    this._signature(snapshot),
    };

    this._store.set(id, record);
    this._consolidated++;

    // Track pattern
    this._trackPattern(record);

    // Prune if over capacity
    if (this._store.size > this._maxSize) {
      this._pruneWeakest();
    }
  }

  // ══════════════════════════════════════════════
  // RETRIEVAL
  // ══════════════════════════════════════════════

  /**
   * Retrieve memories matching a query object.
   * Supports: { minImportance, type, tick, topN }
   */
  retrieve(query = {}) {
    let results = [...this._store.values()];

    if (query.minImportance != null) {
      results = results.filter(r => r.importance >= query.minImportance);
    }
    if (query.tick != null) {
      results = results.filter(r => Math.abs((r.snapshot.tick ?? 0) - query.tick) < 50);
    }

    results.sort((a, b) => b.importance - a.importance);
    return results.slice(0, query.topN ?? 20);
  }

  topN(n = 10) {
    return [...this._store.values()]
      .sort((a, b) => b.importance * b.strength - a.importance * a.strength)
      .slice(0, n);
  }

  recurringStates() {
    return [...this._patterns.entries()]
      .filter(([, p]) => p.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([sig, p]) => ({ signature: sig, count: p.count, example: p.examples[0] }));
  }

  // ══════════════════════════════════════════════
  // REINFORCE
  // ══════════════════════════════════════════════

  reinforce(id, amount = 0.05) {
    const rec = this._store.get(id);
    if (!rec) return false;
    rec.strength     = Math.min(1, rec.strength + amount * (1 - rec.strength));
    rec.accessCount++;
    return true;
  }

  // ══════════════════════════════════════════════
  // DECAY  — call periodically (not every tick)
  // ══════════════════════════════════════════════

  decay() {
    this._decayTick++;
    const toRemove = [];
    for (const [id, rec] of this._store) {
      rec.strength *= this._decayRate;
      if (rec.strength < this._minStrength) toRemove.push(id);
    }
    for (const id of toRemove) this._store.delete(id);
    return toRemove.length;
  }

  clear() {
    this._store.clear();
    this._patterns.clear();
    this._consolidated = 0;
    this._decayTick    = 0;
  }

  getState() {
    return {
      size:         this._store.size,
      patterns:     this._patterns.size,
      consolidated: this._consolidated,
      decayTicks:   this._decayTick,
    };
  }

  // ══════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════

  _scoreSnapshot(snapshot, births = 0) {
    let score = 0;
    const S  = snapshot.entropy      ?? 0;
    const cr = snapshot.collapseRate ?? 0;
    const J  = snapshot.objective    ?? 0;
    const str = snapshot.avgStrength ?? 0;

    // Extremes score higher
    if (S > 0.8)  score += 0.3;
    if (S < 0.1)  score += 0.2;
    if (cr > 3)   score += 0.25;
    if (J > 0.8)  score += 0.2;
    if (str > 0.7) score += 0.15;
    if (births > 10) score += 0.1;
    if (snapshot.energyOverload) score += 0.2;

    return Math.min(1, score);
  }

  _signature(snapshot) {
    const S   = Math.round((snapshot.entropy   ?? 0) * 5) / 5;
    const cr  = Math.round((snapshot.collapseRate ?? 0));
    const str = Math.round((snapshot.avgStrength ?? 0) * 4) / 4;
    return `S${S}_cr${cr}_str${str}`;
  }

  _trackPattern(record) {
    const sig = record.signature;
    const pat = this._patterns.get(sig) ?? { count: 0, examples: [] };
    pat.count++;
    if (pat.examples.length < 3) pat.examples.push(record.snapshot);
    this._patterns.set(sig, pat);
  }

  _pruneWeakest() {
    const sorted = [...this._store.entries()]
      .sort((a, b) => (a[1].strength * a[1].importance) - (b[1].strength * b[1].importance));
    const remove = Math.ceil(sorted.length * 0.1);
    for (let i = 0; i < remove; i++) {
      this._store.delete(sorted[i][0]);
    }
  }
}