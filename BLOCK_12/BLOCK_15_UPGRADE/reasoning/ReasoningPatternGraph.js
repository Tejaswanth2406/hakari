/**
 * HAKARI v3 — reasoning/ReasoningPatternGraph.js
 * ─────────────────────────────────────────────
 * Meta-reasoning layer. HAKARI's second graph.
 *
 * Graph 1 = knowledge (nodes + edges = concepts)
 * Graph 2 = reasoning patterns (THIS MODULE)
 *
 * Learns reusable reasoning templates from
 * frequently traversed paths in the main graph.
 *
 * Example:
 *   "apple → fruit → plant → ecosystem"
 *   "banana → fruit → plant → ecosystem"
 *                ↓
 *   Pattern: object → category → biological_class → ecosystem
 *
 * Over time HAKARI recognises these patterns
 * instantly without full graph traversal.
 *
 * Architecture:
 *   Pattern = { roles[], edges[], usageCount, strength }
 *   PatternGraph = Map<patternId, Pattern>
 *
 * Lifecycle:
 *   1. Path recording    — every query logs top-K paths
 *   2. Pattern extraction — abstract roles from paths
 *   3. Matching          — try known patterns before search
 *   4. Reinforcement     — successful matches boost strength
 *   5. Decay             — unused patterns weaken + prune
 *
 * Performance:
 *   - Pattern match O(P × L) where P = patterns, L = path len
 *   - P kept small (max 200 patterns)
 *   - Always faster than full graph traversal
 * ─────────────────────────────────────────────
 */

const MAX_PATTERNS        = 200;
const MIN_PATH_LENGTH     = 2;
const MAX_PATH_LENGTH     = 6;
const PATTERN_DECAY_RATE  = 0.002;   // per tick
const PRUNE_THRESHOLD     = 0.05;    // remove if strength < this
const REINFORCE_DELTA     = 0.08;    // strength boost on match hit
const MIN_USAGE_TO_KEEP   = 2;       // min uses before permanent
const PATTERN_DECAY_EVERY = 30;      // ticks between decay passes

export class ReasoningPatternGraph {

  constructor() {
    // Map<patternId, Pattern>
    this._patterns = new Map();
    this._counter  = 0;

    this.totalRecorded    = 0;
    this.totalMatches     = 0;
    this.totalExtracted   = 0;
    this._tickCount       = 0;

    // Recently recorded raw paths (before extraction)
    this._pathBuffer = [];   // Array<Path>
    this._bufferMax  = 50;
  }

  // ── PATH RECORDING ───────────────────────────

  /**
   * Record a reasoning path from a query.
   * Called by Hakari.js or LLMConnector after
   * retrieval traversal.
   *
   * @param {string[]} nodePath   — ordered array of node ids
   * @param {object[]} nodeLabels — id → label map or array
   * @param {number}   quality    — path quality (0–1)
   */
  recordPath(nodePath, nodeLabels, quality = 0.5) {
    if (!nodePath || nodePath.length < MIN_PATH_LENGTH) return;
    if (nodePath.length > MAX_PATH_LENGTH) return;

    const path = {
      nodes:   nodePath,
      labels:  nodeLabels,
      quality,
      tick:    this._tickCount,
    };

    this._pathBuffer.push(path);
    if (this._pathBuffer.length > this._bufferMax) {
      this._pathBuffer.shift();
    }

    this.totalRecorded++;

    // Auto-extract when buffer has enough paths
    if (this._pathBuffer.length >= 5) {
      this._extractPatterns();
    }
  }

  /**
   * Record a path from a retrieval result set.
   * Convenience method for LLMConnector.
   *
   * @param {Array<{node}>} results — RetrievalEngine results
   */
  recordRetrievalPath(results) {
    const path   = results.map(r => r.node?.id   ?? '?');
    const labels = results.map(r => r.node?.label ?? r.node?.id ?? '?');
    const q      = results[0]?.probability ?? 0.5;
    this.recordPath(path, labels, q);
  }

  // ── TICK ─────────────────────────────────────

  /**
   * Decay unused patterns.
   * Called every tick by Hakari.js.
   */
  tick() {
    this._tickCount++;
    if (this._tickCount % PATTERN_DECAY_EVERY !== 0) return;
    this._decayAndPrune();
  }

  // ── PATTERN MATCHING ─────────────────────────

  /**
   * Attempt to match a set of candidate node ids
   * against stored patterns.
   *
   * @param {string[]} nodeIds — current active/retrieved nodes
   * @returns {PatternMatch|null} best match, or null
   */
  matchPattern(nodeIds) {
    if (this._patterns.size === 0 || !nodeIds?.length) return null;

    let bestMatch  = null;
    let bestScore  = 0;

    for (const [id, pattern] of this._patterns) {
      const score = this._matchScore(nodeIds, pattern);
      if (score > bestScore && score > 0.4) {
        bestScore = score;
        bestMatch = { patternId: id, pattern, score };
      }
    }

    if (bestMatch) {
      // Reinforce on match
      bestMatch.pattern.usageCount++;
      bestMatch.pattern.strength = Math.min(
        1.0,
        bestMatch.pattern.strength + REINFORCE_DELTA
      );
      this.totalMatches++;
    }

    return bestMatch;
  }

  /**
   * Try matching BEFORE running a full retrieval.
   * Returns cached result if pattern strongly matches.
   *
   * @param {string} queryText
   * @param {Node[]} activeNodes  — currently activated nodes
   * @returns {{ hit: boolean, pattern: Pattern|null, confidence: number }}
   */
  tryFastPath(queryText, activeNodes) {
    if (!activeNodes?.length) return { hit: false, pattern: null, confidence: 0 };

    const ids   = activeNodes.map(n => n.id);
    const match = this.matchPattern(ids);

    if (!match) return { hit: false, pattern: null, confidence: 0 };

    return {
      hit:        match.score > 0.7,
      pattern:    match.pattern,
      confidence: match.score,
    };
  }

  // ── READ ─────────────────────────────────────

  /**
   * All patterns sorted by strength.
   * @returns {Array<{id, pattern}>}
   */
  topPatterns(n = 10) {
    return [...this._patterns.entries()]
      .sort((a, b) => b[1].strength - a[1].strength)
      .slice(0, n)
      .map(([id, pattern]) => ({ id, pattern }));
  }

  /**
   * Human-readable summary of top patterns.
   * @returns {string[]}
   */
  patternSummaries() {
    return this.topPatterns(10).map(({ pattern }) =>
      `[${pattern.strength.toFixed(2)}×${pattern.usageCount}] ` +
      pattern.roles.join(' → ')
    );
  }

  get patternCount() { return this._patterns.size; }

  // ── CLEAR ────────────────────────────────────

  clear() {
    this._patterns.clear();
    this._pathBuffer = [];
    this._counter    = 0;
    this.totalRecorded = 0;
    this.totalMatches  = 0;
    this.totalExtracted = 0;
    this._tickCount  = 0;
  }

  // ── DIAGNOSTICS ──────────────────────────────

  getState() {
    return {
      patternCount:   this.patternCount,
      totalRecorded:  this.totalRecorded,
      totalMatches:   this.totalMatches,
      totalExtracted: this.totalExtracted,
      topStrength:    [...this._patterns.values()]
        .reduce((m, p) => Math.max(m, p.strength), 0),
    };
  }

  // ── PRIVATE — PATTERN EXTRACTION ─────────────

  /**
   * Extract abstract patterns from path buffer.
   * Groups similar paths, builds role templates.
   */
  _extractPatterns() {
    if (this._pathBuffer.length < 2) return;

    // Group paths by length
    const byLength = new Map();
    for (const path of this._pathBuffer) {
      const L = path.nodes.length;
      if (!byLength.has(L)) byLength.set(L, []);
      byLength.get(L).push(path);
    }

    for (const [len, paths] of byLength) {
      if (paths.length < 2) continue;
      this._extractFromGroup(paths);
    }

    // Clear buffer after extraction
    this._pathBuffer = [];
  }

  /**
   * From a group of same-length paths, extract
   * role-abstract patterns.
   *
   * @param {object[]} paths
   */
  _extractFromGroup(paths) {
    // Use first path as template, check overlap with others
    const template = paths[0];
    const len      = template.nodes.length;

    // Role assignment by position
    const roles = template.labels.map((label, i) =>
      this._assignRole(label, i, len)
    );

    const quality = paths.reduce((s, p) => s + p.quality, 0) / paths.length;

    // Check if this pattern already exists (similarity match)
    for (const [, existing] of this._patterns) {
      if (existing.roles.length === len) {
        const overlap = roles.filter((r, i) => r === existing.roles[i]).length;
        if (overlap / len > 0.6) {
          // Reinforce existing pattern
          existing.usageCount++;
          existing.strength = Math.min(1, existing.strength + 0.05);
          return;
        }
      }
    }

    // Create new pattern
    const id = `P${++this._counter}`;
    this._patterns.set(id, {
      id,
      roles,
      length:      len,
      usageCount:  paths.length,
      strength:    quality,
      createdTick: this._tickCount,
      lastUsed:    this._tickCount,
    });
    this.totalExtracted++;

    // Prune oldest/weakest if over limit
    if (this._patterns.size > MAX_PATTERNS) {
      this._pruneWeakest();
    }
  }

  /**
   * Assign a semantic role to a node label by position
   * and simple lexical heuristics.
   *
   * @param {string} label
   * @param {number} position  — 0 = start of path
   * @param {number} pathLen
   * @returns {string} role token
   */
  _assignRole(label, position, pathLen) {
    if (!label || label === '?') return `pos_${position}`;

    const l = label.toLowerCase();

    // Positional roles
    if (position === 0)          return 'source';
    if (position === pathLen - 1) return 'target';

    // Lexical heuristics
    if (l.includes('categor') || l.includes('type') || l.includes('class'))
      return 'category';
    if (l.includes('system') || l.includes('network') || l.includes('ecosystem'))
      return 'system';
    if (l.includes('process') || l.includes('function') || l.includes('behavior'))
      return 'process';
    if (l.includes('property') || l.includes('attribute') || l.includes('feature'))
      return 'property';

    // Default: generalise by path position
    return `node_${position}`;
  }

  /**
   * Score how well nodeIds match a pattern.
   * Simple overlap: checks whether pattern length
   * and node count approximately align.
   *
   * @param {string[]} nodeIds
   * @param {Pattern} pattern
   * @returns {number} 0–1 match score
   */
  _matchScore(nodeIds, pattern) {
    if (nodeIds.length === 0) return 0;
    // Path-length similarity
    const lenDiff = Math.abs(nodeIds.length - pattern.length) / pattern.length;
    const lenScore = Math.max(0, 1 - lenDiff);
    // Weight by pattern strength and usage
    return lenScore * pattern.strength * Math.min(1, pattern.usageCount / 5);
  }

  // ── PRIVATE — LIFECYCLE ──────────────────────

  _decayAndPrune() {
    for (const [id, pattern] of this._patterns) {
      // Decay unused patterns
      const ticksSinceUse = this._tickCount - (pattern.lastUsed ?? 0);
      if (ticksSinceUse > 100) {
        pattern.strength -= PATTERN_DECAY_RATE * (ticksSinceUse / 100);
      }

      // Prune if too weak (but protect heavily-used patterns)
      if (pattern.strength < PRUNE_THRESHOLD &&
          pattern.usageCount < MIN_USAGE_TO_KEEP) {
        this._patterns.delete(id);
      }
    }
  }

  _pruneWeakest() {
    const sorted = [...this._patterns.entries()]
      .sort((a, b) => a[1].strength - b[1].strength);
    const toRemove = sorted.slice(0, this._patterns.size - MAX_PATTERNS);
    for (const [id] of toRemove) this._patterns.delete(id);
  }
}