/**
 * HAKARI v3 — config.js
 * ─────────────────────────────────────────────
 * System-level configuration.
 * Controls capacity, timing, retrieval, rendering,
 * and snapshot behaviour.
 * Separate from constants.js — these are structural
 * settings, not equation parameters.
 *
 * BLOCK 1 INTEGRATION — added:
 *   - EXPERIMENT config (seed, reproducibility)
 *   - BELIEF config (node belief state dimensions)
 *   - DECISION_ENGINE config (action space, planning)
 * ─────────────────────────────────────────────
 */

// ── NODE CAPACITY ─────────────────────────────
export const NODES = {
  MAX:              1500,   // hard cap on alive nodes
  INITIAL_SPAWN:    40,     // nodes created on boot
  SPAWN_BATCH:      10,     // nodes added per manual spawn
  EMBEDDING_DIM:    128,    // dimension of embedding vectors
};

// ── NETWORK TOPOLOGY ──────────────────────────
export const NETWORK = {
  EDGES_PER_NODE_TARGET: 15,     // ideal edges per node
  EDGES_PER_NODE_MAX:    null,   // null = auto (√N, computed at runtime)
  CONNECTION_RADIUS:     150,    // canvas px — max distance for auto-edge
  WEIGHT_INIT_MIN:       0.1,
  WEIGHT_INIT_MAX:       0.9,
};

// ── TIMING ────────────────────────────────────
export const TIMING = {
  TICK_RATE:    30,      // target ticks per second
  DT_MAX:       0.1,     // cap on dt to prevent spiral if tab is backgrounded
  DT_MIN:       0.001,   // minimum dt
};

// ── MEMORY & SNAPSHOTS ────────────────────────
export const MEMORY = {
  SNAPSHOT_EVERY_N_TICKS: 10,    // how often MemoryStore captures state
  SNAPSHOT_RING_SIZE:     500,   // max snapshots kept (ring buffer)
  COLLAPSE_LOG_MAX:       2000,  // max collapse events stored
};

// ── RETRIEVAL (RAG) ───────────────────────────
export const RETRIEVAL = {
  TOP_K:             12,     // nodes returned per query
  MIN_ACTIVATION:    0.01,   // ignore nodes below this activation score
  SIMILARITY_FLOOR:  0.0,    // cosine similarity floor (-1 to 1)
};

// ── VISUALIZATION ─────────────────────────────
export const VIZ = {
  NODE_RADIUS_MIN:   4,
  NODE_RADIUS_MAX:   16,          // radius = NODE_RADIUS_MIN + H * (MAX - MIN)
  EDGE_ALPHA_MAX:    0.35,        // max edge opacity
  EDGE_STRENGTH_MIN: 0.05,        // skip edges below this mutual strength
  GLOW_SCALE:        2.5,         // glow radius = node_radius * GLOW_SCALE
  COLOR: {
    STABLE:   'hsl(210, 90%, 60%)',   // blue  — low decay
    ACTIVE:   'hsl(50,  95%, 60%)',   // yellow — high activation
    DECAYING: 'hsl(0,   90%, 60%)',   // red   — high decay / low strength
    EDGE:     '0, 229, 255',          // RGB string for rgba() construction
  },
};

// ── DIAGNOSTICS ───────────────────────────────
export const DIAGNOSTICS = {
  CURVE_BUFFER_SIZE: 300,   // ticks of history kept per metric
  ENABLED:           true,
};

// ── METAOPTIMIZER ─────────────────────────────
export const OPTIMIZER = {
  GRADIENT_DELTA:   0.001,   // finite difference step for numerical gradient
  UPDATE_EVERY_N:   30,      // run MetaOptimizer every N ticks (= 1 sec at 30Hz)
};

// ── EXPERIMENT REPRODUCIBILITY ────────────────
// Controls determinism for research runs.
export const EXPERIMENT = {
  SEED:             42,      // global RNG seed. null = use Math.random (non-deterministic)
  DETERMINISTIC:    false,   // if true, seed RNG on boot with SEED
  LOG_SEEDS:        true,    // if true, log current seed in diagnostics
  REPLAY_ENABLED:   false,   // if true, log all stochastic samples for replay
};

// ── BELIEF STATE CONFIG ───────────────────────
// Governs probabilistic belief dimensions per node.
export const BELIEF = {
  HYPOTHESIS_DIM:   8,       // number of hypotheses per node belief state
  INIT_UNIFORM:     true,    // initialize beliefs as uniform prior
  ENTROPY_TRACK:    true,    // track belief entropy per node in diagnostics
  UPDATE_EVERY_N:   5,       // update Bayesian beliefs every N ticks
};

// ── DECISION ENGINE CONFIG ────────────────────
// Controls the action / planning layer.
export const DECISION_ENGINE = {
  ACTION_DIM:        4,      // number of available actions per node
  PLANNING_HORIZON:  3,      // look-ahead steps for multi-step planning
  SOFTMAX_SELECT:    true,   // if true, softmax sampling; if false, argmax
  REGRET_LOG_SIZE:   200,    // rolling window for cumulative regret tracking
};