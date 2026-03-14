/**
 * HAKARI v3 — Controls.js
 * ─────────────────────────────────────────────
 * Production-grade UI control layer.
 * Owns ALL button bindings, keyboard shortcuts,
 * query pipeline, API key, canvas interaction,
 * phase badge, collapse flash, notice toast,
 * and experiment logging.
 *
 * Works with the exact DOM ids in index.html:
 *   btn-spawn, btn-reinforce, btn-entropy,
 *   btn-reset, btn-labels, btn-edges, btn-evo,
 *   query-input, btn-query, btn-query-clear,
 *   query-status, api-key-input, btn-api-apply,
 *   hakari-canvas, phase-badge, collapse-flash,
 *   notice, stat-fps, fps-dot
 *
 * Does NOT duplicate what the inline uiLoop
 * already handles (bars, sem-map, params, FPS).
 * Instead it co-exists cleanly alongside it.
 *
 * Keyboard shortcuts:
 *   Space          — pause / resume scheduler
 *   N              — spawn nodes
 *   R              — reinforce all
 *   E              — inject entropy
 *   L              — toggle labels
 *   G              — toggle edges
 *   /              — focus query input
 *   Escape         — clear query + blur input
 *   P              — pause / resume evolution
 *   Ctrl+Z         — reset field (with confirm)
 *   Ctrl+Shift+L   — start / stop experiment log
 *   Ctrl+Shift+D   — dump system report to console
 * ─────────────────────────────────────────────
 */

export class Controls {

  /**
   * @param {Hakari} hakari       — master engine instance
   * @param {object} [scheduler]  — Scheduler instance (optional)
   */
  constructor(hakari, scheduler = null) {
    this._h         = hakari;
    this._scheduler = scheduler;

    // ── Toggle state ──────────────────────
    this._labelsOn        = false;
    this._edgesOn         = true;
    this._evoPaused       = false;
    this._simPaused       = false;
    this._logging         = false;

    // ── Query state ───────────────────────
    this._queryHistory    = [];   // up to 50 entries
    this._histIdx         = -1;   // current ↑/↓ position
    this._queryBusy       = false;
    this._queryStatusTimer = null;

    // ── Cooldowns { key → ms timestamp } ─
    this._cd = {};

    // ── Collapse flash tracking ───────────
    this._prevCollapseRate = 0;

    // ── Notice ────────────────────────────
    this._noticeTimer = null;

    this._bindButtons();
    this._bindQuery();
    this._bindApiKey();
    this._bindKeyboard();
    this._bindCanvas();
    this._bindAutoFlash();

    console.log('[Controls] Ready.');
  }

  // ══════════════════════════════════════════════
  // BUTTON BINDINGS
  // ══════════════════════════════════════════════

  _bindButtons() {

    // ── Field controls ─────────────────────
    this._btn('btn-spawn', () => {
      if (!this._cd_ok('spawn', 280)) return;
      this._h.spawnNodes();
      this._canvasPulse();
      this._notice('＋ SPAWNED NODES', 'sage');
    });

    this._btn('btn-reinforce', () => {
      if (!this._cd_ok('reinforce', 380)) return;
      this._h.reinforceAll();
      this._notice('⚡ REINFORCEMENT APPLIED', 'gold');
    });

    this._btn('btn-entropy', () => {
      if (!this._cd_ok('entropy', 480)) return;
      this._h.injectEntropy();
      this._collapseFlash();
      this._notice('⊗ ENTROPY INJECTED', 'terra');
    });

    this._btn('btn-reset', () => {
      if (!this._cd_ok('reset', 1200)) return;
      if (!confirm('Reset the entire cognitive field?\nAll nodes, memory and history will be cleared.')) return;
      this._h.reset();
      this._clearQueryUI();
      this._updatePhaseBadge('—');
      this._notice('↺ FIELD RESET', 'rust', 2200);
    });

    // ── Visualisation toggles ──────────────
    this._btn('btn-labels', (btn) => {
      this._labelsOn = !this._labelsOn;
      btn.textContent = (this._labelsOn ? '● ' : '○ ') + 'Show Labels';
      if (this._h.nodeRenderer) this._h.nodeRenderer._showLabels = this._labelsOn;
      this._notice(this._labelsOn ? 'LABELS ON' : 'LABELS OFF');
    });

    this._btn('btn-edges', (btn) => {
      this._edgesOn = !this._edgesOn;
      btn.textContent = (this._edgesOn ? '○ Hide' : '● Show') + ' Edges';
      if (this._h.edgeRenderer) this._h.edgeRenderer._hidden = !this._edgesOn;
      this._notice(this._edgesOn ? 'EDGES VISIBLE' : 'EDGES HIDDEN');
    });

    // ── Evolution ─────────────────────────
    this._btn('btn-evo', (btn) => {
      this._evoPaused = !this._evoPaused;
      btn.textContent = (this._evoPaused ? '⬡ Resume' : '⬡ Pause') + ' Evolution';
      if (this._h.metaOptimizer) this._h.metaOptimizer.enabled = !this._evoPaused;
      this._notice(
        this._evoPaused ? 'EVOLUTION PAUSED' : 'EVOLUTION RESUMED',
        this._evoPaused ? 'rust' : 'gold'
      );
    });
  }

  // ══════════════════════════════════════════════
  // QUERY PIPELINE
  // ══════════════════════════════════════════════

  _bindQuery() {
    this._btn('btn-query', () => this._submitQuery());

    this._btn('btn-query-clear', () => {
      this._clearQueryFull();
      this._notice('QUERY CLEARED');
    });

    const input = this._id('query-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')     { e.preventDefault(); this._submitQuery(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); this._histNav(+1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); this._histNav(-1); }
      });
    }
  }

  async _submitQuery() {
    if (this._queryBusy) return;
    const input = this._id('query-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) { input.focus(); return; }

    // History
    if (this._queryHistory[0] !== text) {
      this._queryHistory.unshift(text);
      if (this._queryHistory.length > 50) this._queryHistory.pop();
    }
    this._histIdx = -1;

    // Lock UI
    this._queryBusy = true;
    this._setQueryStatus('querying…', 'gold');
    const btn = this._id('btn-query');
    if (btn) { btn.textContent = '⟳'; btn.disabled = true; }

    try {
      await this._h.query(text);
      this._setQueryStatus(`✓ "${this._clip(text, 24)}"`, 'sage');
      // Auto-dismiss after 5s
      clearTimeout(this._queryStatusTimer);
      this._queryStatusTimer = setTimeout(() => this._setQueryStatus('', ''), 5000);
    } catch (err) {
      const msg = err?.message ?? String(err);
      this._setQueryStatus(`⚠ ${this._clip(msg, 32)}`, 'terra');
      console.error('[Controls] query error:', err);
    } finally {
      this._queryBusy = false;
      if (btn) { btn.textContent = 'Query ▸'; btn.disabled = false; }
    }
  }

  _clearQueryFull() {
    this._h?.clearQuery();
    this._clearQueryUI();
  }

  _clearQueryUI() {
    const input = this._id('query-input');
    if (input) input.value = '';
    this._setQueryStatus('', '');
    clearTimeout(this._queryStatusTimer);
    this._histIdx = -1;
  }

  _setQueryStatus(text, colour) {
    const el = this._id('query-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = this._colour(colour);
  }

  _histNav(dir) {
    if (!this._queryHistory.length) return;
    this._histIdx = Math.max(-1,
      Math.min(this._queryHistory.length - 1, this._histIdx + dir));
    const input = this._id('query-input');
    if (input) input.value = this._histIdx >= 0
      ? this._queryHistory[this._histIdx] : '';
  }

  // ══════════════════════════════════════════════
  // API KEY
  // ══════════════════════════════════════════════

  _bindApiKey() {
    const input = this._id('api-key-input');
    const btn   = this._id('btn-api-apply');
    if (!input || !btn) return;

    // Reveal while focused
    input.addEventListener('focus', () => { input.type = 'text'; });
    input.addEventListener('blur',  () => { input.type = 'password'; });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });

    btn.addEventListener('click', () => {
      const key = input.value.trim();

      if (!key) {
        this._setQueryStatus('⚠ Paste your API key first', 'terra');
        input.focus(); return;
      }
      if (!key.startsWith('sk-')) {
        this._setQueryStatus('⚠ Key must start with sk-', 'terra');
        return;
      }

      // Push key to all LLM subsystems
      if (this._h.llmConnector?.setApiKey) this._h.llmConnector.setApiKey(key);
      else if (this._h.llmConnector)        this._h.llmConnector.apiKey = key;
      if (this._h.embedder)  this._h.embedder.apiKey = key;
      if (this._h.embedder)  this._h.embedder.mode   = 'api';

      // Visual confirmation
      input.value       = '';
      input.placeholder = 'Key set ✓';
      btn.textContent   = 'Applied ✓';
      btn.style.color   = 'var(--sage)';

      setTimeout(() => {
        btn.textContent   = 'Apply Key';
        btn.style.color   = '';
        input.placeholder = 'sk-… or sk-ant-…';
      }, 3500);

      this._notice('API KEY APPLIED — LLM ACTIVE', 'sage', 2500);
      console.log('[Controls] API key applied.');
    });
  }

  // ══════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ══════════════════════════════════════════════

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Never hijack input fields
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const ctrl  = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // ── Ctrl combos ──────────────────────
      if (ctrl && shift && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); this._toggleLogging(); return;
      }
      if (ctrl && shift && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault(); this._dumpReport(); return;
      }
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); this._id('btn-reset')?.click(); return;
      }

      // ── Single keys ───────────────────────
      switch (e.key) {
        case ' ':
          e.preventDefault();
          this._toggleSim();
          break;
        case 'n': case 'N':
          this._id('btn-spawn')?.click();
          break;
        case 'r': case 'R':
          this._id('btn-reinforce')?.click();
          break;
        case 'e': case 'E':
          this._id('btn-entropy')?.click();
          break;
        case 'l': case 'L':
          this._id('btn-labels')?.click();
          break;
        case 'g': case 'G':
          this._id('btn-edges')?.click();
          break;
        case 'p': case 'P':
          this._id('btn-evo')?.click();
          break;
        case '/':
          e.preventDefault();
          this._id('query-input')?.focus();
          break;
        case 'Escape':
          this._clearQueryFull();
          this._id('query-input')?.blur();
          break;
      }
    });
  }

  // ══════════════════════════════════════════════
  // CANVAS CLICK → nearest node info
  // ══════════════════════════════════════════════

  _bindCanvas() {
    const canvas = this._id('hakari-canvas');
    if (!canvas) return;

    canvas.addEventListener('click', (e) => {
      const nodes = this._h?.aliveNodes?.() ?? [];
      if (!nodes.length) return;

      const rect = canvas.getBoundingClientRect();
      const mx   = (e.clientX - rect.left) / rect.width;
      const my   = (e.clientY - rect.top)  / rect.height;

      let nearest = null, best = Infinity;
      for (const n of nodes) {
        const dx = (n.x ?? 0.5) - mx;
        const dy = (n.y ?? 0.5) - my;
        const d  = dx * dx + dy * dy;
        if (d < best) { best = d; nearest = n; }
      }

      // Hit radius ≈ 3% of canvas width
      if (nearest && Math.sqrt(best) < 0.03) {
        const lbl  = this._clip(nearest.label ?? nearest.id ?? '?', 14);
        const str  = nearest.strength?.toFixed(3)       ?? '—';
        const eng  = nearest.energy?.toFixed(3)         ?? '—';
        const act  = nearest.activationScore?.toFixed(3) ?? '—';
        const lam  = nearest.adaptiveLambda?.toFixed(4) ?? nearest.lambda?.toFixed(4) ?? '—';
        this._notice(`${lbl}  str:${str}  E:${eng}  A:${act}  λ:${lam}`, 'gold', 3000);
        console.log('[Controls] Node →', nearest);
      }
    });
  }

  // ══════════════════════════════════════════════
  // AUTO COLLAPSE FLASH
  // Watches collapse rate independently of tick
  // ══════════════════════════════════════════════

  _bindAutoFlash() {
    const check = () => {
      requestAnimationFrame(check);
      const cr = this._h?.collapseLog?.recentRate?.() ?? 0;
      if (cr > this._prevCollapseRate + 0.8) this._collapseFlash();
      this._prevCollapseRate = cr;
    };
    requestAnimationFrame(check);
  }

  // ══════════════════════════════════════════════
  // PHASE BADGE
  // ══════════════════════════════════════════════

  _updatePhaseBadge(phase) {
    const el = this._id('phase-badge');
    if (!el) return;
    const MAP = {
      ORDER:    { text: 'ORDER · STABLE',   cls: 'regime-stable'   },
      CRITICAL: { text: 'CRITICAL · EDGE',  cls: 'regime-critical' },
      CHAOS:    { text: 'CHAOS · UNSTABLE', cls: 'regime-chaotic'  },
    };
    const r = MAP[phase];
    if (r) { el.textContent = r.text; el.className = r.cls; }
    else   { el.textContent = phase ?? '—'; el.className = ''; }
  }

  // Call this from Scheduler or Hakari.update() after phaseDetector runs
  syncPhaseBadge() {
    const phase = this._h?.phaseDetector?.phase ?? '—';
    this._updatePhaseBadge(phase);
  }

  // ══════════════════════════════════════════════
  // SIMULATION PAUSE  (Space)
  // ══════════════════════════════════════════════

  _toggleSim() {
    const s = this._scheduler ?? window.__scheduler;
    if (!s) return;
    this._scheduler  = s;
    this._simPaused  = !this._simPaused;
    this._simPaused ? s.pause() : s.resume();
    this._notice(
      this._simPaused ? '⏸  SIMULATION PAUSED' : '▶  SIMULATION RUNNING',
      this._simPaused ? 'rust' : 'sage'
    );
  }

  // ══════════════════════════════════════════════
  // EXPERIMENT LOGGING  (Ctrl+Shift+L)
  // ══════════════════════════════════════════════

  _toggleLogging() {
    this._logging = !this._logging;
    if (this._logging) {
      const id = this._h?.startLogging?.({ source: 'Controls.js', ts: Date.now() }) ?? '—';
      this._notice(`◉ LOGGING  run·${id}`, 'gold', 2500);
      console.log('[Controls] Experiment logging started, run id:', id);
    } else {
      this._h?.stopLogging?.();
      this._notice('◎ LOGGING STOPPED — downloading…', 'sage', 2500);
      setTimeout(() => this._h?.downloadLog?.(), 700);
      console.log('[Controls] Experiment logging stopped.');
    }
  }

  // ══════════════════════════════════════════════
  // DEBUG DUMP  (Ctrl+Shift+D)
  // ══════════════════════════════════════════════

  _dumpReport() {
    if (!this._h?.systemReport) return;
    const report = this._h.systemReport();
    console.group('[HAKARI] System Report');
    console.log(JSON.stringify(report, null, 2));
    console.groupEnd();
    this._notice('REPORT DUMPED → console', 'gold');
  }

  // ══════════════════════════════════════════════
  // EFFECTS
  // ══════════════════════════════════════════════

  _collapseFlash() {
    const el = this._id('collapse-flash');
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;       // force reflow so animation restarts
    el.classList.add('flash');
  }

  _canvasPulse() {
    const el = this._id('hakari-canvas');
    if (!el) return;
    el.style.transition = 'opacity 0.07s ease';
    el.style.opacity    = '0.80';
    setTimeout(() => { el.style.opacity = '1'; }, 75);
  }

  // ══════════════════════════════════════════════
  // NOTICE TOAST
  // ══════════════════════════════════════════════

  _notice(text, colour = '', duration = 1800) {
    const el = this._id('notice');
    if (!el) return;
    el.textContent = text;
    el.style.color = this._colour(colour);
    el.classList.add('visible');
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => el.classList.remove('visible'), duration);
  }

  // ══════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════

  /** Bind click handler with btn ref passed in */
  _btn(id, fn) {
    const el = this._id(id);
    if (el) el.addEventListener('click', () => fn(el));
  }

  /** Get DOM element by literal id string */
  _id(id) { return document.getElementById(id); }

  /** Cooldown guard — true = allowed */
  _cd_ok(key, ms) {
    const now = Date.now();
    if (now - (this._cd[key] ?? 0) < ms) return false;
    this._cd[key] = now;
    return true;
  }

  /** Clip string with ellipsis */
  _clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /** CSS var for a colour name */
  _colour(name) {
    const MAP = {
      sage: 'var(--sage)', gold: 'var(--gold)',
      terra: 'var(--terra)', rust: 'var(--rust)',
    };
    return MAP[name] ?? '';
  }

  // ══════════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════════

  destroy() {
    clearTimeout(this._noticeTimer);
    clearTimeout(this._queryStatusTimer);
  }
}