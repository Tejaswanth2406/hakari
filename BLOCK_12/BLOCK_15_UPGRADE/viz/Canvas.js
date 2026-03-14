/**
 * HAKARI v3 — viz/Canvas.js
 * ─────────────────────────────────────────────
 * Advanced canvas wrapper.
 *
 * Features:
 *   - Auto-resize with devicePixelRatio support
 *     (sharp on retina / HiDPI screens)
 *   - Translucent clear for motion trail effect
 *   - Adaptive grid that scales with canvas size
 *   - Vignette overlay for depth
 *   - Post-process glow pass (optional)
 *   - Snapshot / export to PNG
 *   - onResize callback with logical dimensions
 * ─────────────────────────────────────────────
 */

export class Canvas {

  /**
   * @param {HTMLCanvasElement} el
   * @param {object} opts
   *   opts.onResize(w, h)  — called on resize with logical px
   *   opts.dpr             — override devicePixelRatio (default: auto)
   *   opts.glow            — enable glow post-pass (default: false)
   */
  constructor(el, opts = {}) {
    this.el          = el;
    this.ctx         = el.getContext('2d');
    this._onResize   = opts.onResize  ?? null;
    this._dpr        = opts.dpr       ?? Math.min(window.devicePixelRatio ?? 1, 2);
    this._glowEnabled = opts.glow     ?? false;

    // Logical dimensions (CSS pixels)
    this._logicalW   = 0;
    this._logicalH   = 0;

    // Trail alpha accumulator for motion blur tuning
    this._trailAlpha = 0.22;

    // Vignette cache
    this._vignetteGrad = null;
    this._vignetteW    = 0;
    this._vignetteH    = 0;

    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(el.parentElement ?? el);
  }

  // ══════════════════════════════════════════════
  // DIMENSIONS
  // ══════════════════════════════════════════════

  get width()  { return this._logicalW; }
  get height() { return this._logicalH; }
  get dpr()    { return this._dpr; }

  _resize() {
    const parent = this.el.parentElement ?? document.body;
    const w = parent.clientWidth  || this.el.offsetWidth;
    const h = parent.clientHeight || this.el.offsetHeight;
    if (w === 0 || h === 0) return;

    this._logicalW = w;
    this._logicalH = h;

    // Physical pixels for sharp rendering
    this.el.width  = Math.round(w * this._dpr);
    this.el.height = Math.round(h * this._dpr);

    // CSS size stays at logical pixels
    this.el.style.width  = w + 'px';
    this.el.style.height = h + 'px';

    // Scale ctx so all drawing uses logical coords
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);

    // Invalidate vignette cache
    this._vignetteGrad = null;

    this._onResize?.(w, h);
  }

  // ══════════════════════════════════════════════
  // CLEAR  — call at start of each frame
  // ══════════════════════════════════════════════

  /**
   * @param {number} alpha  — 1 = full clear, <1 = motion trails
   *   Recommended: 0.18–0.28 for smooth trails
   */
  clear(alpha = 1) {
    const { ctx } = this;
    if (alpha >= 1) {
      ctx.clearRect(0, 0, this._logicalW, this._logicalH);
      // Fill with paper colour
      ctx.fillStyle = '#f0ead8';
      ctx.fillRect(0, 0, this._logicalW, this._logicalH);
    } else {
      // Translucent fill = motion blur / trails
      ctx.fillStyle = `rgba(240,234,216,${alpha})`;
      ctx.fillRect(0, 0, this._logicalW, this._logicalH);
    }
  }

  // ══════════════════════════════════════════════
  // GRID
  // ══════════════════════════════════════════════

  /**
   * Draw adaptive grid. Spacing scales with canvas size.
   * @param {object} opts
   *   opts.spacing  — grid spacing in px (default: auto)
   *   opts.alpha    — line opacity (default: 0.04)
   *   opts.cross    — draw crosshair at centre (default: true)
   */
  drawGrid(opts = {}) {
    const { ctx }   = this;
    const W         = this._logicalW;
    const H         = this._logicalH;
    const spacing   = opts.spacing ?? Math.round(Math.max(W, H) / 22);
    const lineAlpha = opts.alpha   ?? 0.04;
    const cross     = opts.cross   ?? true;

    ctx.save();
    ctx.strokeStyle = `rgba(28,26,20,${lineAlpha})`;
    ctx.lineWidth   = 0.5;

    // Vertical lines
    for (let x = 0; x < W; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    // Horizontal lines
    for (let y = 0; y < H; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Centre crosshair
    if (cross) {
      ctx.strokeStyle = `rgba(28,26,20,${lineAlpha * 2.5})`;
      ctx.lineWidth   = 0.8;
      const cx = W / 2, cy = H / 2;
      ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.stroke();
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════
  // VIGNETTE  — subtle depth overlay
  // ══════════════════════════════════════════════

  drawVignette(strength = 0.18) {
    const { ctx } = this;
    const W = this._logicalW;
    const H = this._logicalH;

    // Rebuild gradient only on resize
    if (!this._vignetteGrad || this._vignetteW !== W || this._vignetteH !== H) {
      const cx = W / 2, cy = H / 2;
      const r  = Math.sqrt(cx * cx + cy * cy);
      this._vignetteGrad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
      this._vignetteGrad.addColorStop(0, 'rgba(28,26,20,0)');
      this._vignetteGrad.addColorStop(1, `rgba(28,26,20,${strength})`);
      this._vignetteW = W;
      this._vignetteH = H;
    }

    ctx.save();
    ctx.fillStyle = this._vignetteGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ══════════════════════════════════════════════
  // GLOW PASS  — soft bloom on bright pixels
  // Call AFTER all rendering is done for the frame
  // ══════════════════════════════════════════════

  drawGlowPass(radius = 8, alpha = 0.12) {
    if (!this._glowEnabled) return;
    const { ctx } = this;
    ctx.save();
    ctx.filter      = `blur(${radius}px)`;
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.el, 0, 0, this._logicalW, this._logicalH);
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter      = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ══════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════

  /** Download current frame as PNG */
  snapshot(filename = 'hakari-field.png') {
    const a    = document.createElement('a');
    a.href     = this.el.toDataURL('image/png');
    a.download = filename;
    a.click();
  }

  // ══════════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════════

  destroy() {
    this._resizeObserver?.disconnect();
  }
}