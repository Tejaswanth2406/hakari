/**
 * HAKARI v3 — llm/KnowledgeSynthesizer.js (Advanced)
 * ---------------------------------------------
 * Converts LLM responses into structured knowledge nodes.
 * Adds de-duplication, batch embedding, strength scaling, and diagnostics.
 * ---------------------------------------------
 */

import { cosineSimilarity } from '../BLOCK1/math.js';
import { isFiniteNum }      from '../BLOCK1/numerics.js';

const DEFAULT_MAX_SENTENCES = 12;   
const DEFAULT_DEDUP_THRESHOLD = 0.92;
const BASE_STRENGTH = 0.45;
const POSITION_DECAY = 0.04;

export class KnowledgeSynthesizer {

  /**
   * @param {Embedder} embedder
   * @param {NodeFactory} nodeFactory
   * @param {object} [opts]
   */
  constructor(embedder, nodeFactory, opts = {}) {
    this.embedder    = embedder;
    this.nodeFactory = nodeFactory;

    this.maxSentences   = opts.maxSentences ?? DEFAULT_MAX_SENTENCES;
    this.dedupThreshold = opts.dedupThreshold ?? DEFAULT_DEDUP_THRESHOLD;

    this.totalSynthesized = 0;
    this.totalSkipped     = 0;
    this._batchLogs       = [];
  }

  /**
   * Convert LLM response into field nodes.
   * @param {string} text
   * @param {Node[]} [existingNodes] — for de-duplication
   * @returns {Promise<Node[]>} newly created nodes
   */
  async synthesize(text, existingNodes = []) {
    if (!text || typeof text !== 'string') return [];

    const sentences = this._splitSentences(text).slice(0, this.maxSentences);
    if (sentences.length === 0) return [];

    // Batch embed all sentences
    const embeddings = await this.embedder.embedBatch(sentences);
    if (!embeddings || embeddings.length === 0) return [];

    const existingVecs = existingNodes
      .filter(n => n.embedding)
      .map(n => Array.from(n.embedding));

    const newNodes = [];
    const batchLog = { synthesized: 0, skipped: 0 };

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const vec      = embeddings[i];

      if (!vec || vec.length === 0) continue;
      const vecArr = Array.from(vec);

      if (this._isDuplicate(vecArr, existingVecs)) {
        this.totalSkipped++;
        batchLog.skipped++;
        continue;
      }

      const strength = Math.max(0.2, BASE_STRENGTH - i * POSITION_DECAY);

      const node = this.nodeFactory.fromEmbedding(sentence, vecArr, {
        strength,
        source: 'llm'
      });

      newNodes.push(node);
      existingVecs.push(vecArr);
      this.totalSynthesized++;
      batchLog.synthesized++;
    }

    this._batchLogs.push(batchLog);
    if (this._batchLogs.length > 50) this._batchLogs.shift(); // keep recent logs

    return newNodes;
  }

  _splitSentences(text) {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 8);
  }

  _isDuplicate(vec, existingVecs) {
    for (const existing of existingVecs) {
      const sim = cosineSimilarity(vec, existing);
      if (isFiniteNum(sim) && sim >= this.dedupThreshold) return true;
    }
    return false;
  }

  getState() {
    return {
      totalSynthesized: this.totalSynthesized,
      totalSkipped:     this.totalSkipped,
      recentBatches:    [...this._batchLogs]
    };
  }
}
