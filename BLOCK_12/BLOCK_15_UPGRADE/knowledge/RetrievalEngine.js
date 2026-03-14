/**
 * HAKARI v3 â€” knowledge/RetrievalEngine.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Field-weighted knowledge retrieval.
 * Called by LLMConnector when a query needs context.
 *
 * Retrieval pipeline:
 *   1. Collect Aáµ¢ from all nodes
 *   2. Apply softmax: Páµ¢ = e^Aáµ¢ / Î£ e^Aâ±¼
 *   3. Optional: rerank by belief confidence
 *   4. Return top-K sorted by Páµ¢
 *
 * Unlike classic RAG (pure vector search), retrieval
 * is weighted by semantic similarity AND node strength.
 *
 * BLOCK 8 HARDENING vs original:
 *   - NaN guard before softmax
 *   - Belief-confidence reranking (optional)
 *   - topByStrength uses node.utilityScore as tiebreak
 *   - retrieveWithDecay() boosts recently activated nodes
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { softmax }    from '../../../BLOCK1/math.js';
import { isFiniteNum } from '../../../BLOCK1/numerics.js';
import { clamp }      from '../../../BLOCK1/math.js';
import { RETRIEVAL }  from '../core/config.js';

export class RetrievalEngine {

  /**
   * @param {object}  [opts]
   * @param {boolean} opts.enableBeliefRerank â€” weight by beliefConfidence (default true)
   * @param {number}  opts.beliefRerankWeight  â€” how strongly belief shifts rank (default 0.2)
   */
  constructor(opts = {}) {
    this._enableBeliefRerank  = opts.enableBeliefRerank ?? true;
    this._beliefReRankWeight  = opts.beliefReRankWeight ?? 0.2;

    this.lastResults  = [];
    this.lastQuery    = '';
    this.queryCount   = 0;
  }

  // â”€â”€ RETRIEVE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Retrieve top-K nodes for the current query.
   *
   * @param {Node[]} nodes
   * @param {number} [k]
   * @returns {RetrievalResult[]}
   */
  retrieve(nodes, k = RETRIEVAL.TOP_K) {
    const floor = RETRIEVAL.MIN_ACTIVATION;

    const candidates = nodes.filter(
      n => n.alive && isFiniteNum(n.activationScore) && n.activationScore > floor
    );

    if (candidates.length === 0) { this.lastResults = []; return []; }

    // Safe activations (no NaN/Inf)
    const activations = candidates.map(n =>
      isFiniteNum(n.activationScore) ? n.activationScore : 0
    );
    const probs = softmax(activations);

    let results = candidates.map((node, i) => ({
      node,
      activation:  activations[i],
      probability: probs[i],
      rank:        0,
    }));

    // Belief-confidence reranking (Hakari)
    if (this._enableBeliefRerank) {
      results = results.map(r => {
        const B = isFiniteNum(r.node.beliefConfidence) ? r.node.beliefConfidence : 0;
        return {
          ...r,
          probability: clamp(r.probability + this._beliefReRankWeight * B, 0, 1),
        };
      });
    }

    results.sort((a, b) => b.probability - a.probability);

    const topK = results.slice(0, k).map((r, i) => ({ ...r, rank: i + 1 }));
    this.lastResults = topK;
    this.queryCount++;
    return topK;
  }

  /**
   * Summary format for ContextBuilder.
   * @param {Node[]} nodes
   * @param {number} [k]
   */
  retrieveSummary(nodes, k = RETRIEVAL.TOP_K) {
    return this.retrieve(nodes, k).map(r => ({
      label:       r.node.label || r.node.id,
      strength:    r.node.strength,
      probability: r.probability,
      rank:        r.rank,
    }));
  }

  /**
   * Fallback: top-K by raw strength (no active query).
   * @param {Node[]} nodes
   * @param {number} [k]
   * @returns {Node[]}
   */
  topByStrength(nodes, k = RETRIEVAL.TOP_K) {
    return [...nodes]
      .filter(n => n.alive)
      .sort((a, b) => {
        const sA = isFiniteNum(a.strength) ? a.strength : 0;
        const sB = isFiniteNum(b.strength) ? b.strength : 0;
        if (Math.abs(sB - sA) > 0.001) return sB - sA;
        // Tiebreak: utility score
        const uA = isFiniteNum(a.utilityScore) ? a.utilityScore : 0;
        const uB = isFiniteNum(b.utilityScore) ? b.utilityScore : 0;
        return uB - uA;
      })
      .slice(0, k);
  }

  // â”€â”€ DIAGNOSTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getState() {
    return {
      lastResultCount: this.lastResults.length,
      lastQuery:       this.lastQuery,
      queryCount:      this.queryCount,
      topLabel:        this.lastResults[0]?.node?.label ?? 'â€”',
      topProbability:  this.lastResults[0]?.probability ?? 0,
    };
  }
}

