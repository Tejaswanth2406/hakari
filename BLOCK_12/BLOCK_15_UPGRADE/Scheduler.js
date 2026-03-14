/**
 * HAKARI v3 — Scheduler.js
 * ─────────────────────────────────────────────
 * requestAnimationFrame-based tick loop.
 *
 * Features:
 *   - Stable delta time (clamped to prevent spiral-of-death)
 *   - Target FPS throttle (default 30Hz)
 *   - pause() / resume() / setTargetFPS()
 *   - Exposes real-time stats (actualFPS, tickCount)
 * ─────────────────────────────────────────────
 */

export class Scheduler {

  /**
   * @param {Function} onTick      — called with dt (seconds)
   * @param {object}   [opts]
   * @param {number}   opts.targetFPS — default 30
   * @param {number}   opts.maxDt     — clamp dt to this max (default 0.1s)
   */
  constructor(onTick, opts = {}) {
    this._onTick    = onTick;
    this._targetFPS = opts.targetFPS ?? 30;
    this._maxDt     = opts.maxDt     ?? 0.1;

    this._running   = false;
    this._rafId     = null;
    this._lastTime  = null;
    this._frameMs   = 1000 / this._targetFPS;

    this.tickCount  = 0;
    this.actualFPS  = 0;

    this._fpsAccum  = 0;
    this._fpsFrames = 0;
  }

  // ── CONTROL ───────────────────────────────────

  start() {
    if (this._running) return;
    this._running  = true;
    this._lastTime = performance.now();
    this._loop(performance.now());
  }

  pause()  { this._running = false; if (this._rafId) cancelAnimationFrame(this._rafId); }
  resume() { if (!this._running) this.start(); }

  setTargetFPS(fps) {
    this._targetFPS = fps;
    this._frameMs   = 1000 / fps;
  }

  // ── LOOP ──────────────────────────────────────

  _loop(now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(t => this._loop(t));

    const elapsed = now - this._lastTime;
    if (elapsed < this._frameMs * 0.9) return;  // throttle to targetFPS

    const dt = Math.min(elapsed / 1000, this._maxDt);
    this._lastTime = now;
    this.tickCount++;

    // FPS measurement (rolling over 1 second)
    this._fpsAccum  += elapsed;
    this._fpsFrames++;
    if (this._fpsAccum >= 1000) {
      this.actualFPS  = this._fpsFrames;
      this._fpsFrames = 0;
      this._fpsAccum -= 1000;
    }

    try {
      this._onTick(dt);
    } catch (err) {
      console.error('[Scheduler] Tick error:', err);
    }
  }

  getState() {
    return {
      running:    this._running,
      tickCount:  this.tickCount,
      actualFPS:  this.actualFPS,
      targetFPS:  this._targetFPS,
    };
  }
}