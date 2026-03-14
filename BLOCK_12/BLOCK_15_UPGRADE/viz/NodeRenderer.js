/**
 * HAKARI v3 — viz/NodeRenderer.js
 * ─────────────────────────────────────────────
 * Advanced node renderer for the cognitive field.
 *
 * Visual encoding:
 *   Size      → node strength (H)
 *   Colour    → activation score (A) + energy (E)
 *   Opacity   → strength × age factor
 *   Ring      → highlighted / query-active node
 *   Pulse     → high-activation nodes breathe
 *   Halo      → energy overload warning
 *   Label     → id or concept label (toggleable)
 *   Death anim→ collapsing nodes fade + shrink
 *
 * Colour palette (matches Tsubaki theme):
 *   Low  activation → gold   (#b87a30)
 *   Mid  activation → terra  (#c84b2f)
 *   High activation → rust   (#8c3520)
 *   Query highlight → sage   (#5a6b44)
 *   Energy overload → terra2 (#e06040)
 * ─────────────────────────────────────────────
 */

export class NodeRenderer {

  constructor(canvas) {
    this._canvas      = canvas;
    this._showLabels  = false;
    this._highlight   = null;   // highlighted node id
    this._queryIds    = new Set(); // nodes activated by query

    // Pulse animation state { nodeId → phase }
    this._pulsePhase  = new Map();
    this._lastTime    = performance.now();

    // Death animation queue { nodeId → { x, y, r, alpha, ttl } }
    this._deathAnims  = new Map();
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  setHighlight(nodeId)  { this._highlight = nodeId; }
  clearHighlight()      { this._highlight = null; }

  setQueryActive(nodeIds) {
    this._queryIds = new Set(nodeIds ?? []);
  }
  clearQuery() { this._queryIds.clear(); }

  /** Register a just-collapsed node for death animation */
  registerDeath(node) {
    const W = this._canvas.width;
    const H = this._canvas.height;
    this._deathAnims.set(node.id, {
      x:     (node.x ?? 0.5) * W,
      y:     (node.y ?? 0.5) * H,
      r:     3 + (node.strength ?? 0.3) * 8,
      alpha: 0.6,
      ttl:   1.0,  // seconds
    });
  }

  // ══════════════════════════════════════════════
  // RENDER  — called every frame
  // ══════════════════════════════════════════════

  render(nodes) {
    const { ctx }  = this._canvas;
    const W        = this._canvas.width;
    const H        = this._canvas.height;
    const now      = performance.now();
    const dt       = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    // ── Death animations ────────────────────────
    this._tickDeathAnims(ctx, dt);

    // ── Live nodes ──────────────────────────────
    for (const node of nodes) {
      if (!node.alive) continue;

      const x   = (node.x ?? 0.5) * W;
      const y   = (node.y ?? 0.5) * H;
      const str = node.strength      ?? 0.5;
      const act = node.activationScore ?? 0;
      const eng = node.energy         ?? 0.5;
      const age = node.age            ?? 1;

      // Base radius — strength driven, min 2.5 max 14
      const baseR = 2.5 + str * 11.5;

      // Pulse for high-activation nodes
      const pulse = this._getPulse(node.id, act, dt);
      const r     = baseR + pulse;

      // Colour — blend gold→terra→rust by activation
      const colour = this._nodeColour(act, eng, node.id);

      // Opacity — strength × age ramp-in (new nodes fade in)
      const ageFactor = Math.min(age / 60, 1);  // ramp over ~60 ticks
      const alpha     = 0.3 + str * 0.55 * ageFactor;

      // ── Glow / halo for overloaded nodes ──────
      if (eng > 0.85) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(x, y, r, x, y, r + 5);
        glow.addColorStop(0, 'rgba(224,96,64,0.25)');
        glow.addColorStop(1, 'rgba(224,96,64,0)');
        ctx.fillStyle   = glow;
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.restore();
      }

      // ── Query activation halo ─────────────────
      if (this._queryIds.has(node.id) && act > 0.3) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r + 4 + act * 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#5a6b44';
        ctx.lineWidth   = 0.8;
        ctx.globalAlpha = act * 0.6;
        ctx.stroke();
        ctx.restore();
      }

      // ── Main circle ───────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle   = colour;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // ── Highlight ring ────────────────────────
      if (this._highlight === node.id) {
        ctx.strokeStyle = '#b87a30';
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
      }

      ctx.restore();

      // ── Label ─────────────────────────────────
      if (this._showLabels && (node.label || node.id)) {
        this._drawLabel(ctx, node, x, y, r, alpha);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════

  _nodeColour(act, eng, id) {
    // Activation drives hue: gold → terra → rust
    if (act > 0.75) return '#8c3520';       // rust — peak activation
    if (act > 0.45) return '#c84b2f';       // terra
    if (act > 0.20) return '#b87a30';       // gold
    return '#4a4535';                        // ink3 — dormant
  }

  _getPulse(id, act, dt) {
    if (act < 0.35) {
      this._pulsePhase.delete(id);
      return 0;
    }
    let phase = this._pulsePhase.get(id) ?? Math.random() * Math.PI * 2;
    phase += dt * (2 + act * 3);  // speed scales with activation
    this._pulsePhase.set(id, phase % (Math.PI * 2));
    return Math.sin(phase) * act * 1.8;  // max ±1.8px
  }

  _drawLabel(ctx, node, x, y, r, alpha) {
    const label = node.label ?? node.id ?? '';
    const maxLen = 12;
    const text   = label.length > maxLen ? label.slice(0, maxLen - 1) + '…' : label;
    ctx.save();
    ctx.font        = `${Math.max(7, 7 + (node.strength ?? 0) * 2)}px "Share Tech Mono"`;
    ctx.fillStyle   = '#1c1a14';
    ctx.globalAlpha = Math.min(alpha * 1.4, 0.85);
    ctx.fillText(text, x + r + 2, y + 3);
    ctx.restore();
  }

  _tickDeathAnims(ctx, dt) {
    for (const [id, anim] of this._deathAnims) {
      anim.ttl   -= dt;
      anim.alpha -= dt * 0.8;
      anim.r     += dt * 12;  // expand outward

      if (anim.ttl <= 0 || anim.alpha <= 0) {
        this._deathAnims.delete(id);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(anim.x, anim.y, anim.r, 0, Math.PI * 2);
      ctx.strokeStyle = '#8c3520';
      ctx.lineWidth   = 1;
      ctx.globalAlpha = Math.max(0, anim.alpha);
      ctx.stroke();
      ctx.restore();
    }
  }
}