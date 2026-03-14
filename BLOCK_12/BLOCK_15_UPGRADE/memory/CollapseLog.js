/**
 * HAKARI v3 — memory/CollapseLog.js
 * ─────────────────────────────────────────────
 * Diagnostic log for memory collapses, pruning,
 * compression events, and system anomalies.
 *
 * Also tracks:
 *   - Recent collapse rate (collapses per tick)
 *   - Rolling rate window for StatsPanel
 *   - Collapse type breakdown
 *   - Peak detection
 * ─────────────────────────────────────────────
 */

export class CollapseLog {

  constructor(opts = {}) {
    this._maxEntries   = opts.maxEntries   ?? 1000;
    this._rateWindow   = opts.rateWindow   ?? 30;    // ticks for rate calc

    // Main log: array of log entries
    this._log          = [];

    // Rolling collapse counts per tick: [count, count, ...]
    this._rollingCounts = [];

    // Type breakdown: type → count
    this._typeCounts   = new Map();

    // Peak tracking
    this._peakRate     = 0;
    this._peakTick     = 0;

    // Current tick collapse count (reset each record() call)
    this._thisTickCount = 0;

    // Total collapses ever recorded
    this._totalCollapses = 0;
  }

  // ══════════════════════════════════════════════
  // RECORD  — called every tick by Hakari
  // ══════════════════════════════════════════════

  /**
   * @param {Node[]} collapsed  — nodes that collapsed this tick
   * @param {number} tick       — current tick
   * @param {number} S          — current entropy
   */
  record(collapsed, tick, S) {
    if (!collapsed?.length) {
      this._rollingCounts.push(0);
      this._trimRolling();
      return;
    }

    const count = collapsed.length;
    this._thisTickCount  = count;
    this._totalCollapses += count;
    this._rollingCounts.push(count);
    this._trimRolling();

    // Update type breakdown
    for (const node of collapsed) {
      const reason = node.collapseBy ?? 'unknown';
      this._typeCounts.set(reason, (this._typeCounts.get(reason) ?? 0) + 1);
    }

    // Log entry
    const entry = {
      timestamp:        Date.now(),
      tick,
      type:             'collapse',
      affectedMemories: count,
      nodes:            collapsed.map(n => ({
        id:     n.id,
        label:  n.label  ?? '',
        reason: n.collapseBy ?? 'unknown',
        lambda: n.adaptiveLambda ?? n.lambda ?? 0,
      })),
      entropy:  S,
      reason:   count > 5 ? 'cascade' : 'normal',
    };

    this._log.push(entry);
    if (this._log.length > this._maxEntries) this._log.shift();

    // Peak update
    const rate = this.recentRate();
    if (rate > this._peakRate) {
      this._peakRate = rate;
      this._peakTick = tick;
    }
  }

  // ══════════════════════════════════════════════
  // LOGGING  — for other system events
  // ══════════════════════════════════════════════

  log(entry) {
    this._log.push({
      timestamp: Date.now(),
      ...entry,
    });
    if (this._log.length > this._maxEntries) this._log.shift();
  }

  // ══════════════════════════════════════════════
  // RATE CALCULATION
  // ══════════════════════════════════════════════

  /**
   * Returns average collapses per tick over the
   * recent rolling window.
   */
  recentRate() {
    if (!this._rollingCounts.length) return 0;
    const sum = this._rollingCounts.reduce((a, b) => a + b, 0);
    return sum / this._rollingCounts.length;
  }

  // ══════════════════════════════════════════════
  // QUERY
  // ══════════════════════════════════════════════

  getRecent(n = 20) {
    return this._log.slice(-n);
  }

  getByType(type) {
    return this._log.filter(e => e.type === type);
  }

  getByTickRange(t1, t2) {
    return this._log.filter(e => e.tick >= t1 && e.tick <= t2);
  }

  // ══════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════

  stats() {
    const breakdown = {};
    for (const [type, count] of this._typeCounts) {
      breakdown[type] = count;
    }
    return {
      total:        this._totalCollapses,
      logSize:      this._log.length,
      recentRate:   this.recentRate().toFixed(3),
      peakRate:     this._peakRate.toFixed(3),
      peakTick:     this._peakTick,
      breakdown,
    };
  }

  clear() {
    this._log            = [];
    this._rollingCounts  = [];
    this._typeCounts     = new Map();
    this._peakRate       = 0;
    this._peakTick       = 0;
    this._totalCollapses = 0;
    this._thisTickCount  = 0;
  }

  getState() {
    return this.stats();
  }

  // ══════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════

  _trimRolling() {
    if (this._rollingCounts.length > this._rateWindow) {
      this._rollingCounts.shift();
    }
  }
}