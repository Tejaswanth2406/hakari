/**
 * HAKARI v3 — ui/SemanticMapViewer.js
 * ─────────────────────────────────────────────
 * 2D interactive visualisation of ConceptSpace.
 * Renders PCA-projected node vectors as a
 * semantic map — clusters visible as spatial
 * groupings. Independent of the main HAKARI canvas.
 *
 * Features:
 *   - Separate <canvas> for semantic space
 *   - PCA projection via ConceptSpace.project2D()
 *   - Cluster-coloured nodes (7 palette entries)
 *   - Node label on hover
 *   - Zoom (scroll wheel) + Pan (mouse drag)
 *   - Click node → highlight in main canvas
 *   - Live update every REFRESH_EVERY ticks
 *   - Strength → node radius mapping
 *   - Entropy-regime background tint
 *
 * Architecture:
 *   SemanticMapViewer owns its own canvas context.
 *   Reads from hakari.conceptSpace + hakari.aliveNodes().
 *   Never writes to hakari state.
 * ─────────────────────────────────────────────
 */

const CLUSTER_PALETTE = [
  '#00e5ff', // cyan
  '#a259ff', // violet
  '#00ff9d', // green
  '#ff9900', // amber
  '#ff3d71', // red
  '#ffdd57', // yellow
  '#c8d6e8', // steel
];

const REFRESH_EVERY   = 8;    // ticks between projection recompute
const RADIUS_MIN      = 3;
const RADIUS_MAX      = 9;
const FONT            = '9px "Share Tech Mono", monospace';

export class SemanticMapViewer {

  /**
   * @param {Hakari}            hakari
   * @param {HTMLCanvasElement} canvasEl  — dedicated semantic-map canvas
   */
  constructor(hakari, canvasEl) {
    this.hakari    = hakari;
    this.el        = canvasEl;
    this.ctx       = canvasEl?.getContext('2d');

    // Viewport transform
    this._scale    = 1.0;
    this._offsetX  = 0;
    this._offsetY  = 0;
    this._dragging = false;
    this._dragStart = { x: 0, y: 0 };

    // Last computed projection
    this._coords   = new Map();   // nodeId → {px, py}
    this._tickCount = 0;

    // Hover state
    this._hoverNode = null;

    // Bound listeners for cleanup
    this._bound = [];

    if (canvasEl) {
      this._initCanvas();
      this._bindEvents();
    }
  }

  // ── TICK ─────────────────────────────────────

  tick() {
    this._tickCount++;
    if (this._tickCount % REFRESH_EVERY === 0) {
      this._reproject();
    }
    this._draw();
  }

  // ── REFRESH ──────────────────────────────────

  /** Force immediate reprojection + redraw. */
  forceRefresh() {
    this._reproject();
    this._draw();
  }

  // ── VIEWPORT CONTROLS ────────────────────────

  resetView() {
    this._scale   = 1.0;
    this._offsetX = 0;
    this._offsetY = 0;
    this._draw();
  }

  zoomTo(scale) {
    this._scale = Math.max(0.3, Math.min(5, scale));
    this._draw();
  }

  // ── DESTROY ──────────────────────────────────

  destroy() {
    for (const { el, event, handler } of this._bound) {
      el.removeEventListener(event, handler);
    }
  }

  // ── PRIVATE — PROJECTION ─────────────────────

  _reproject() {
    if (!this.hakari.conceptSpace || !this.el) return;

    const nodes  = this.hakari.aliveNodes();
    const raw    = this.hakari.conceptSpace.project2D(nodes);
    // raw coords are in [-1, 1]. Convert to canvas pixels.
    const W = this.el.clientWidth  || this.el.width  || 300;
    const H = this.el.clientHeight || this.el.height || 300;
    const cx = W / 2, cy = H / 2;
    const scale = Math.min(W, H) * 0.42;

    this._coords.clear();
    for (const [id, { x, y }] of raw) {
      this._coords.set(id, { px: cx + x * scale, py: cy + y * scale });
    }
  }

  // ── PRIVATE — DRAW ───────────────────────────

  _draw() {
    const ctx = this.ctx;
    if (!ctx || !this.el) return;

    const W = this.el.width  = this.el.clientWidth  || 300;
    const H = this.el.height = this.el.clientHeight || 300;

    // ── Background ────────────────────────────
    const regime = this.hakari.entropyField?.regime ?? 'LOW';
    const bgTint = regime === 'HIGH' ? 'rgba(30,5,5,1)'
                 : regime === 'MEDIUM' ? 'rgba(5,10,20,1)'
                 : 'rgba(3,5,8,1)';
    ctx.fillStyle = bgTint;
    ctx.fillRect(0, 0, W, H);

    // ── Grid ──────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.04)';
    ctx.lineWidth   = 0.5;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
    ctx.restore();

    // ── Apply viewport transform ───────────────
    ctx.save();
    ctx.translate(this._offsetX, this._offsetY);
    ctx.scale(this._scale, this._scale);

    const nodes   = this.hakari.aliveNodes();
    const nodeMap = this.hakari._nodeMap;

    // ── Draw semantic edges (faint) ────────────
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth   = 0.5;

    for (const node of nodes) {
      const posA = this._coords.get(node.id);
      if (!posA) continue;
      const neighbors = this.hakari.graph.getNeighbors(node.id) ?? [];
      for (const { id: nId } of neighbors) {
        if (node.id >= nId) continue;   // deduplicate
        const posB = this._coords.get(nId);
        if (!posB) continue;
        ctx.beginPath();
        ctx.moveTo(posA.px, posA.py);
        ctx.lineTo(posB.px, posB.py);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // ── Draw nodes ────────────────────────────
    for (const node of nodes) {
      const pos = this._coords.get(node.id);
      if (!pos) continue;

      const clusterId  = this.hakari.conceptSpace?.clusterOf(node.id) ?? 0;
      const color      = CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length];
      const r          = RADIUS_MIN + node.strength * (RADIUS_MAX - RADIUS_MIN);
      const isHovered  = this._hoverNode === node.id;
      const isActive   = node.activationScore > 0.1;

      // Glow for active nodes
      if (isActive || isHovered) {
        ctx.save();
        const grad = ctx.createRadialGradient(pos.px, pos.py, r, pos.px, pos.py, r * 3);
        grad.addColorStop(0, color.replace(')', ',0.3)').replace('rgb', 'rgba'));
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pos.px, pos.py, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Core dot
      ctx.beginPath();
      ctx.arc(pos.px, pos.py, r, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? '#ffffff' : color;
      ctx.globalAlpha = 0.5 + node.strength * 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Highlight ring on hover
      if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(pos.px, pos.py, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ── Draw labels for hovered node ──────────
    if (this._hoverNode) {
      const node = nodeMap?.get(this._hoverNode);
      const pos  = this._coords.get(this._hoverNode);
      if (node && pos) {
        const label    = node.label || node.id;
        const clusterId = this.hakari.conceptSpace?.clusterOf(node.id) ?? 0;
        const color     = CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length];
        ctx.font        = FONT;
        ctx.fillStyle   = 'rgba(0,0,0,0.75)';
        ctx.fillText(label, pos.px + 7, pos.py + 3);
        ctx.fillStyle   = color;
        ctx.fillText(label, pos.px + 6, pos.py + 2);
      }
    }

    ctx.restore();

    // ── Legend ────────────────────────────────
    this._drawLegend(ctx);

    // ── Title ─────────────────────────────────
    ctx.fillStyle = 'rgba(0,229,255,0.3)';
    ctx.font      = '8px "Share Tech Mono", monospace';
    ctx.fillText('CONCEPT SPACE  PCA₂', 6, 12);
    ctx.fillText(`nodes: ${nodes.length}  clusters: ${this.hakari.conceptSpace?.clusterCount ?? 0}`, 6, 22);
  }

  _drawLegend(ctx) {
    const count = Math.min(this.hakari.conceptSpace?.clusterCount ?? 0, CLUSTER_PALETTE.length);
    if (count === 0) return;
    const H = this.el?.height ?? 300;
    ctx.font = '7px "Share Tech Mono", monospace';
    for (let k = 0; k < count; k++) {
      ctx.fillStyle = CLUSTER_PALETTE[k];
      ctx.fillRect(6, H - 16 - k * 10, 6, 6);
      ctx.fillStyle = 'rgba(200,214,232,0.5)';
      ctx.fillText(`C${k}`, 14, H - 10 - k * 10);
    }
  }

  // ── PRIVATE — EVENTS ─────────────────────────

  _initCanvas() {
    this.el.style.cursor = 'crosshair';
    this.el.style.background = '#030508';
  }

  _bindEvents() {
    const el = this.el;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.85 : 1.15;
      this._scale = Math.max(0.3, Math.min(6, this._scale * delta));
      this._draw();
    };

    const onMouseDown = (e) => {
      this._dragging  = true;
      this._dragStart = { x: e.clientX - this._offsetX, y: e.clientY - this._offsetY };
    };

    const onMouseMove = (e) => {
      if (this._dragging) {
        this._offsetX = e.clientX - this._dragStart.x;
        this._offsetY = e.clientY - this._dragStart.y;
        this._draw();
      } else {
        this._updateHover(e);
      }
    };

    const onMouseUp   = () => { this._dragging = false; };
    const onMouseLeave = () => { this._dragging = false; this._hoverNode = null; };

    const onClick = (e) => {
      const hit = this._hitTest(e);
      if (hit) {
        this.hakari.nodeRenderer?.setHighlight(hit);
        this.hakari.graphInspector?.inspect?.(hit);
      }
    };

    el.addEventListener('wheel',      onWheel,      { passive: false });
    el.addEventListener('mousedown',  onMouseDown);
    el.addEventListener('mousemove',  onMouseMove);
    el.addEventListener('mouseup',    onMouseUp);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('click',      onClick);

    this._bound.push(
      { el, event: 'wheel',      handler: onWheel },
      { el, event: 'mousedown',  handler: onMouseDown },
      { el, event: 'mousemove',  handler: onMouseMove },
      { el, event: 'mouseup',    handler: onMouseUp },
      { el, event: 'mouseleave', handler: onMouseLeave },
      { el, event: 'click',      handler: onClick },
    );
  }

  _updateHover(e) {
    const hit = this._hitTest(e);
    if (hit !== this._hoverNode) {
      this._hoverNode = hit;
      this._draw();
    }
  }

  _hitTest(e) {
    const rect = this.el.getBoundingClientRect();
    const mx   = (e.clientX - rect.left - this._offsetX) / this._scale;
    const my   = (e.clientY - rect.top  - this._offsetY) / this._scale;
    const HIT  = 10 / this._scale;

    let best = null, bestD = Infinity;
    for (const [id, { px, py }] of this._coords) {
      const d = Math.hypot(px - mx, py - my);
      if (d < HIT && d < bestD) { bestD = d; best = id; }
    }
    return best;
  }
}