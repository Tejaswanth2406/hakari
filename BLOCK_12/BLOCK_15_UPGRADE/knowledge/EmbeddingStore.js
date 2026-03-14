import { isFiniteNum } from '../../../BLOCK1/numerics.js'
import { sampleNormalVector } from '../../../BLOCK1/random.js'
import { NODES } from '../core/config.js'

export class EmbeddingStore {

  constructor(opts = {}) {

    this._store = new Map()
    this.dim = NODES.EMBEDDING_DIM
    this._rng = opts.rng ?? Math.random
  }

  /* ---------- WRITE ---------- */

  set(nodeId, vector){

    if(!vector || vector.length===0){
      this.setRandom(nodeId)
      return
    }

    const aligned = this._alignDim(vector)
    const normed = this._normalise(aligned)

    this._store.set(nodeId, normed)
  }

  setRandom(nodeId){

    const vec = this._randomUnit()
    this._store.set(nodeId, vec)
  }

  setBatch(map){

    for(const [id,vec] of map)
      this.set(id,vec)
  }

  /* ---------- READ ---------- */

  get(nodeId){

    let v = this._store.get(nodeId)

    if(!v){
      v = this._randomUnit()
      this._store.set(nodeId,v)
    }

    return v
  }

  has(nodeId){
    return this._store.has(nodeId)
  }

  /* ---------- SIMILARITY ---------- */

  similarity(queryVec,nodeId){

    const q = this._alignDim(queryVec)
    const v = this.get(nodeId)

    return this._cosine(q,v)
  }

  rankByQuery(queryVec,nodeIds=null){

    const q = this._alignDim(queryVec)

    const ids = nodeIds ?? Array.from(this._store.keys())

    const results = new Array(ids.length)

    for(let i=0;i<ids.length;i++){

      const id = ids[i]
      const v = this.get(id)

      results[i] = {
        nodeId:id,
        similarity:this._cosine(q,v)
      }
    }

    results.sort((a,b)=>b.similarity-a.similarity)

    return results
  }

  /* ---------- CLEANUP ---------- */

  remove(nodeId){
    this._store.delete(nodeId)
  }

  removeBatch(ids){

    for(let i=0;i<ids.length;i++)
      this._store.delete(ids[i])
  }

  clear(){
    this._store.clear()
  }

  /* ---------- DIAGNOSTICS ---------- */

  get size(){
    return this._store.size
  }

  getState(){

    return {
      storedVectors:this._store.size,
      dimension:this.dim
    }
  }

  /* ---------- INTERNAL ---------- */

  _cosine(a,b){

    let dot=0
    let na=0
    let nb=0

    const n = this.dim

    for(let i=0;i<n;i++){

      const av=a[i]
      const bv=b[i]

      dot += av*bv
      na += av*av
      nb += bv*bv
    }

    const denom = Math.sqrt(na*nb)

    return denom>1e-12 ? dot/denom : 0
  }

  _normalise(vec){

    let norm=0

    for(let i=0;i<vec.length;i++){

      const v=vec[i]

      if(isFiniteNum(v))
        norm += v*v
    }

    norm=Math.sqrt(norm)

    const out=new Float32Array(vec.length)

    if(norm<1e-12)
      return out

    for(let i=0;i<vec.length;i++){

      const v=vec[i]

      out[i] =
        isFiniteNum(v)
        ? v/norm
        : 0
    }

    return out
  }

  _randomUnit(){

    const arr =
      sampleNormalVector(this.dim,this._rng)

    return new Float32Array(arr)
  }

  _alignDim(vec){

    const out=new Float32Array(this.dim)

    const n=Math.min(vec.length,this.dim)

    for(let i=0;i<n;i++)
      out[i]=vec[i]

    return out
  }
}