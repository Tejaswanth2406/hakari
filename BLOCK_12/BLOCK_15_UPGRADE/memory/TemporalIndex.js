/**
 * HAKARI v3 — memory/TemporalIndex.js
 * ─────────────────────────────────────────────
 * Fast time-based memory index.
 * Uses a sorted array + binary search for
 * O(log n) range queries.
 *
 * Also supports:
 *   - tick-based windowing (for Hakari snapshots)
 *   - recency queries
 *   - time-density analysis
 *   - event-burst detection
 * ─────────────────────────────────────────────
 */

export class TemporalIndex {

  constructor() {
    // Sorted array of { timestamp, id } entries
    this._index     = [];

    // id → timestamp lookup for O(1) removal
    this._idToTs    = new Map();

    // Tick-based snapshot index: tick → snapshot
    this._tickIndex = new Map();

    // Burst detection: rolling count per window
    this._burstWindow  = 1000;   // ms
    this._burstHistory = [];     // { ts, count }
  }

  // ══════════════════════════════════════════════
  // INGEST  (Hakari snapshot path)
  // ══════════════════════════════════════════════

  ingest(snapshot) {
    if (!snapshot) return;
    const tick = snapshot.tick ?? snapshot._tick;
    if (tick != null) this._tickIndex.set(tick, snapshot);

    // Prune old tick entries beyond 500 ticks
    if (this._tickIndex.size > 500) {
      const oldestKey = this._tickIndex.keys().next().value;
      this._tickIndex.delete(oldestKey);
    }
  }

  /** Get snapshot window around a tick */
  window(tick, radius = 30) {
    const results = [];
    for (let t = tick - radius; t <= tick + radius; t++) {
      const snap = this._tickIndex.get(t);
      if (snap) results.push(snap);
    }
    return results;
  }

  // ══════════════════════════════════════════════
  // ADD / REMOVE
  // ══════════════════════════════════════════════

  add(memory) {
    if (!memory?.id) return;
    const ts = memory.timestamp ?? Date.now();

    // Binary search insert position
    const pos = this._bisectRight(ts);
    this._index.splice(pos, 0, { ts, id: memory.id });
    this._idToTs.set(memory.id, ts);

    // Track for burst detection
    this._burstHistory.push({ ts, count: 1 });
    this._pruneOldBursts(ts);
  }

  remove(id) {
    const ts = this._idToTs.get(id);
    if (ts == null) return;
    this._idToTs.delete(id);

    // Binary search for the entry
    const lo = this._bisectLeft(ts);
    const hi = this._bisectRight(ts);
    for (let i = lo; i < hi; i++) {
      if (this._index[i].id === id) {
        this._index.splice(i, 1);
        return;
      }
    }
  }

  // ══════════════════════════════════════════════
  // QUERIES
  // ══════════════════════════════════════════════

  /** Get all memory ids in a timestamp range [t1, t2] */
  getBetween(t1, t2) {
    const lo = this._bisectLeft(t1);
    const hi = this._bisectRight(t2);
    return this._index.slice(lo, hi).map(e => e.id);
  }

  /** Get n most recent memory ids */
  getRecent(n = 20) {
    return this._index
      .slice(Math.max(0, this._index.length - n))
      .reverse()
      .map(e => e.id);
  }

  /** Get ids within the last `ms` milliseconds */
  getLastMs(ms) {
    const cutoff = Date.now() - ms;
    return this.getBetween(cutoff, Infinity);
  }

  size() { return this._index.length; }

  clear() {
    this._index     = [];
    this._idToTs    = new Map();
    this._tickIndex = new Map();
    this._burstHistory = [];
  }

  // ══════════════════════════════════════════════
  // BURST DETECTION
  // ══════════════════════════════════════════════

  /** Returns events-per-second over the burst window */
  burstRate() {
    this._pruneOldBursts(Date.now());
    return this._burstHistory.length / (this._burstWindow / 1000);
  }

  _pruneOldBursts(now) {
    const cutoff = now - this._burstWindow;
    while (this._burstHistory.length && this._burstHistory[0].ts < cutoff) {
      this._burstHistory.shift();
    }
  }

  // ══════════════════════════════════════════════
  // TIME-DENSITY ANALYSIS
  // ══════════════════════════════════════════════

  /**
   * Returns density histogram: array of { t, count }
   * bucketed into `buckets` equal-width bins.
   */
  densityHistogram(buckets = 20) {
    if (!this._index.length) return [];
    const minTs = this._index[0].ts;
    const maxTs = this._index[this._index.length - 1].ts;
    const span  = maxTs - minTs || 1;
    const bw    = span / buckets;

    const counts = new Array(buckets).fill(0);
    for (const { ts } of this._index) {
      const b = Math.min(Math.floor((ts - minTs) / bw), buckets - 1);
      counts[b]++;
    }
    return counts.map((count, i) => ({ t: minTs + i * bw, count }));
  }

  // ══════════════════════════════════════════════
  // BINARY SEARCH HELPERS
  // ══════════════════════════════════════════════

  _bisectLeft(ts) {
    let lo = 0, hi = this._index.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._index[mid].ts < ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  _bisectRight(ts) {
    let lo = 0, hi = this._index.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._index[mid].ts <= ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ══════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════

  getState() {
    return {
      indexSize:   this._index.length,
      ticksCached: this._tickIndex.size,
      burstRate:   this.burstRate().toFixed(2),
    };
  }
}