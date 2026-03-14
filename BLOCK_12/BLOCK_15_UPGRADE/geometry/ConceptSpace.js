/**
 * HAKARI v3 — geometry/ConceptSpace.js
 * ─────────────────────────────────────────────
 * Conceptual Space Geometry (CSG)
 * Based on Gärdenfors' geometric theory of meaning.
 *
 * Embeds every node into a continuous semantic
 * vector space of dimension D (default 24).
 * Concepts close in vector space are semantically
 * similar, even without graph edges.
 *
 * Responsibilities:
 *   1. Vector initialisation (random unit vecs)
 *   2. Similarity learning — co-activation pulls
 *      vectors closer: vᵢ += α(vⱼ − vᵢ)
 *   3. Semantic distance — cosine + euclidean
 *   4. Cluster detection — lightweight k-means
 *   5. Hybrid reasoning — nearest semantic
 *      neighbours regardless of graph edges
 *   6. Stability — slow entropic drift toward
 *      space centroid prevents collapse
 *   7. Visualisation — PCA projection to 2D
 *
 * Performance:
 *   - Max 1500 nodes, D = 24
 *   - Update cost O(edges) per tick
 *   - Clustering O(N·K) every CLUSTER_EVERY ticks
 *   - PCA projection O(N·D²) on demand
 * ─────────────────────────────────────────────
 */

const DIM           = 24;     // vector dimension
const ALPHA_BASE    = 0.008;  // base pull rate per co-activation
const DRIFT_RATE    = 0.0002; // slow centroid drift for stability
const CLUSTER_EVERY = 60;     // ticks between k-means runs
const K_CLUSTERS    = 7;      // semantic cluster count
const MAX_KMEANS_ITER = 15;

export class ConceptSpace {

  constructor() {
    this.dim = DIM;

    // Map<nodeId, Float32Array(DIM)>
    this._vectors  = new Map();

    // Map<nodeId, Float32Array(DIM)> — velocity for smooth drift
    this._velocity = new Map();

    // Map<nodeId, clusterId:number>
    this._clusters = new Map();

    // Cluster centroids [K × DIM]
    this._centroids = [];

    this._tickCount    = 0;
    this._clustersDirty = true;
    this.totalUpdates  = 0;
  }

  // ── NODE REGISTRATION ────────────────────────

  /**
   * Register a new node with a vector.
   * Accepts existing embedding or generates random unit vec.
   *
   * @param {string}      nodeId
   * @param {number[]|Float32Array} [existingVec] — optional seed
   */
  register(nodeId, existingVec = null) {
    if (this._vectors.has(nodeId)) return;

    let vec;
    if (existingVec && existingVec.length > 0) {
      // Project/pad existing embedding to DIM
      vec = this._projectToDim(existingVec);
    } else {
      vec = this._randomUnit();
    }

    this._vectors.set(nodeId, vec);
    this._velocity.set(nodeId, new Float32Array(DIM));
    this._clustersDirty = true;
  }

  /**
   * Remove a node from concept space (on collapse).
   * @param {string} nodeId
   */
  remove(nodeId) {
    this._vectors.delete(nodeId);
    this._velocity.delete(nodeId);
    this._clusters.delete(nodeId);
    this._clustersDirty = true;
  }

  // ── TICK UPDATE ──────────────────────────────

  /**
   * Update semantic vectors based on co-activation.
   * Called every tick by Hakari.js.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @param {number}           dt
   */
  update(nodes, graph, nodeMap, dt) {
    this._tickCount++;
    const alpha = ALPHA_BASE * dt * 30;   // normalise to 30Hz

    // ── Co-activation pull ────────────────────
    // For every edge between two active nodes,
    // pull their vectors toward each other.
    for (const node of nodes) {
      if (!node.alive || node.activationScore < 0.05) continue;

      const vecI = this._vectors.get(node.id);
      if (!vecI) continue;

      const neighbors = graph.getNeighbors(node.id) ?? [];
      for (const { id: nId, weight } of neighbors) {
        const neighbor = nodeMap.get(nId);
        if (!neighbor?.alive) continue;
        if (neighbor.activationScore < 0.05) continue;

        const vecJ = this._vectors.get(nId);
        if (!vecJ) continue;

        // Pull strength: co-activation × edge weight
        const pull = alpha * weight
          * Math.min(node.activationScore, neighbor.activationScore);

        // vᵢ += pull × (vⱼ − vᵢ)
        for (let d = 0; d < DIM; d++) {
          vecI[d] += pull * (vecJ[d] - vecI[d]);
        }

        this.totalUpdates++;
      }

      // ── Centroid drift (stability) ────────────
      // Slow pull toward space centroid prevents
      // all vectors collapsing into one point.
      const centroid = this._spaceCentroid();
      for (let d = 0; d < DIM; d++) {
        vecI[d] += DRIFT_RATE * (centroid[d] - vecI[d]);
      }

      // Re-normalise to unit sphere after update
      this._normaliseInPlace(vecI);
    }

    // ── Cluster update ────────────────────────
    if (this._tickCount % CLUSTER_EVERY === 0) {
      this._runKMeans(nodes);
    }
  }

  // ── DISTANCE FUNCTIONS ───────────────────────

  /**
   * Cosine similarity between two node vectors.
   * @param {string} idA
   * @param {string} idB
   * @returns {number} ∈ [−1, 1]
   */
  cosineSimilarity(idA, idB) {
    const a = this._vectors.get(idA);
    const b = this._vectors.get(idB);
    if (!a || !b) return 0;
    return this._cosine(a, b);
  }

  /**
   * Euclidean distance between two node vectors.
   * @param {string} idA
   * @param {string} idB
   * @returns {number} ≥ 0
   */
  euclideanDistance(idA, idB) {
    const a = this._vectors.get(idA);
    const b = this._vectors.get(idB);
    if (!a || !b) return Infinity;
    let sum = 0;
    for (let d = 0; d < DIM; d++) sum += (a[d] - b[d]) ** 2;
    return Math.sqrt(sum);
  }

  // ── HYBRID RETRIEVAL ─────────────────────────

  /**
   * Find nearest semantic neighbours by vector proximity.
   * Does NOT require graph edges — pure geometry.
   *
   * @param {string}   nodeId
   * @param {Node[]}   allNodes
   * @param {number}   k         — result count
   * @returns {Array<{nodeId, similarity, clusterId}>}
   */
  nearestNeighbours(nodeId, allNodes, k = 8) {
    const vec = this._vectors.get(nodeId);
    if (!vec) return [];

    return allNodes
      .filter(n => n.alive && n.id !== nodeId && this._vectors.has(n.id))
      .map(n => ({
        nodeId:     n.id,
        label:      n.label,
        similarity: this._cosine(vec, this._vectors.get(n.id)),
        clusterId:  this._clusters.get(n.id) ?? -1,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  /**
   * Find nearest neighbours to a query vector
   * (e.g. from an LLM embedding). No graph needed.
   *
   * @param {number[]}  queryVec  — external embedding
   * @param {Node[]}    allNodes
   * @param {number}    k
   * @returns {Array<{nodeId, label, similarity}>}
   */
  nearestToQuery(queryVec, allNodes, k = 8) {
    const q = this._projectToDim(queryVec);
    this._normaliseInPlace(q);

    return allNodes
      .filter(n => n.alive && this._vectors.has(n.id))
      .map(n => ({
        nodeId:     n.id,
        label:      n.label,
        similarity: this._cosine(q, this._vectors.get(n.id)),
        clusterId:  this._clusters.get(n.id) ?? -1,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }

  // ── CLUSTER ACCESS ───────────────────────────

  /**
   * Cluster id for a given node.
   * @param {string} nodeId
   * @returns {number} cluster index, or -1 if unassigned
   */
  clusterOf(nodeId) {
    return this._clusters.get(nodeId) ?? -1;
  }

  /**
   * All nodes grouped by cluster.
   * @param {Node[]} allNodes
   * @returns {Map<number, Node[]>}
   */
  clusteredNodes(allNodes) {
    const groups = new Map();
    for (const node of allNodes) {
      const cid = this._clusters.get(node.id) ?? -1;
      if (!groups.has(cid)) groups.set(cid, []);
      groups.get(cid).push(node);
    }
    return groups;
  }

  /**
   * How many distinct clusters are active.
   * @returns {number}
   */
  get clusterCount() {
    return new Set(this._clusters.values()).size;
  }

  // ── PCA PROJECTION ───────────────────────────

  /**
   * Project all node vectors to 2D via PCA.
   * Used by NodeRenderer for semantic layout mode.
   *
   * Returns Map<nodeId, {x: number, y: number}>
   * Coordinates are in [−1, 1] normalised space.
   *
   * @param {Node[]} allNodes
   * @returns {Map<string, {x:number, y:number}>}
   */
  project2D(allNodes) {
    const ids   = allNodes.filter(n => this._vectors.has(n.id)).map(n => n.id);
    const N     = ids.length;
    if (N < 2) return new Map();

    // Build N×DIM matrix
    const X = ids.map(id => Array.from(this._vectors.get(id)));

    // Centre the data
    const mean = new Array(DIM).fill(0);
    for (const row of X) {
      for (let d = 0; d < DIM; d++) mean[d] += row[d] / N;
    }
    const Xc = X.map(row => row.map((v, d) => v - mean[d]));

    // Power iteration for top-2 principal components
    const pc1 = this._powerIterate(Xc, new Array(DIM).fill(0).map(() => Math.random() - 0.5), 20);
    // Deflate: remove pc1 component from data
    const Xd  = Xc.map(row => {
      const proj = row.reduce((s, v, d) => s + v * pc1[d], 0);
      return row.map((v, d) => v - proj * pc1[d]);
    });
    const pc2 = this._powerIterate(Xd, new Array(DIM).fill(0).map(() => Math.random() - 0.5), 20);

    // Project and normalise
    const coords  = Xc.map(row => ({
      x: row.reduce((s, v, d) => s + v * pc1[d], 0),
      y: row.reduce((s, v, d) => s + v * pc2[d], 0),
    }));

    const maxX = Math.max(...coords.map(c => Math.abs(c.x))) || 1;
    const maxY = Math.max(...coords.map(c => Math.abs(c.y))) || 1;

    const out = new Map();
    ids.forEach((id, i) => {
      out.set(id, { x: coords[i].x / maxX, y: coords[i].y / maxY });
    });
    return out;
  }

  // ── DIAGNOSTICS ──────────────────────────────

  get size() { return this._vectors.size; }

  getState() {
    return {
      dimension:     this.dim,
      nodeCount:     this._vectors.size,
      clusterCount:  this.clusterCount,
      totalUpdates:  this.totalUpdates,
    };
  }

  // ── PRIVATE — CLUSTERING ─────────────────────

  _runKMeans(nodes) {
    const alive = nodes.filter(n => n.alive && this._vectors.has(n.id));
    if (alive.length < K_CLUSTERS) return;

    // Initialise centroids from random existing vectors
    const shuffled  = [...alive].sort(() => Math.random() - 0.5);
    let centroids   = shuffled.slice(0, K_CLUSTERS).map(n =>
      Array.from(this._vectors.get(n.id))
    );

    let assignments = new Map();

    for (let iter = 0; iter < MAX_KMEANS_ITER; iter++) {
      // Assign each node to nearest centroid
      const newAssignments = new Map();
      for (const node of alive) {
        const vec = this._vectors.get(node.id);
        let bestK = 0, bestSim = -Infinity;
        for (let k = 0; k < K_CLUSTERS; k++) {
          const sim = this._cosineRaw(vec, centroids[k]);
          if (sim > bestSim) { bestSim = sim; bestK = k; }
        }
        newAssignments.set(node.id, bestK);
      }

      // Check convergence
      let changed = false;
      for (const [id, k] of newAssignments) {
        if (assignments.get(id) !== k) { changed = true; break; }
      }
      assignments = newAssignments;
      if (!changed) break;

      // Recompute centroids
      const sums    = Array.from({ length: K_CLUSTERS }, () => new Array(DIM).fill(0));
      const counts  = new Array(K_CLUSTERS).fill(0);
      for (const node of alive) {
        const k   = assignments.get(node.id);
        const vec = this._vectors.get(node.id);
        for (let d = 0; d < DIM; d++) sums[k][d] += vec[d];
        counts[k]++;
      }
      centroids = sums.map((s, k) => {
        const n = counts[k] || 1;
        const c = s.map(v => v / n);
        return this._normaliseArr(c);
      });
    }

    // Commit assignments
    for (const [id, k] of assignments) {
      this._clusters.set(id, k);
    }
    this._centroids = centroids;
    this._clustersDirty = false;
  }

  // ── PRIVATE — MATHS ──────────────────────────

  _randomUnit() {
    const vec = new Float32Array(DIM).map(() => Math.random() * 2 - 1);
    return this._normaliseFloat32(vec);
  }

  _normaliseFloat32(vec) {
    let norm = 0;
    for (let d = 0; d < DIM; d++) norm += vec[d] * vec[d];
    norm = Math.sqrt(norm);
    if (norm < 1e-9) return vec;
    for (let d = 0; d < DIM; d++) vec[d] /= norm;
    return vec;
  }

  _normaliseInPlace(vec) {
    let norm = 0;
    for (let d = 0; d < DIM; d++) norm += vec[d] * vec[d];
    norm = Math.sqrt(norm);
    if (norm < 1e-9) return;
    for (let d = 0; d < DIM; d++) vec[d] /= norm;
  }

  _normaliseArr(arr) {
    let norm = 0;
    for (const v of arr) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return arr.map(v => v / norm);
  }

  _cosine(a, b) {
    let dot = 0;
    for (let d = 0; d < DIM; d++) dot += a[d] * b[d];
    return Math.max(-1, Math.min(1, dot));   // vecs already unit-normed
  }

  _cosineRaw(a, b) {
    // b may be plain array (centroid), not normalised
    let dot = 0, na = 0, nb = 0;
    for (let d = 0; d < DIM; d++) {
      dot += a[d] * b[d];
      na  += a[d] * a[d];
      nb  += b[d] * b[d];
    }
    const denom = Math.sqrt(na * nb);
    return denom < 1e-9 ? 0 : dot / denom;
  }

  _projectToDim(vec) {
    const out = new Float32Array(DIM);
    for (let d = 0; d < DIM; d++) out[d] = vec[d] ?? 0;
    return out;
  }

  _spaceCentroid() {
    if (this._vectors.size === 0) return new Float32Array(DIM);
    const sum = new Float32Array(DIM);
    for (const vec of this._vectors.values()) {
      for (let d = 0; d < DIM; d++) sum[d] += vec[d];
    }
    const n = this._vectors.size;
    for (let d = 0; d < DIM; d++) sum[d] /= n;
    return sum;
  }

  _powerIterate(X, v, iterations) {
    let u = this._normaliseArr([...v]);
    for (let i = 0; i < iterations; i++) {
      // u = Xᵀ(Xu) / ‖Xᵀ(Xu)‖
      const Xu  = X.map(row => row.reduce((s, val, d) => s + val * u[d], 0));
      const XtXu = new Array(DIM).fill(0);
      for (let r = 0; r < X.length; r++) {
        for (let d = 0; d < DIM; d++) XtXu[d] += X[r][d] * Xu[r];
      }
      u = this._normaliseArr(XtXu);
    }
    return u;
  }
}