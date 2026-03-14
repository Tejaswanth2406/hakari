/**
 * HAKARI v3 — viz/EdgeRenderer.js
 * ─────────────────────────────────────────────
 * Advanced edge renderer for the cognitive field.
 *
 * Visual encoding:
 *   Opacity   → edge weight
 *   Width     → weight × activation of endpoints
 *   Colour    → type: normal / reinforced / query
 *   Dash      → weak / decaying edges
 *   Flow anim → active information-flow edges
 *   Glow      → high-weight edges pulse softly
 *
 * Rendering modes:
 *   NORMAL    — all edges, weight-encoded opacity
 *   SPARSE    — only edges above weight threshold
 *   HIDDEN    — no edges (toggle off)
 *
 * Colour palette (matches Tsubaki theme):
 *   Normal edge     → ink   rgba(28,26,20,...)
 *   Reinforced edge → gold  rgba(184,122,48,...)
 *   Query edge      → sage  rgba(90,107,68,...)
 *   Weak/dying edge → rust  rgba(140,53,32,...)
 * ─────────────────────────────────────────────
 */

export class EdgeRenderer {

  constructor(canvas) {
    this._canvas       = canvas;
    this._hidden       = false;
    this._mode         = 'NORMAL';    // 'NORMAL' | 'SPARSE' | 'HIDDEN'
    this._weightThresh = 0.08;        // minimum weight to draw in SPARSE
    this._maxEdges     = 3000;        // hard cap to protect perf

    // Flow animation state { edgeKey → phase }
    this._flowPhase    = new Map();
    this._lastTime     = performance.now();

    // Query active edge set { 'a:b' keys }
    this._queryEdges   = new Set();
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  hide()   { this._hidden = true; }
  show()   { this._hidden = false; }
  toggle() { this._hidden = !this._hidden; }

  setMode(mode) { this._mode = mode; }

  setQueryEdges(edgeKeys) {
    this._queryEdges = new Set(edgeKeys ?? []);
  }
  clearQuery() { this._queryEdges.clear(); }

  // ══════════════════════════════════════════════
  // RENDER  — called every frame
  // ══════════════════════════════════════════════

  render(nodes, graph, nodeMap) {
    if (this._hidden || this._mode === 'HIDDEN') return;

    const { ctx } = this._canvas;
    const W       = this._canvas.width;
    const H       = this._canvas.height;
    const now     = performance.now();
    const dt      = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    const allEdges = graph.getAllEdges?.() ?? [];
    if (!allEdges.length) return;

    // Sort by weight descending, cap at maxEdges
    const edges = allEdges
      .filter(e => (e.weight ?? 0) >= (this._mode === 'SPARSE' ? this._weightThresh : 0.01))
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, this._maxEdges);

    ctx.save();

    for (const edge of edges) {
      const na = nodeMap.get(edge.a);
      const nb = nodeMap.get(edge.b);
      if (!na || !nb || !na.alive || !nb.alive) continue;

      const w    = edge.weight ?? 0.5;
      const actA = na.activationScore ?? 0;
      const actB = nb.activationScore ?? 0;
      const maxAct = Math.max(actA, actB);

      const x1 = (na.x ?? 0.5) * W;
      const y1 = (na.y ?? 0.5) * H;
      const x2 = (nb.x ?? 0.5) * W;
      const y2 = (nb.y ?? 0.5) * H;

      const edgeKey = `${edge.a}:${edge.b}`;
      const isQuery = this._queryEdges.has(edgeKey)
                   || this._queryEdges.has(`${edge.b}:${edge.a}`);
      const isHot   = maxAct > 0.5 && w > 0.3;
      const isWeak  = w < 0.15;

      // ── Colour + width ────────────────────────
      let colour, lineW, alpha;

      if (isQuery) {
        colour = `rgba(90,107,68,`;
        lineW  = 0.8 + w * 1.5;
        alpha  = 0.25 + w * 0.5;
      } else if (isHot) {
        colour = `rgba(184,122,48,`;
        lineW  = 0.6 + w * 1.8;
        alpha  = 0.15 + w * 0.45;
      } else if (isWeak) {
        colour = `rgba(140,53,32,`;
        lineW  = 0.4;
        alpha  = 0.08 + w * 0.25;
      } else {
        colour = `rgba(28,26,20,`;
        lineW  = 0.5 + w * 1.2;
        alpha  = 0.06 + w * 0.28;
      }

      ctx.beginPath();
      ctx.strokeStyle = colour + Math.min(alpha, 0.65) + ')';
      ctx.lineWidth   = lineW;
      ctx.globalAlpha = 1;

      // Dashed for weak edges
      if (isWeak) {
        ctx.setLineDash([3, 5]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // ── Flow animation on hot / query edges ───
      if ((isHot || isQuery) && w > 0.25) {
        this._drawFlowParticle(ctx, edgeKey, x1, y1, x2, y2, w, isQuery, dt);
      }
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  // ══════════════════════════════════════════════
  // FLOW PARTICLE  — dot travelling along an edge
  // ══════════════════════════════════════════════

  _drawFlowParticle(ctx, key, x1, y1, x2, y2, weight, isQuery, dt) {
    let phase = this._flowPhase.get(key) ?? Math.random();
    phase     = (phase + dt * (0.3 + weight * 0.5)) % 1;
    this._flowPhase.set(key, phase);

    const px     = x1 + (x2 - x1) * phase;
    const py     = y1 + (y2 - y1) * phase;
    const radius = 1.2 + weight * 1.5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle   = isQuery ? '#5a6b44' : '#b87a30';
    ctx.globalAlpha = 0.5 + weight * 0.35;
    ctx.fill();
    ctx.restore();
  }
}