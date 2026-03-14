/**
 * HAKARI v3 — memory/MemoryCompression.js
 * ─────────────────────────────────────────────
 * Reduces memory usage by detecting, clustering,
 * and merging redundant memories.
 *
 * Algorithm:
 *   1. Signature-based clustering (fast O(n))
 *   2. Within each cluster, merge to a single
 *      generalised representative memory
 *   3. Replace cluster members with the merged
 *      memory in MemoryStore
 *
 * Runs automatically when called each tick via
 * onNewSnapshot(). Full compression triggered
 * when snapshot buffer is large.
 * ─────────────────────────────────────────────
 */

export class MemoryCompression {

  constructor(opts = {}) {
    this._minClusterSize = opts.minClusterSize ?? 5;
    this._runEvery       = opts.runEvery       ?? 100; // ticks between full runs
    this._tickCount      = 0;
    this._totalMerged    = 0;
    this._totalRuns      = 0;

    // Cluster registry: signature → { count, merged }
    this._clusters       = new Map();
  }

  // ══════════════════════════════════════════════
  // TICK HOOK  — called by Hakari every tick
  // ══════════════════════════════════════════════

  onNewSnapshot(snapshots, temporalIndex) {
    if (!snapshots?.length) return;
    this._tickCount++;

    // Light pass: track signature of latest snapshot
    const latest = snapshots[snapshots.length - 1];
    if (latest) this._trackSignature(latest);

    // Full compression run every N ticks
    if (this._tickCount % this._runEvery === 0) {
      this._fullCompress(snapshots);
    }
  }

  // ══════════════════════════════════════════════
  // FULL COMPRESSION
  // ══════════════════════════════════════════════

  compress(memoryStore) {
    if (!memoryStore) return 0;
    const all      = memoryStore.all();
    const clusters = this.clusterSimilarMemories(all);
    let merged     = 0;

    for (const cluster of clusters) {
      if (cluster.length < this._minClusterSize) continue;
      const representative = this.mergeCluster(cluster);
      // Remove all cluster members except first
      for (let i = 1; i < cluster.length; i++) {
        memoryStore.remove(cluster[i].id);
      }
      // Update first with merged data
      memoryStore.updateStrength(cluster[0].id, representative.strength);
      merged += cluster.length - 1;
      this._totalMerged += cluster.length - 1;
    }

    this._totalRuns++;
    return merged;
  }

  // ══════════════════════════════════════════════
  // CLUSTERING  — signature-based O(n)
  // ══════════════════════════════════════════════

  clusterSimilarMemories(memories = []) {
    const buckets = new Map();
    for (const mem of memories) {
      const sig = this._memSignature(mem);
      if (!buckets.has(sig)) buckets.set(sig, []);
      buckets.get(sig).push(mem);
    }
    return [...buckets.values()].filter(c => c.length >= 2);
  }

  // ══════════════════════════════════════════════
  // MERGE  — combine a cluster into one memory
  // ══════════════════════════════════════════════

  mergeCluster(cluster) {
    if (!cluster.length) return null;

    // Average numeric fields
    const avgStrength   = cluster.reduce((s, m) => s + (m.strength   ?? 0.5), 0) / cluster.length;
    const avgImportance = cluster.reduce((s, m) => s + (m.importance ?? 0.5), 0) / cluster.length;
    const latestTs      = Math.max(...cluster.map(m => m.timestamp ?? 0));

    return {
      id:          cluster[0].id,
      type:        cluster[0].type,
      timestamp:   latestTs,
      strength:    Math.min(1, avgStrength * 1.1),  // slight boost for recurring
      importance:  Math.min(1, avgImportance * 1.05),
      mergedFrom:  cluster.length,
      data:        this._mergeData(cluster),
    };
  }

  // ══════════════════════════════════════════════
  // SNAPSHOT COMPRESSION  — deduplicate snapshots
  // ══════════════════════════════════════════════

  _fullCompress(snapshots) {
    if (snapshots.length < 50) return;

    const buckets = new Map();
    for (const snap of snapshots) {
      const sig = this._snapSignature(snap);
      if (!buckets.has(sig)) buckets.set(sig, []);
      buckets.get(sig).push(snap);
    }

    let removed = 0;
    for (const cluster of buckets.values()) {
      if (cluster.length >= 4) {
        // Keep first and last, remove middle redundant entries
        removed += cluster.length - 2;
      }
    }
  }

  _trackSignature(snapshot) {
    const sig = this._snapSignature(snapshot);
    const entry = this._clusters.get(sig) ?? { count: 0, merged: false };
    entry.count++;
    this._clusters.set(sig, entry);
  }

  // ══════════════════════════════════════════════
  // SIGNATURES  — fast fuzzy bucketing
  // ══════════════════════════════════════════════

  _memSignature(mem) {
    const type = mem.type ?? 'unknown';
    const str  = Math.round((mem.strength   ?? 0.5) * 4) / 4;
    const imp  = Math.round((mem.importance ?? 0.5) * 4) / 4;
    return `${type}|${str}|${imp}`;
  }

  _snapSignature(snap) {
    const S   = Math.round((snap.entropy      ?? 0) * 4) / 4;
    const cr  = Math.round((snap.collapseRate ?? 0));
    const str = Math.round((snap.avgStrength  ?? 0) * 4) / 4;
    return `S${S}|cr${cr}|str${str}`;
  }

  _mergeData(cluster) {
    // Merge numeric fields by averaging
    const data = {};
    const keys = new Set(cluster.flatMap(m => Object.keys(m.data ?? {})));
    for (const key of keys) {
      const vals = cluster.map(m => m.data?.[key]).filter(v => typeof v === 'number');
      if (vals.length) data[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return data;
  }

  getState() {
    return {
      compressed:    this._totalMerged,
      runs:          this._totalRuns,
      clusters:      this._clusters.size,
      tickCount:     this._tickCount,
    };
  }
}