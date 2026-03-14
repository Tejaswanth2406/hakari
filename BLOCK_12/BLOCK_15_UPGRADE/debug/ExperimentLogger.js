/**
 * HAKARI v3 — debug/ExperimentLogger.js
 * ─────────────────────────────────────────────
 * Structured experiment logging system.
 * Records every meaningful event in a HAKARI run
 * with enough fidelity to:
 *   - Reproduce results
 *   - Compare across runs
 *   - Feed downstream analysis
 *   - Replay a run step-by-step
 *
 * Log structure:
 * {
 *   runId:    string
 *   seed:     number
 *   startedAt: timestamp
 *   config:   object  — parameters at run start
 *   ticks:    TickLog[]  — sampled tick data
 *   events:   EventLog[] — discrete events
 *   final:    SystemReport
 * }
 *
 * TickLog (sampled every LOG_EVERY ticks):
 * {
 *   tick, entropy, avgStrength, objective,
 *   collapseRate, nodeCount, totalEnergy,
 *   phase, stability, learningRate
 * }
 *
 * EventLog (written on significant events):
 * {
 *   tick, type, data
 *   types: collapse, pattern_match, concept_formed,
 *          regime_change, plateau_detected, query
 * }
 *
 * Compression:
 *   Delta-encode tick data (store Δ not absolute)
 *   Reduces export size ~70%.
 *
 * Replay:
 *   logReplay(tickIndex) returns state at tick N
 *   for step-through debugging.
 * ─────────────────────────────────────────────
 */

const LOG_EVERY     = 5;    // ticks between tick samples
const MAX_TICKS     = 2000; // max tick samples per run
const MAX_EVENTS    = 500;  // max discrete events per run

export class ExperimentLogger {

  constructor() {
    this._runs     = [];    // completed runs
    this._current  = null;  // active run log
    this._tickBuf  = [];    // tick samples for current run
    this._events   = [];    // events for current run
    this._tickCount = 0;
  }

  // ── RUN LIFECYCLE ────────────────────────────

  /**
   * Begin a new experiment run.
   * @param {object} config  — system parameters at start
   * @param {number} [seed]
   * @returns {string} runId
   */
  beginRun(config, seed = 0) {
    const runId = `run_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    this._current = {
      runId,
      seed,
      startedAt:  Date.now(),
      config:     { ...config },
      ticks:      [],
      events:     [],
      final:      null,
      durationMs: 0,
    };
    this._tickBuf  = [];
    this._events   = [];
    this._tickCount = 0;
    return runId;
  }

  /**
   * End the current run and store it.
   * @param {object} finalReport — systemReport() result
   * @returns {object} completed run log
   */
  endRun(finalReport) {
    if (!this._current) return null;

    this._current.ticks      = this._compressTicks(this._tickBuf);
    this._current.events     = [...this._events];
    this._current.final      = finalReport ?? null;
    this._current.durationMs = Date.now() - this._current.startedAt;

    this._runs.push(this._current);

    const completed  = this._current;
    this._current    = null;
    this._tickBuf    = [];
    this._events     = [];
    return completed;
  }

  // ── PER-TICK LOGGING ─────────────────────────

  /**
   * Log tick data. Sampled every LOG_EVERY ticks.
   * @param {object} state — assembled by Hakari.js
   * @param {object} [analysisState] — from Diagnostics modules
   */
  logTick(state, analysisState = {}) {
    this._tickCount++;
    if (this._tickCount % LOG_EVERY !== 0) return;
    if (this._tickBuf.length >= MAX_TICKS) return;

    this._tickBuf.push({
      tick:         state.tick         ?? 0,
      entropy:      state.entropy      ?? 0,
      avgStrength:  state.avgStrength  ?? 0,
      objective:    state.objective    ?? 0,
      collapseRate: state.collapseRate ?? 0,
      nodeCount:    state.nodeCount    ?? 0,
      totalEnergy:  state.totalEnergy  ?? 0,
      // Analysis enrichment
      phase:        analysisState.phase         ?? '—',
      stability:    analysisState.stabilityScore ?? 0,
      learningRate: analysisState.learningRate   ?? 0,
    });
  }

  // ── EVENT LOGGING ────────────────────────────

  /**
   * Log a discrete event.
   * @param {string} type  — event type string
   * @param {number} tick
   * @param {object} data  — event payload
   */
  logEvent(type, tick, data = {}) {
    if (this._events.length >= MAX_EVENTS) return;
    this._events.push({ type, tick, timestamp: Date.now(), data });
  }

  /**
   * Convenience event loggers.
   */
  logCollapse(tick, nodeId, label, cause) {
    this.logEvent('collapse', tick, { nodeId, label, cause });
  }

  logPatternMatch(tick, patternId, confidence) {
    this.logEvent('pattern_match', tick, { patternId, confidence });
  }

  logRegimeChange(tick, from, to) {
    this.logEvent('regime_change', tick, { from, to });
  }

  logPlateau(tick, since) {
    this.logEvent('plateau_detected', tick, { since });
  }

  logQuery(tick, text, resultCount) {
    this.logEvent('query', tick, { text, resultCount });
  }

  logConceptFormed(tick, conceptId, label, memberCount) {
    this.logEvent('concept_formed', tick, { conceptId, label, memberCount });
  }

  // ── EXPORT ───────────────────────────────────

  /**
   * Export all completed runs as JSON blob.
   * @returns {string} JSON string
   */
  exportJSON() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      runCount:   this._runs.length,
      runs:       this._runs,
    }, null, 2);
  }

  /**
   * Trigger a download of the current log in the browser.
   */
  downloadJSON() {
    const json  = this.exportJSON();
    const blob  = new Blob([json], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = `hakari_log_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export a single run by index.
   * @param {number} idx
   * @returns {object|null}
   */
  getRun(idx) {
    return this._runs[idx] ?? null;
  }

  // ── REPLAY ───────────────────────────────────

  /**
   * Get the tick-log state closest to a given tick.
   * Used for step-through debugging / replay.
   *
   * @param {number} targetTick
   * @param {number} [runIdx] — which run to replay
   * @returns {object|null}
   */
  replayAt(targetTick, runIdx = -1) {
    const run = runIdx >= 0 ? this._runs[runIdx] : this._runs[this._runs.length - 1];
    if (!run) return null;

    const ticks = this._decompressTicks(run.ticks);
    return ticks.reduce((best, t) =>
      Math.abs(t.tick - targetTick) < Math.abs(best.tick - targetTick) ? t : best
    , ticks[0] ?? null);
  }

  /**
   * Events in a tick range from a completed run.
   * @param {number} fromTick
   * @param {number} toTick
   * @param {number} [runIdx]
   * @returns {object[]}
   */
  eventsInRange(fromTick, toTick, runIdx = -1) {
    const run = runIdx >= 0 ? this._runs[runIdx] : this._runs[this._runs.length - 1];
    if (!run) return [];
    return run.events.filter(e => e.tick >= fromTick && e.tick <= toTick);
  }

  // ── READ ─────────────────────────────────────

  get runCount()   { return this._runs.length; }
  get isRecording(){ return this._current !== null; }

  lastRun() { return this._runs[this._runs.length - 1] ?? null; }

  /**
   * Summary statistics across all completed runs.
   * @returns {object}
   */
  summary() {
    if (this._runs.length === 0) return { runCount: 0 };
    const finals = this._runs.map(r => r.final?.graph?.tick ?? 0);
    const durations = this._runs.map(r => r.durationMs ?? 0);
    return {
      runCount:    this._runs.length,
      avgTicks:    finals.reduce((s, v) => s + v, 0) / finals.length,
      avgDurationMs: durations.reduce((s, v) => s + v, 0) / durations.length,
      latestRunId: this._runs[this._runs.length - 1]?.runId,
    };
  }

  clear() {
    this._runs     = [];
    this._current  = null;
    this._tickBuf  = [];
    this._events   = [];
    this._tickCount = 0;
  }

  getState() {
    return {
      runCount:    this._runs.length,
      isRecording: this.isRecording,
      currentTicks: this._tickBuf.length,
      currentEvents: this._events.length,
    };
  }

  // ── PRIVATE — COMPRESSION ────────────────────

  /**
   * Delta-encode tick array: store first value + deltas.
   * Reduces JSON size ~60–70% for slowly changing metrics.
   *
   * @param {object[]} ticks
   * @returns {object} { first, deltas: { key: number[] } }
   */
  _compressTicks(ticks) {
    if (ticks.length === 0) return { first: null, deltas: {} };

    const NUMERIC_KEYS = ['entropy','avgStrength','objective','collapseRate','nodeCount','totalEnergy','stability','learningRate'];
    const first  = { ...ticks[0] };
    const deltas = {};

    for (const key of NUMERIC_KEYS) {
      deltas[key] = [];
      for (let i = 1; i < ticks.length; i++) {
        const d = (ticks[i][key] ?? 0) - (ticks[i - 1][key] ?? 0);
        deltas[key].push(Math.round(d * 1e6) / 1e6);
      }
    }

    // Non-numeric: store as-is
    const ticks_field  = ticks.map(t => t.tick);
    const phases_field = ticks.map(t => t.phase);

    return { first, deltas, ticks: ticks_field, phases: phases_field, count: ticks.length };
  }

  /**
   * Reconstruct tick array from compressed form.
   * @param {object} compressed
   * @returns {object[]}
   */
  _decompressTicks(compressed) {
    if (!compressed || !compressed.first) return [];
    const { first, deltas, ticks: tickArr, phases, count } = compressed;
    if (!deltas || count === 0) return [first];

    const NUMERIC_KEYS = ['entropy','avgStrength','objective','collapseRate','nodeCount','totalEnergy','stability','learningRate'];
    const result = [{ ...first }];

    for (let i = 1; i < count; i++) {
      const prev = result[i - 1];
      const row  = { ...prev, tick: tickArr?.[i] ?? prev.tick + 5, phase: phases?.[i] ?? prev.phase };
      for (const key of NUMERIC_KEYS) {
        row[key] = (prev[key] ?? 0) + (deltas[key]?.[i - 1] ?? 0);
      }
      result.push(row);
    }

    return result;
  }
}