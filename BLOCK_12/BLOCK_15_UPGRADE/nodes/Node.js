/**
 * HAKARI v3 — nodes/Node.js
 * ------------------------------------------------------------
 * Defines a single knowledge node in the HAKARI field.
 *
 * A node represents a memory / concept / embedding particle.
 *
 * Node contains ONLY state + lifecycle.
 * No physics calculations or rendering.
 */

import { PARAMS } from '../core/constants.js'
import { NODES, BELIEF } from '../core/config.js'

let _idCounter = 0

export class Node {

  constructor(opts = {}) {

    /* ---------------------------------------------------- */
    /* IDENTITY                                             */
    /* ---------------------------------------------------- */

    this.id        = opts.id ?? `node_${++_idCounter}`
    this.label     = opts.label ?? ''
    this.source    = opts.source ?? 'manual'
    this.createdAt = opts.createdAt ?? Date.now()

    /* ---------------------------------------------------- */
    /* POSITION (visualization / physics)                   */
    /* ---------------------------------------------------- */

    this.x  = opts.x ?? 0
    this.y  = opts.y ?? 0
    this.vx = opts.vx ?? 0
    this.vy = opts.vy ?? 0

    /* ---------------------------------------------------- */
    /* PHYSICS STATE                                        */
    /* ---------------------------------------------------- */

    this.strength       = opts.strength ?? 0.5
    this.energy         = 0
    this.lambda         = opts.lambda ?? PARAMS.lambda0
    this.adaptiveLambda = this.lambda
    this.errorRate      = opts.errorRate ?? 0

    this.connectivity   = 0
    this.infoInput      = 0

    /* ---------------------------------------------------- */
    /* REINFORCEMENT                                        */
    /* ---------------------------------------------------- */

    this.reinforcement    = 0
    this.reinforcementAcc = 0

    /* ---------------------------------------------------- */
    /* SEMANTIC STATE                                       */
    /* ---------------------------------------------------- */

    this.embedding = opts.embedding
      ? Node._toFloat32(opts.embedding, NODES.EMBEDDING_DIM)
      : null

    this.activationScore = 0

    /* ---------------------------------------------------- */
    /* LEARNING STATE                                       */
    /* ---------------------------------------------------- */

    this.uncertainty = opts.uncertainty ?? 0.5
    this.attention   = 0

    /* ---------------------------------------------------- */
    /* MEMORY STATE                                         */
    /* ---------------------------------------------------- */

    this.memoryTrace     = opts.memoryTrace ?? 0
    this.activationCount = opts.activationCount ?? 0
    this.lastActivatedAt = opts.lastActivatedAt ?? 0

    /* ---------------------------------------------------- */
    /* BELIEF STATE                                         */
    /* ---------------------------------------------------- */

    this.belief          = null
    this.logBelief       = null
    this.beliefEntropy   = Math.log(BELIEF.HYPOTHESIS_DIM)
    this.beliefConfident = false
    this.expectedInfoGain = 0

    /* ---------------------------------------------------- */
    /* HISTORY BUFFER                                       */
    /* ---------------------------------------------------- */

    this.HISTORY_SIZE = 10

    this.strengthHistory = new Float32Array(this.HISTORY_SIZE)

    this._historyIdx  = 0
    this._historyFull = false

    /* ---------------------------------------------------- */
    /* LIFECYCLE                                            */
    /* ---------------------------------------------------- */

    this.alive           = true
    this.pendingCollapse = false

    this.age      = 0
    this.ageTicks = 0

    this.collapseAt = null
    this.collapseBy = null
  }

  /* ---------------------------------------------------- */
  /* TICK UPDATE                                          */
  /* ---------------------------------------------------- */

  tick(dt) {

    this.age      += dt
    this.ageTicks += 1

    this._recordHistory(this.strength)

    /* memory trace decay */

    const decay = 0.05 * dt
    this.memoryTrace *= (1 - decay)

    if (this.memoryTrace < 1e-6) {
      this.memoryTrace = 0
    }

    /* attention decay */

    this.attention *= (1 - 0.02 * dt)
  }

  /* ---------------------------------------------------- */
  /* ACTIVATION                                           */
  /* ---------------------------------------------------- */

  recordActivation(tick, score = 1) {

    this.activationCount++
    this.lastActivatedAt = tick

    this.memoryTrace = Math.min(
      1,
      this.memoryTrace + score * 0.2
    )

    this.attention = Math.min(
      1,
      this.attention + score * 0.15
    )
  }

  /* ---------------------------------------------------- */
  /* MANUAL BOOST                                         */
  /* ---------------------------------------------------- */

  boost(amount = 0.2) {
    this.reinforcementAcc += amount
  }

  /* ---------------------------------------------------- */
  /* STRENGTH ANALYSIS                                    */
  /* ---------------------------------------------------- */

  averageStrength() {

    const count = this._historyFull
      ? this.HISTORY_SIZE
      : this._historyIdx

    if (count === 0) return this.strength

    let sum = 0

    for (let i = 0; i < count; i++) {
      sum += this.strengthHistory[i]
    }

    return sum / count
  }

  strengthTrend() {

    const count = this._historyFull
      ? this.HISTORY_SIZE
      : this._historyIdx

    if (count < 2) return 0

    const half = Math.floor(count / 2)

    let early = 0
    let late  = 0

    for (let i = 0; i < half; i++) {
      early += this.strengthHistory[i]
    }

    for (let i = half; i < count; i++) {
      late += this.strengthHistory[i]
    }

    return (late / (count - half)) - (early / half)
  }

  /* ---------------------------------------------------- */
  /* COLLAPSE                                             */
  /* ---------------------------------------------------- */

  collapse(cause = 'decay') {

    this.alive = false

    this.strength = 0

    this.pendingCollapse = false

    this.collapseAt = Date.now()
    this.collapseBy = cause
  }

  /* ---------------------------------------------------- */
  /* SNAPSHOT                                             */
  /* ---------------------------------------------------- */

  snapshot() {

    return {
      id: this.id,
      label: this.label,
      source: this.source,
      createdAt: this.createdAt,

      strength: this.strength,
      adaptiveLambda: this.adaptiveLambda,

      connectivity: this.connectivity,
      reinforcement: this.reinforcement,

      activationScore: this.activationScore,

      uncertainty: this.uncertainty,
      attention: this.attention,

      memoryTrace: this.memoryTrace,
      activationCount: this.activationCount,
      lastActivatedAt: this.lastActivatedAt,

      age: this.age,
      ageTicks: this.ageTicks,

      alive: this.alive
    }
  }

  fullSnapshot() {

    return {
      ...this.snapshot(),

      embedding: this.embedding
        ? Array.from(this.embedding)
        : null,

      belief: this.belief
        ? Array.from(this.belief)
        : null,

      x: this.x,
      y: this.y
    }
  }

  /* ---------------------------------------------------- */
  /* BELIEF INIT                                          */
  /* ---------------------------------------------------- */

  initBelief() {

    const k = BELIEF.HYPOTHESIS_DIM

    this.belief    = new Float32Array(k)
    this.logBelief = new Float32Array(k)

    const p = 1 / k

    for (let i = 0; i < k; i++) {
      this.belief[i] = p
      this.logBelief[i] = Math.log(p)
    }

    this.beliefEntropy = Math.log(k)
  }

  /* ---------------------------------------------------- */
  /* PRIVATE                                              */
  /* ---------------------------------------------------- */

  _recordHistory(value) {

    this.strengthHistory[this._historyIdx] = value

    this._historyIdx = (this._historyIdx + 1) % this.HISTORY_SIZE

    if (this._historyIdx === 0) {
      this._historyFull = true
    }
  }

  /* ---------------------------------------------------- */
  /* STATIC UTILITIES                                     */
  /* ---------------------------------------------------- */

  static _toFloat32(src, dim) {

    const out = new Float32Array(dim)

    const len = Math.min(src.length, dim)

    for (let i = 0; i < len; i++) {
      out[i] = src[i]
    }

    return out
  }

  static resetIdCounter() {
    _idCounter = 0
  }

}