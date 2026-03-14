/**
 * HAKARI v3 — llm/Embedder.js
 * ------------------------------------------------
 * Converts text → normalized embedding vector.
 *
 * Modes:
 *   1. API mode   — calls embedding endpoint
 *   2. Local mode — deterministic hash fallback
 *
 * Output: Float32Array[EMBEDDING_DIM]
 */

import { NODES } from '../core/config.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'

const DIM = NODES.EMBEDDING_DIM

export class Embedder {

  constructor(opts={}){

    this.apiKey = opts.apiKey ?? null
    this.apiUrl = opts.apiUrl ?? 'https://api.openai.com/v1/embeddings'
    this.model  = opts.model  ?? 'text-embedding-3-small'

    this.mode =
      opts.mode ??
      (this.apiKey ? 'api' : 'local')

    this.maxCacheSize = opts.maxCacheSize ?? 2000

    this.embedCount = 0
    this.errorCount = 0

    this._cache = new Map()
  }

  /* ------------------------------------ */
  /* EMBED SINGLE                         */
  /* ------------------------------------ */

  async embed(text){

    if(!text || text.trim()==='')
      return this._zeroVec()

    const key = text.trim().toLowerCase()

    const cached = this._cacheGet(key)

    if(cached)
      return cached

    let vec

    try{

      if(this.mode==='api')
        vec = await this._apiEmbed(text)
      else
        vec = this._localEmbed(text)

    }catch(err){

      console.warn(
        `[Embedder] embedding failed:`,
        err.message
      )

      this.errorCount++

      vec = this._localEmbed(text)
    }

    const normed =
      this._normalise(
        this._alignDim(vec)
      )

    this._cacheSet(key,normed)

    this.embedCount++

    return normed
  }

  /* ------------------------------------ */
  /* EMBED BATCH                          */
  /* ------------------------------------ */

  async embedBatch(texts){

    if(!Array.isArray(texts))
      return []

    if(this.mode!=='api')
      return texts.map(t =>
        this._normalise(
          this._alignDim(
            this._localEmbed(t)
          )
        )
      )

    try{

      const response = await fetch(
        this.apiUrl,
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Authorization':`Bearer ${this.apiKey}`
          },
          body:JSON.stringify({
            model:this.model,
            input:texts
          })
        }
      )

      if(!response.ok)
        throw new Error(
          `API error ${response.status}`
        )

      const data = await response.json()

      const out = new Array(texts.length)

      for(let i=0;i<data.data.length;i++){

        const raw =
          data.data[i].embedding ?? []

        out[i] =
          this._normalise(
            this._alignDim(raw)
          )
      }

      return out

    }catch(err){

      console.warn(
        `[Embedder] batch failed`,
        err.message
      )

      this.errorCount++

      return texts.map(t =>
        this._normalise(
          this._alignDim(
            this._localEmbed(t)
          )
        )
      )
    }
  }

  /* ------------------------------------ */
  /* API EMBEDDING                        */
  /* ------------------------------------ */

  async _apiEmbed(text){

    const response = await fetch(
      this.apiUrl,
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${this.apiKey}`
        },
        body:JSON.stringify({
          model:this.model,
          input:text
        })
      }
    )

    if(!response.ok)
      throw new Error(
        `API error ${response.status}`
      )

    const data = await response.json()

    const raw =
      data?.data?.[0]?.embedding ??
      data?.embedding ??
      null

    if(!raw)
      throw new Error(
        'no embedding in response'
      )

    const clean = new Array(raw.length)

    for(let i=0;i<raw.length;i++){

      const v = raw[i]

      clean[i] =
        isFiniteNum(v) ? v : 0
    }

    return clean
  }

  /* ------------------------------------ */
  /* LOCAL FALLBACK                       */
  /* ------------------------------------ */

  _localEmbed(text){

    const out = new Float32Array(DIM)

    let hash = 2166136261

    const str =
      text.trim().toLowerCase()

    for(let i=0;i<str.length;i++){

      hash ^= str.charCodeAt(i)

      hash *= 16777619

      const idx =
        Math.abs(hash) % DIM

      out[idx] += 1
    }

    return out
  }

  /* ------------------------------------ */
  /* VECTOR HELPERS                       */
  /* ------------------------------------ */

  _normalise(vec){

    let norm = 0

    const n = vec.length

    for(let i=0;i<n;i++)
      norm += vec[i]*vec[i]

    norm = Math.sqrt(norm)

    const out =
      new Float32Array(n)

    if(norm<1e-12)
      return out

    const inv = 1/norm

    for(let i=0;i<n;i++)
      out[i] = vec[i]*inv

    return out
  }

  _alignDim(vec){

    const out =
      new Float32Array(DIM)

    const n =
      Math.min(vec.length,DIM)

    for(let i=0;i<n;i++)
      out[i]=vec[i]

    return out
  }

  _zeroVec(){

    return new Float32Array(DIM)
  }

  /* ------------------------------------ */
  /* LRU CACHE                            */
  /* ------------------------------------ */

  _cacheGet(key){

    if(!this._cache.has(key))
      return null

    const val =
      this._cache.get(key)

    this._cache.delete(key)

    this._cache.set(key,val)

    return val
  }

  _cacheSet(key,val){

    if(this._cache.size>=this.maxCacheSize){

      const first =
        this._cache.keys().next().value

      this._cache.delete(first)
    }

    this._cache.set(key,val)
  }

  /* ------------------------------------ */
  /* DIAGNOSTICS                          */
  /* ------------------------------------ */

  getState(){

    return {
      mode:this.mode,
      embedCount:this.embedCount,
      errorCount:this.errorCount,
      cacheSize:this._cache.size
    }
  }
}