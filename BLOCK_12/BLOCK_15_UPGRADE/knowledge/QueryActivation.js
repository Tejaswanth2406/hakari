/**
 * HAKARI v3 — QueryActivation (optimized)
 */

import { isFiniteNum } from '../../../BLOCK1/numerics.js'
import { PARAMS } from '../core/constants.js'
import { RETRIEVAL, DIAGNOSTICS } from '../core/config.js'

export class QueryActivation {

  constructor(){

    this.queryVector = null
    this.queryText = ''

    this.isActive = false
    this.maxActivation = 0
    this.activatedCount = 0

    const size = DIAGNOSTICS.CURVE_BUFFER_SIZE

    this._history = new Float64Array(size)
    this._historyIndex = 0
    this._historyCount = 0
  }

  /* ---------- QUERY ---------- */

  setQuery(vector,text=''){

    this.queryVector = vector
    this.queryText = text
    this.isActive = true
  }

  clearQuery(){

    this.queryVector = null
    this.queryText = ''
    this.isActive = false
    this.maxActivation = 0
    this.activatedCount = 0
  }

  /* ---------- UPDATE ---------- */

  update(nodes,embeddingStore,params){

    const N = nodes.length

    if(!this.isActive || !this.queryVector){

      for(let i=0;i<N;i++)
        nodes[i].activationScore = 0

      this.maxActivation = 0
      this.activatedCount = 0
      this._record(0)

      return
    }

    const tau =
      isFiniteNum(params?.tau)
      ? params.tau
      : PARAMS.tau

    const floor = RETRIEVAL.MIN_ACTIVATION

    const q = this.queryVector

    let maxA = 0
    let count = 0

    for(let i=0;i<N;i++){

      const node = nodes[i]

      if(!node.alive){
        node.activationScore = 0
        continue
      }

      const H =
        isFiniteNum(node.strength)
        ? node.strength
        : 0

      const v = embeddingStore.get(node.id)

      const sim = this._cosine(q,v)

      let A = tau * H * sim

      if(!isFiniteNum(A))
        A = 0

      if(A < floor)
        A = 0

      node.activationScore = A

      if(A > maxA) maxA = A
      if(A > 0) count++
    }

    this.maxActivation = maxA
    this.activatedCount = count

    this._record(count)
  }

  /* ---------- COSINE ---------- */

  _cosine(a,b){

    let dot=0
    let na=0
    let nb=0

    const n = a.length

    for(let i=0;i<n;i++){

      const av = a[i]
      const bv = b[i]

      dot += av*bv
      na += av*av
      nb += bv*bv
    }

    const denom = Math.sqrt(na*nb)

    return denom>1e-12 ? dot/denom : 0
  }

  /* ---------- HISTORY ---------- */

  _record(v){

    const size = this._history.length

    this._history[this._historyIndex] = v

    this._historyIndex =
      (this._historyIndex + 1) % size

    if(this._historyCount < size)
      this._historyCount++
  }

  getHistory(){

    const out = []
    const size = this._history.length

    for(let i=0;i<this._historyCount;i++){

      const idx =
        (this._historyIndex - this._historyCount + i + size) % size

      out.push(this._history[idx])
    }

    return out
  }

  getState(){

    return {
      isActive: this.isActive,
      queryText: this.queryText,
      maxActivation: this.maxActivation,
      activatedCount: this.activatedCount
    }
  }
}