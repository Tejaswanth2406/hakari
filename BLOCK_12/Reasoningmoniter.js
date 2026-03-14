/**
 * HAKARI v3 — ui/ReasoningMonitor.js
 * ─────────────────────────────────────────────
 * Live display of the ReasoningPatternGraph.
 * Shows which reasoning templates HAKARI has
 * learned, their confidence, usage frequency,
 * and decay trajectory.
 *
 * Panels:
 *   1. Active patterns table (top 10)
 *      pattern | strength bar | usage | last used
 *   2. Pattern match counter (hits vs misses)
 *   3. Fast-path efficiency meter
 *      (% of queries resolved via pattern match)
 *   4. Prediction accuracy from PredictiveMemory
 *
 * Updates every REFRESH_EVERY ticks.
 * Zero DOM dependencies at construction —
 * renders into a provided container element.
 * ─────────────────────────────────────────────
 */

const REFRESH_EVERY = 15;
const MAX_DISPLAY   = 10;

export class ReasoningMonitor {

  /**
   * @param {Hakari}      hakari
   * @param {HTMLElement} containerEl
   */
  constructor(hakari, containerEl) {
    this.hakari      = hakari;
    this.container   = containerEl;
    this._tickCount  = 0;

    // Rolling match/miss history for efficiency meter
    this._matchHistory = [];   // boolean[]
    this._historyMax   = 200;

    // Query count for efficiency denominator
    this._queryCount    = 0;
    this._patternHits   = 0;

    if (containerEl) this._render();
  }

  // ── TICK ─────────────────────────────────────

  tick() {
    this._tickCount++;
    if (this._tickCount % REFRESH_EVERY === 0) {
      this._render();
    }
  }

  // ── RECORD ───────────────────────────────────

  /**
   * Record a pattern match event.
   * Called by Hakari.js or LLMConnector after tryFastPath.
   * @param {boolean} hit
   */
  recordMatch(hit) {
    this._queryCount++;
    if (hit) this._patternHits++;
    this._matchHistory.push(hit);
    if (this._matchHistory.length > this._historyMax) this._matchHistory.shift();
  }

  // ── DESTROY ──────────────────────────────────

  destroy() {
    if (this.container) this.container.innerHTML = '';
  }

  // ── PRIVATE — RENDER ─────────────────────────

  _render() {
    if (!this.container) return;

    const rg        = this.hakari.reasoningGraph;
    const pm        = this.hakari.predictiveMemory;
    if (!rg)        { this.container.innerHTML = '<div style="color:#4a5568;padding:8px;font-size:0.6rem;">No ReasoningGraph</div>'; return; }

    const patterns  = rg.topPatterns(MAX_DISPLAY);
    const state     = rg.getState();

    // Efficiency
    const recent    = this._matchHistory.slice(-50);
    const hitRate   = recent.length > 0
      ? recent.filter(Boolean).length / recent.length
      : 0;

    // Prediction MAE
    const mae       = pm?.predictionMAE() ?? 0;
    const diverging = pm?.isSystemDiverging() ?? { diverging: false, confidence: 0 };

    this.container.innerHTML = `
      <div style="font-family:'Share Tech Mono',monospace;font-size:0.6rem;">

        <!-- Header -->
        <div style="display:flex;justify-content:space-between;
                    padding:4px 8px;border-bottom:1px solid #0d1a2a;
                    color:#a259ff;letter-spacing:0.1em;">
          <span>REASONING PATTERNS</span>
          <span style="color:#4a5568;">${state.patternCount} active</span>
        </div>

        <!-- Efficiency meter -->
        <div style="padding:4px 8px;display:flex;
                    justify-content:space-between;align-items:center;
                    border-bottom:1px solid #0d1a2a;">
          <span style="color:#4a5568;">fast-path rate</span>
          <div style="position:relative;width:80px;height:6px;
                      background:#0d1a2a;border-radius:3px;overflow:hidden;">
            <div style="position:absolute;left:0;top:0;height:100%;
                        width:${(hitRate * 100).toFixed(0)}%;
                        background:#a259ff;border-radius:3px;"></div>
          </div>
          <span style="color:#a259ff;">${(hitRate * 100).toFixed(0)}%</span>
        </div>

        <!-- Stats row -->
        <div style="display:flex;padding:3px 8px;gap:16px;
                    border-bottom:1px solid #0d1a2a;">
          <span style="color:#4a5568;">recorded: <span style="color:#c8d6e8;">${state.totalRecorded}</span></span>
          <span style="color:#4a5568;">hits: <span style="color:#00ff9d;">${state.totalMatches}</span></span>
          <span style="color:#4a5568;">extracted: <span style="color:#ffdd57;">${state.totalExtracted}</span></span>
        </div>

        <!-- Prediction stats -->
        <div style="display:flex;padding:3px 8px;gap:12px;
                    border-bottom:1px solid #0d1a2a;">
          <span style="color:#4a5568;">pred MAE: <span style="color:${mae < 0.1 ? '#00ff9d' : mae < 0.3 ? '#ffdd57' : '#ff3d71'};">${mae.toFixed(3)}</span></span>
          <span style="color:#4a5568;">diverging: <span style="color:${diverging.diverging ? '#ff3d71' : '#4a5568'};">${diverging.diverging ? 'YES' : 'no'}</span></span>
        </div>

        <!-- Pattern table header -->
        <div style="display:grid;grid-template-columns:1fr 60px 36px;
                    padding:3px 8px;color:#4a5568;font-size:0.55rem;
                    letter-spacing:0.1em;border-bottom:1px solid #0d1a2a;">
          <span>PATTERN ROLES</span><span style="text-align:center;">STRENGTH</span><span style="text-align:right;">USES</span>
        </div>

        <!-- Pattern rows -->
        ${patterns.length === 0
          ? `<div style="padding:6px 8px;color:#4a5568;text-align:center;">no patterns yet — run queries</div>`
          : patterns.map(({ pattern }) => this._patternRow(pattern)).join('')
        }

      </div>`;
  }

  _patternRow(pattern) {
    const roles  = (pattern.roles ?? []).join(' → ');
    const str    = pattern.strength ?? 0;
    const uses   = pattern.usageCount ?? 0;
    const color  = str > 0.7 ? '#00ff9d' : str > 0.4 ? '#ffdd57' : '#a259ff';
    const trunc  = roles.length > 32 ? roles.slice(0, 30) + '…' : roles;

    return `
      <div style="display:grid;grid-template-columns:1fr 60px 36px;
                  padding:2px 8px;border-bottom:1px solid #080f18;
                  align-items:center;">
        <span style="color:#c8d6e8;font-size:0.58rem;overflow:hidden;
                     white-space:nowrap;" title="${roles}">${trunc}</span>
        <div style="position:relative;height:4px;background:#0d1a2a;
                    border-radius:2px;margin:0 4px;overflow:hidden;">
          <div style="position:absolute;left:0;top:0;height:100%;
                      width:${(str * 100).toFixed(0)}%;
                      background:${color};border-radius:2px;"></div>
        </div>
        <span style="color:${color};font-size:0.58rem;text-align:right;">${uses}</span>
      </div>`;
  }
}