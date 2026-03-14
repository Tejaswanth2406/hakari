/**
 * HAKARI v3 — memory/MemoryStore.js
 * ─────────────────────────────────────────────
 * Central memory manager. Coordinates all memory
 * subsystems. Maintains working memory buffer,
 * importance scoring, experience tracking, and
 * triggers compression when needed.
 *
 * Capacity: 5000 memories
 * Tick rate: ~30/sec
 * ─────────────────────────────────────────────
 */

export class MemoryStore {

  constructor(opts = {}) {
    this._maxSize        = opts.maxSize        ?? 5000;
    this._workingMax     = opts.workingMax     ?? 64;
    this._compressAt     = opts.compressAt     ?? 4500;

    // Primary store: id → memory object
    this._store          = new Map();

    // Working memory: recent high-importance memories (capped ring buffer)
    this._working        = [];

    // Experience tracker: type → { count, totalImportance, lastSeen }
    this._experience     = new Map();

    // Snapshot ring buffer for Hakari tick snapshots
    this._snapshots      = [];
    this._snapshotMax    = opts.snapshotMax ?? 300;

    // ID counter
    this._nextId         = 1;

    // Stats
    this._totalAdded     = 0;
    this._totalRemoved   = 0;
    this._compressionRuns = 0;
  }

  // ══════════════════════════════════════════════
  // CORE CRUD
  // ══════════════════════════════════════════════

  /**
   * Add a memory. Assigns id, scores importance,
   * updates working memory and experience tracker.
   * @param {object} mem  — partial memory object
   * @returns {object}    — complete stored memory
   */
  add(mem) {
    const id = mem.id ?? `m${this._nextId++}`;
    const now = Date.now();

    const full = {
      id,
      timestamp:  mem.timestamp  ?? now,
      type:       mem.type       ?? 'generic',
      data:       mem.data       ?? {},
      strength:   Math.max(0, Math.min(1, mem.strength   ?? 0.5)),
      importance: mem.importance ?? this._scoreImportance(mem),
      accessCount: 0,
      lastAccess:  now,
      createdAt:   now,
    };

    this._store.set(id, full);
    this._totalAdded++;

    // Update experience tracker
    this._trackExperience(full);

    // Update working memory
    this._updateWorking(full);

    // Trigger compression if near capacity
    if (this._store.size >= this._compressAt) {
      this._evictWeak();
    }

    return full;
  }

  get(id) {
    const mem = this._store.get(id);
    if (mem) {
      mem.accessCount++;
      mem.lastAccess = Date.now();
    }
    return mem ?? null;
  }

  remove(id) {
    const existed = this._store.delete(id);
    if (existed) this._totalRemoved++;
    this._working = this._working.filter(m => m.id !== id);
    return existed;
  }

  has(id) { return this._store.has(id); }
  size()  { return this._store.size; }

  getRecent(n = 20) {
    const arr = [...this._store.values()];
    return arr
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, n);
  }

  all() { return [...this._store.values()]; }

  updateStrength(id, value) {
    const mem = this._store.get(id);
    if (!mem) return false;
    mem.strength = Math.max(0, Math.min(1, value));
    if (mem.strength < 0.01) this.remove(id);
    return true;
  }

  clear() {
    this._store.clear();
    this._working    = [];
    this._experience = new Map();
    this._snapshots  = [];
    this._nextId     = 1;
    this._totalAdded = 0;
    this._totalRemoved = 0;
  }

  // ══════════════════════════════════════════════
  // SNAPSHOT API  (used by Hakari tick loop)
  // ══════════════════════════════════════════════

  /** Called every tick with the system state snapshot */
  tick(snapshot) {
    const snap = { ...snapshot, _ts: Date.now() };
    this._snapshots.push(snap);
    if (this._snapshots.length > this._snapshotMax) {
      this._snapshots.shift();
    }
  }

  latest()   { return this._snapshots[this._snapshots.length - 1] ?? null; }
  allSnaps() { return this._snapshots; }

  forceSnapshot(state) {
    this.tick(state);
  }

  // ══════════════════════════════════════════════
  // WORKING MEMORY
  // ══════════════════════════════════════════════

  workingMemory() { return [...this._working]; }

  _updateWorking(mem) {
    // Insert sorted by importance descending
    const idx = this._working.findIndex(m => m.importance < mem.importance);
    if (idx === -1) {
      if (this._working.length < this._workingMax) this._working.push(mem);
    } else {
      this._working.splice(idx, 0, mem);
      if (this._working.length > this._workingMax) this._working.pop();
    }
  }

  // ══════════════════════════════════════════════
  // IMPORTANCE SCORING
  // ══════════════════════════════════════════════

  _scoreImportance(mem) {
    let score = 0.3;  // base

    // Novelty: rare types score higher
    const exp = this._experience.get(mem.type);
    if (!exp || exp.count < 3)  score += 0.3;
    else if (exp.count < 10)    score += 0.15;

    // Recency bonus for high-strength memories
    if ((mem.strength ?? 0.5) > 0.7) score += 0.2;

    // Type-specific boosts
    const boosts = {
      collapse:       0.25,
      query:          0.20,
      entropySpike:   0.18,
      energyOverload: 0.22,
      objectiveJump:  0.20,
      boot:           0.15,
    };
    score += boosts[mem.type] ?? 0;

    return Math.min(1, score);
  }

  // ══════════════════════════════════════════════
  // EXPERIENCE TRACKER
  // ══════════════════════════════════════════════

  _trackExperience(mem) {
    const exp = this._experience.get(mem.type) ?? {
      count: 0, totalImportance: 0, lastSeen: 0,
    };
    exp.count++;
    exp.totalImportance += mem.importance;
    exp.lastSeen = mem.timestamp;
    this._experience.set(mem.type, exp);
  }

  experienceSummary() {
    const out = {};
    for (const [type, exp] of this._experience) {
      out[type] = {
        count:     exp.count,
        avgImp:    exp.totalImportance / exp.count,
        lastSeen:  exp.lastSeen,
      };
    }
    return out;
  }

  // ══════════════════════════════════════════════
  // EVICTION
  // ══════════════════════════════════════════════

  _evictWeak() {
    // Remove the weakest 10% of memories
    const target = Math.floor(this._store.size * 0.1);
    const sorted = [...this._store.values()]
      .sort((a, b) => (a.strength * a.importance) - (b.strength * b.importance));
    for (let i = 0; i < target; i++) {
      this.remove(sorted[i].id);
    }
  }

  // ══════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════

  getState() {
    return {
      size:             this._store.size,
      workingSize:      this._working.length,
      snapshotCount:    this._snapshots.length,
      totalAdded:       this._totalAdded,
      totalRemoved:     this._totalRemoved,
      compressionRuns:  this._compressionRuns,
      experienceTypes:  this._experience.size,
    };
  }
}