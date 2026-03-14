/**
 * HAKARI v3 — SimulationManager.js
 * ─────────────────────────────────────────────
 * Parallel simulation engine.
 * Manages multiple independent HAKARI worlds.
 *
 * Each world is a full, isolated Hakari instance
 * with its own physics, memory, and graph.
 * Worlds share no state — they are side-by-side
 * reality branches.
 *
 * Use cases:
 *   - A/B parameter comparison
 *   - Population-based meta-learning
 *   - Tournament selection across worlds
 *   - What-if scenario testing
 *   - Ensemble predictions (average across worlds)
 *
 * Architecture:
 *   Map<worldId, { hakari, config, meta }>
 *   Master scheduler drives all worlds at same Hz.
 *
 * Performance:
 *   Canvas rendering is optional per-world.
 *   Headless worlds run ~3× faster.
 *   Up to ~8 headless worlds recommended at 30Hz.
 *
 * API:
 *   createWorld(config) → worldId
 *   destroyWorld(worldId)
 *   stepWorld(worldId, dt)  — advance one tick
 *   stepAll(dt)             — advance all worlds
 *   compareWorlds()         — metric comparison table
 *   bestWorld()             — highest objective J
 *   transplantParameters(fromId, toId) — copy evolved θ
 * ─────────────────────────────────────────────
 */

import { Hakari }    from './Hakari.js';
import { GLOBAL_RNG } from './BLOCK_15_UPGRADE/core/SeededRNG.js';

const MAX_WORLDS = 8;

export class SimulationManager {

  constructor() {
    // Map<worldId, WorldEntry>
    this._worlds   = new Map();
    this._counter  = 0;
    this._masterTick = 0;
  }

  // ── WORLD LIFECYCLE ──────────────────────────

  /**
   * Create a new isolated Hakari world.
   *
   * @param {object} config
   *   config.seed             — RNG seed
   *   config.canvasEl         — optional HTMLCanvasElement
   *   config.statsIds         — optional DOM ids for stats
   *   config.paramOverrides   — initial parameter values
   *   config.nodeCount        — initial node spawn
   *   config.label            — human name
   * @returns {string} worldId
   */
  createWorld(config = {}) {
    if (this._worlds.size >= MAX_WORLDS) {
      console.warn('[SimulationManager] MAX_WORLDS reached. Destroy a world first.');
      return null;
    }

    const {
      seed           = Date.now() & 0xFFFFFF,
      canvasEl       = null,
      statsIds       = {},
      paramOverrides = {},
      nodeCount      = null,
      label          = `World-${this._counter}`,
    } = config;

    const worldId = `W${++this._counter}`;

    // Seed global RNG for this world's boot
    const prevState = GLOBAL_RNG.save();
    GLOBAL_RNG.seed(seed);

    const hakari = new Hakari({
      canvasEl,
      statsIds,
      llm:     config.llm     ?? {},
      embedder: config.embedder ?? {},
    });

    // Apply parameter overrides
    for (const [key, val] of Object.entries(paramOverrides)) {
      hakari.parameterField.set(key, val);
    }

    // Additional node spawn if specified
    if (nodeCount !== null) {
      const current = hakari.aliveNodes().length;
      if (nodeCount > current) hakari.spawnNodes(nodeCount - current);
    }

    // Restore RNG so other worlds use their own seeds
    GLOBAL_RNG.restore(prevState);

    const entry = {
      id:       worldId,
      hakari,
      config:   { ...config, seed, label },
      meta: {
        seed,
        label,
        createdAt:  Date.now(),
        tickCount:  0,
        paused:     false,
      },
    };

    this._worlds.set(worldId, entry);
    return worldId;
  }

  /**
   * Destroy a world and free resources.
   * @param {string} worldId
   */
  destroyWorld(worldId) {
    const entry = this._worlds.get(worldId);
    if (!entry) return;
    entry.hakari.canvas?.destroy?.();
    this._worlds.delete(worldId);
  }

  // ── STEPPING ─────────────────────────────────

  /**
   * Step a single world by one tick.
   * @param {string} worldId
   * @param {number} dt — delta time in seconds
   */
  stepWorld(worldId, dt = 1/30) {
    const entry = this._worlds.get(worldId);
    if (!entry || entry.meta.paused) return;
    entry.hakari.update(dt);
    entry.meta.tickCount++;
  }

  /**
   * Step all worlds by one tick.
   * Use this in a master animation loop to advance
   * all worlds in lockstep.
   * @param {number} dt
   */
  stepAll(dt = 1/30) {
    this._masterTick++;
    for (const [id] of this._worlds) {
      this.stepWorld(id, dt);
    }
  }

  /**
   * Step all worlds N ticks synchronously.
   * No rendering — headless batch.
   * @param {number} n
   * @param {number} dt
   */
  async stepAllN(n, dt = 1/30) {
    for (let t = 0; t < n; t++) {
      this.stepAll(dt);
      // Yield every 50 ticks
      if (t % 50 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }

  // ── PAUSE / RESUME ───────────────────────────

  pauseWorld(worldId)  {
    const e = this._worlds.get(worldId);
    if (e) e.meta.paused = true;
  }

  resumeWorld(worldId) {
    const e = this._worlds.get(worldId);
    if (e) e.meta.paused = false;
  }

  // ── WORLD ACCESS ─────────────────────────────

  /**
   * Get a world's Hakari instance.
   * @param {string} worldId
   * @returns {Hakari|null}
   */
  getHakari(worldId) {
    return this._worlds.get(worldId)?.hakari ?? null;
  }

  /**
   * All world ids.
   * @returns {string[]}
   */
  worldIds() {
    return [...this._worlds.keys()];
  }

  get worldCount() { return this._worlds.size; }

  // ── COMPARISON ───────────────────────────────

  /**
   * Metric comparison table across all worlds.
   * @returns {Array<WorldMetrics>}
   */
  compareWorlds() {
    return [...this._worlds.values()].map(({ id, hakari, meta }) => {
      const alive = hakari.aliveNodes();
      const J = hakari.objectiveFunction?.lastJ ?? 0;
      return {
        id,
        label:         meta.label,
        tickCount:     meta.tickCount,
        nodeCount:     alive.length,
        objective:     J,
        entropy:       hakari.entropyField?.S ?? 0,
        avgStrength:   alive.length > 0
          ? alive.reduce((s, n) => s + n.strength, 0) / alive.length
          : 0,
        collapseRate:  hakari.collapseLog?.recentRate() ?? 0,
        phase:         hakari.phaseDetector?.phase ?? '—',
        stability:     hakari.stabilityAnalyzer?.stabilityScore ?? 1,
        paramSnapshot: { ...hakari.parameterField?.current },
      };
    });
  }

  /**
   * World with highest current objective J.
   * @returns {string|null} worldId
   */
  bestWorld() {
    let best = null, bestJ = -Infinity;
    for (const [id, { hakari }] of this._worlds) {
      const J = hakari.objectiveFunction?.lastJ ?? 0;
      if (J > bestJ) { bestJ = J; best = id; }
    }
    return best;
  }

  /**
   * World with lowest collapse rate.
   * @returns {string|null} worldId
   */
  stablestWorld() {
    let best = null, bestC = Infinity;
    for (const [id, { hakari }] of this._worlds) {
      const C = hakari.collapseLog?.recentRate() ?? 0;
      if (C < bestC) { bestC = C; best = id; }
    }
    return best;
  }

  // ── PARAMETER TRANSPLANT ─────────────────────

  /**
   * Copy evolved parameters from one world to another.
   * Used for tournament selection — winner's θ
   * replaces loser's θ.
   *
   * @param {string} fromId  — source world
   * @param {string} toId    — target world
   */
  transplantParameters(fromId, toId) {
    const src = this._worlds.get(fromId);
    const dst = this._worlds.get(toId);
    if (!src || !dst) return;

    const srcParams = src.hakari.parameterField?.current ?? {};
    for (const [key, val] of Object.entries(srcParams)) {
      dst.hakari.parameterField?.set(key, val);
    }
  }

  /**
   * Run a tournament: best world shares parameters
   * with the worst world, then both reset their graphs.
   * Used for population-based meta-learning.
   */
  tournament() {
    if (this._worlds.size < 2) return;
    const metrics = this.compareWorlds().sort((a, b) => b.objective - a.objective);
    const bestId  = metrics[0].id;
    const worstId = metrics[metrics.length - 1].id;

    this.transplantParameters(bestId, worstId);

    // Reset worst world's graph with new parameters
    const worstHakari = this.getHakari(worstId);
    const worstEntry  = this._worlds.get(worstId);
    if (worstHakari) {
      GLOBAL_RNG.seed(worstEntry.meta.seed + this._masterTick);
      worstHakari.reset();
    }
  }

  // ── ENSEMBLE PREDICTION ──────────────────────

  /**
   * Average predictions across all worlds.
   * More robust than single-world prediction.
   *
   * @param {number} horizon
   * @returns {object} { metric: { mean, std, min, max } }
   */
  ensemblePrediction(horizon = 10) {
    const allPreds = [];
    for (const { hakari } of this._worlds.values()) {
      if (hakari.predictiveMemory) {
        allPreds.push(hakari.predictiveMemory.predictAll(horizon));
      }
    }
    if (allPreds.length === 0) return {};

    const KEYS = ['entropy', 'collapseRate', 'objective', 'avgStrength'];
    const result = {};

    for (const key of KEYS) {
      const vals = allPreds.map(p => p[key]?.predicted ?? 0);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      result[key] = {
        mean,
        std,
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    return result;
  }

  // ── CLEAR ────────────────────────────────────

  destroyAll() {
    for (const [id] of this._worlds) this.destroyWorld(id);
  }

  // ── DIAGNOSTICS ──────────────────────────────

  getState() {
    return {
      worldCount:  this._worlds.size,
      masterTick:  this._masterTick,
      worlds:      [...this._worlds.values()].map(e => ({
        id:    e.id,
        label: e.meta.label,
        ticks: e.meta.tickCount,
        paused: e.meta.paused,
      })),
    };
  }
}



