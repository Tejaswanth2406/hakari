/**
 * HAKARI v3 — StatsPanel.js
 * ─────────────────────────────────────────────
 * Advanced DOM stats panel. Drives every stat
 * element, bar, colour, FPS counter, regime
 * badge, energy warning, param rows, and all
 * Block 15 research metrics.
 *
 * Features:
 *   - Animated stat bars (nodes, entropy,
 *     collapse, strength)
 *   - Regime colour-coding (STABLE/CRITICAL/
 *     CHAOTIC) with live badge
 *   - FPS tracking with colour health indicator
 *   - Energy overload warning flash
 *   - Live parameter panel (renders + updates
 *     all param rows dynamically)
 *   - Block 15 metrics (CSI, RE, KD, SCS,
 *     CED, ER, GPS) with trend arrows
 *   - Change-detection (skips DOM writes when
 *     value hasn't changed → zero layout thrash)
 *   - Smoothed bar transitions via lerp
 *   - Query status with truncation
 *   - MetaOptimizer step counter + pause state
 * ─────────────────────────────────────────────
 */

export class StatsPanel {

  /**
   * @param {object} ids  — DOM id map from main.js statsIds
   */
  constructor(ids = {}) {
    this._ids     = ids;
    this._cache   = {};       // last written values — skip redundant DOM writes
    this._bars    = {};       // current bar widths for lerp smoothing
    this._fpsFrames = [];
    this._lastFrameTime = performance.now();

    // Param panel state
    this._paramKeys    = [];
    this._paramBuilt   = false;

    // Metric trend tracking (prev values for arrows)
    this._prevMetrics  = {};

    // FPS animation frame
    this._rafId = null;
    this._startFPSLoop();
  }

  // ══════════════════════════════════════════
  // MAIN UPDATE  — called every Hakari tick
  // ══════════════════════════════════════════

  update(state) {
    this._updateCore(state);
    this._updateEntropy(state);
    this._updateIntelligence(state);
    this._updateEvolution(state);
    this._updateBars(state);
    this._updateParams(state);
    this._updateBlock15Metrics(state);
    this._updateEnergyWarning(state);
    this._updateStatusBar(state);
  }

  // ══════════════════════════════════════════
  // CORE STATS
  // ══════════════════════════════════════════

  _updateCore(state) {
    this._setText('nodeCount',   state.nodeCount   ?? '—');
    this._setText('tick',        this._formatTick(state.tick));
    this._setText('collapseRate',state.collapseRate != null
      ? state.collapseRate.toFixed(3) : '—');
    this._setText('avgStrength', state.avgStrength != null
      ? state.avgStrength.toFixed(3) : '—');
  }

  // ══════════════════════════════════════════
  // ENTROPY + REGIME
  // ══════════════════════════════════════════

  _updateEntropy(state) {
    this._setText('entropy', state.entropy != null
      ? state.entropy.toFixed(4) : '—');

    const regime  = state.entropyRegime ?? '—';
    const regimes = {
      STABLE:   { label: 'STABLE',   cls: 'stat-val sage'  },
      CRITICAL: { label: 'CRITICAL', cls: 'stat-val gold'  },
      CHAOTIC:  { label: 'CHAOTIC',  cls: 'stat-val terra' },
    };
    const r   = regimes[regime];
    const el  = this._el('entropyRegime');
    if (el && this._cache['entropyRegime'] !== regime) {
      el.textContent = r ? r.label : regime;
      el.className   = r ? r.cls   : 'stat-val';
      this._cache['entropyRegime'] = regime;
    }
  }

  // ══════════════════════════════════════════
  // INTELLIGENCE
  // ══════════════════════════════════════════

  _updateIntelligence(state) {
    this._setText('objective', state.objective != null
      ? state.objective.toFixed(4) : '—');

    // Top node — truncate long labels
    const label = state.topNodeLabel ?? '—';
    this._setText('topNode', label.length > 14
      ? label.slice(0, 13) + '…' : label);

    // Query status
    if (state.queryActive && state.queryText) {
      const q = state.queryText.length > 16
        ? state.queryText.slice(0, 15) + '…'
        : state.queryText;
      this._setText('queryActive', `▸ ${q}`);
      this._setStyle('queryActive', 'color', 'var(--gold)');
    } else {
      this._setText('queryActive', 'none');
      this._setStyle('queryActive', 'color', '');
    }
  }

  // ══════════════════════════════════════════
  // EVOLUTION / META-OPTIMIZER
  // ══════════════════════════════════════════

  _updateEvolution(state) {
    if (state.evoEnabled === false) {
      this._setText('evoStatus', 'PAUSED');
      this._setStyle('evoStatus', 'color', 'var(--rust)');
    } else {
      this._setText('evoStatus', `step ${state.evoStepCount ?? 0}`);
      this._setStyle('evoStatus', 'color', 'var(--gold2)');
    }
  }

  // ══════════════════════════════════════════
  // ANIMATED STAT BARS
  // ══════════════════════════════════════════

  _updateBars(state) {
    const maxNodes = 1500;

    // Nodes bar
    this._setBar('bar-nodes',
      ((state.nodeCount ?? 0) / maxNodes) * 100,
      'var(--ink3)');

    // Entropy bar — colour shifts with regime
    const entropyColour =
      (state.entropyRegime === 'CHAOTIC')  ? 'var(--terra)' :
      (state.entropyRegime === 'CRITICAL') ? 'var(--gold)'  : 'var(--sage)';
    this._setBar('bar-entropy',
      (state.entropy ?? 0) * 100,
      entropyColour);

    // Collapse bar — capped at 20 collapses/tick = 100%
    this._setBar('bar-collapse',
      Math.min((state.collapseRate ?? 0) * 5, 100),
      'var(--rust)');

    // Strength bar
    this._setBar('bar-strength',
      (state.avgStrength ?? 0) * 100,
      'var(--sage)');
  }

  // ══════════════════════════════════════════
  // LIVE PARAMETER PANEL
  // ══════════════════════════════════════════

  _updateParams(state) {
    const params = state.params ?? state.paramField ?? null;
    if (!params) return;

    const list = document.getElementById('param-list');
    if (!list) return;

    const keys = Object.keys(params);

    // Build rows on first call
    if (!this._paramBuilt || keys.length !== this._paramKeys.length) {
      this._buildParamRows(list, keys, params);
      this._paramKeys  = keys;
      this._paramBuilt = true;
    }

    // Update values
    const BOUNDS = {
      alpha:   [0, 2],   beta:    [0, 2],   gamma:   [0, 2],
      epsilon: [0, 1],   lambda0: [0, 0.1], kappa:   [0, 2],
      sigma:   [0, 0.5], delta:   [0, 1],   phi:     [0, 3],
      tau:     [0.1, 5], mu:      [0, 0.01],
    };

    for (const key of keys) {
      const val    = params[key];
      if (val == null) continue;
      const valEl  = document.getElementById(`pv-${key}`);
      const barEl  = document.getElementById(`pb-${key}`);
      if (valEl) valEl.textContent = val.toFixed(4);
      if (barEl) {
        const [lo, hi] = BOUNDS[key] ?? [0, 2];
        const pct = Math.max(0, Math.min(100, ((val - lo) / (hi - lo)) * 100));
        barEl.style.width = pct + '%';
        barEl.style.background =
          pct > 80 ? 'var(--terra)' :
          pct < 20 ? 'var(--rust)'  : 'var(--gold)';
      }
    }
  }

  _buildParamRows(list, keys, params) {
    const LABELS = {
      alpha:'α  info', beta:'β  energy', gamma:'γ  entropy',
      epsilon:'ε  error', lambda0:'λ₀ decay', kappa:'κ  reinforce',
      sigma:'σ  noise', delta:'δ  connect', phi:'φ  query',
      tau:'τ  temp', mu:'μ  learn',
    };
    list.innerHTML = '';
    for (const key of keys) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `
        <div class="param-top">
          <span class="param-key">${LABELS[key] ?? key}</span>
          <span class="param-val" id="pv-${key}">—</span>
        </div>
        <div class="param-bar-bg">
          <div class="param-bar-fill" id="pb-${key}" style="width:50%"></div>
        </div>`;
      list.appendChild(row);
    }
  }

  // ══════════════════════════════════════════
  // BLOCK 15 RESEARCH METRICS
  // ══════════════════════════════════════════

  _updateBlock15Metrics(state) {
    const m = state.metrics ?? {};

    const MAP = {
      csi: 'conceptStabilityIndex',
      re:  'reasoningEfficiency',
      kd:  'knowledgeDensity',
      scs: 'semanticCoherenceScore',
      ced: 'cognitiveEnergyDistribution',
      er:  'explorationRatio',
      gps: 'graphPlasticityScore',
    };

    for (const [statKey, metricKey] of Object.entries(MAP)) {
      const val  = m[metricKey];
      const prev = this._prevMetrics[metricKey] ?? null;
      const el   = this._el(statKey);
      if (!el) continue;

      if (val == null) {
        el.textContent = '—';
        continue;
      }

      // Trend arrow
      const arrow =
        prev == null           ? ''   :
        val > prev + 0.005     ? ' ↑' :
        val < prev - 0.005     ? ' ↓' : ' →';

      // Colour by value range
      const colour =
        val >= 0.7 ? 'var(--sage)'  :
        val >= 0.4 ? 'var(--gold)'  : 'var(--terra)';

      const text = val.toFixed(3) + arrow;
      if (this._cache[statKey] !== text) {
        el.textContent = text;
        el.style.color = colour;
        this._cache[statKey] = text;
      }

      this._prevMetrics[metricKey] = val;
    }
  }

  // ══════════════════════════════════════════
  // ENERGY OVERLOAD WARNING
  // ══════════════════════════════════════════

  _updateEnergyWarning(state) {
    const el = document.getElementById(this._ids['energyWarning']);
    if (!el) return;
    const on = !!state.energyOverload;
    if (this._cache['energyOverload'] !== on) {
      el.style.display = on ? 'block' : 'none';
      this._cache['energyOverload'] = on;
    }
  }

  // ══════════════════════════════════════════
  // STATUS BAR
  // ══════════════════════════════════════════

  _updateStatusBar(state) {
    // Tick formatted
    const tickEl = document.getElementById('stat-tick');
    if (tickEl) tickEl.textContent = this._formatTick(state.tick);
  }

  // ══════════════════════════════════════════
  // FPS LOOP  (runs on rAF, independent of tick)
  // ══════════════════════════════════════════

  _startFPSLoop() {
    const loop = (now) => {
      this._rafId = requestAnimationFrame(loop);
      this._fpsFrames.push(now);
      // Keep only last 60 frames
      while (this._fpsFrames.length > 60) this._fpsFrames.shift();
      if (this._fpsFrames.length >= 2) {
        const span = this._fpsFrames.at(-1) - this._fpsFrames[0];
        const fps  = Math.round((this._fpsFrames.length - 1) / (span / 1000));
        const el   = document.getElementById('stat-fps');
        if (el && this._cache['fps'] !== fps) {
          el.textContent = fps;
          this._cache['fps'] = fps;
        }
        // FPS dot colour
        const dot = document.getElementById('fps-dot');
        if (dot) {
          dot.style.color =
            fps >= 25 ? 'var(--sage)'  :
            fps >= 15 ? 'var(--gold)'  : 'var(--terra)';
        }
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  // ══════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════

  /** Set text content, skip if unchanged */
  _setText(key, val) {
    const str = String(val);
    if (this._cache[key] === str) return;
    const el = this._el(key);
    if (el) { el.textContent = str; this._cache[key] = str; }
  }

  /** Set inline style, skip if unchanged */
  _setStyle(key, prop, val) {
    const cacheKey = key + '_' + prop;
    if (this._cache[cacheKey] === val) return;
    const el = this._el(key);
    if (el) { el.style[prop] = val; this._cache[cacheKey] = val; }
  }

  /** Animate a bar element to a target percentage */
  _setBar(id, targetPct, colour) {
    const el = document.getElementById(id);
    if (!el) return;
    const clamped = Math.max(0, Math.min(100, targetPct));
    // Lerp toward target for smooth animation
    const current = this._bars[id] ?? clamped;
    const next    = current + (clamped - current) * 0.18;
    this._bars[id] = next;
    el.style.width      = next.toFixed(1) + '%';
    el.style.background = colour;
  }

  /** Get element by statsIds key */
  _el(key) {
    const id = this._ids[key];
    return id ? document.getElementById(id) : null;
  }

  /** Format tick count with k/M suffix */
  _formatTick(tick) {
    if (tick == null) return '—';
    if (tick >= 1_000_000) return (tick / 1_000_000).toFixed(1) + 'M';
    if (tick >= 1_000)     return (tick / 1_000).toFixed(1) + 'k';
    return String(tick);
  }

  // ══════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
}