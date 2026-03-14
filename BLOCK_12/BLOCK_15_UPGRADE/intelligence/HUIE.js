/**
 * HAKARI v3 — Enterprise HUIE Engine
 */

import { huieDifferential } from '../../../BLOCK1/math.js'
import { PARAMS } from '../core/constants.js'
import { DIAGNOSTICS } from '../core/config.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'
import { stochasticNoise, sampleUniform } from '../../../BLOCK1/random.js'

export class HUIE {

  constructor(opts = {}) {

    this._rng = opts.rng ?? sampleUniform

    this._enableIG = opts.enableIG ?? true
    this._enableBelief = opts.enableBelief ?? true
    this._enableUtility = opts.enableUtility ?? true

    this._psi = opts.psi ?? 0.3
    this._theta = opts.theta ?? 0.25
    this._muUtil = opts.muUtil ?? 0.2

    this.avgDelta = 0
    this.maxDelta = 0

    /* ring buffer */

    const size = DIAGNOSTICS.CURVE_BUFFER_SIZE
    this._history = new Float64Array(size)
    this._historyIndex = 0
    this._historyCount = 0

    /* diagnostics */

    this.termAvg = {
      info:0, energy:0, entropy:0, decay:0,
      reinforce:0, ig:0, belief:0, utility:0,
      activation:0, noise:0
    }

    this._termAcc = {
      info:0, energy:0, entropy:0, decay:0,
      reinforce:0, ig:0, belief:0, utility:0,
      activation:0, noise:0
    }
  }

  update(nodes, S, energySrc, graph, nodeMap, params, dt) {

    const N = nodes.length
    if (N === 0) return

    const safeS = isFiniteNum(S) ? S : 0

    /* resolve energy function once */

    const energyFn =
      energySrc?.neighborEnergy
        ? energySrc.neighborEnergy.bind(energySrc)
        : null

    /* reset accumulators */

    const acc = this._termAcc
    for (const k in acc) acc[k] = 0

    let totalDelta = 0
    let maxDelta = 0

    for (let i=0;i<N;i++) {

      const node = nodes[i]
      if (!node.alive) continue

      const I = isFiniteNum(node.infoInput) ? node.infoInput : 0
      const lambda =
        isFiniteNum(node.adaptiveLambda)
          ? node.adaptiveLambda
          : (node.lambda ?? PARAMS.lambda0)

      const R = isFiniteNum(node.reinforcement) ? node.reinforcement : 0
      const A = isFiniteNum(node.activationScore) ? node.activationScore : 0
      const H = isFiniteNum(node.strength) ? node.strength : 0

      const E = energyFn
        ? energyFn(node.id, graph, nodeMap) || 0
        : 0

      const noise =
        stochasticNoise(params.sigma ?? PARAMS.sigma, dt, this._rng)

      /* optional cognition terms */

      let IG = 0
      if (this._enableIG && isFiniteNum(node.expectedInfoGain))
        IG = node.expectedInfoGain

      let B = 0
      if (this._enableBelief && isFiniteNum(node.beliefEntropy)) {

        const maxH = Math.log(8)
        B = 1 - Math.min(node.beliefEntropy / (maxH || 1),1)
      }

      let U = 0
      if (this._enableUtility && isFiniteNum(node.utilityScore))
        U = node.utilityScore

      const baseDH =
        huieDifferential(
          {I,E,S:safeS,lambda,H,R,noise,A,params},
          dt
        )

      const extDH =
          this._psi*IG*dt
        + this._theta*B*dt
        + this._muUtil*U*dt

      const dH = baseDH + extDH

      if (!isFiniteNum(dH)) continue

      node.strength += dH

      /* diagnostics accumulation */

      const p = params

      acc.info      += p.alpha * I * dt
      acc.energy    += p.beta * E * dt
      acc.entropy   += -p.gamma * safeS * dt
      acc.decay     += -lambda * H * dt
      acc.reinforce += p.kappa * R * dt
      acc.ig        += this._psi * IG * dt
      acc.belief    += this._theta * B * dt
      acc.utility   += this._muUtil * U * dt
      acc.activation+= p.phi * A * dt
      acc.noise     += noise

      const absDH = Math.abs(dH)

      totalDelta += absDH
      if (absDH > maxDelta) maxDelta = absDH
    }

    /* system metrics */

    this.avgDelta = totalDelta / N
    this.maxDelta = maxDelta

    for (const k in this.termAvg)
      this.termAvg[k] = acc[k] / N

    this._recordHistory(this.avgDelta)
  }

  /* history */

  _recordHistory(v) {

    const size = this._history.length

    this._history[this._historyIndex] = v

    this._historyIndex =
      (this._historyIndex + 1) % size

    if (this._historyCount < size)
      this._historyCount++
  }

  recentAvgDelta(window=30) {

    const w = Math.min(window,this._historyCount)
    if (w===0) return 0

    let sum=0
    const size=this._history.length

    for(let i=0;i<w;i++){

      const idx=
        (this._historyIndex-1-i+size)%size

      sum+=this._history[idx]
    }

    return sum/w
  }

  isStable(threshold=0.005){
    return this.avgDelta<threshold
  }

  getHistory(){

    const out=[]
    const size=this._history.length

    for(let i=0;i<this._historyCount;i++){

      const idx=
        (this._historyIndex-this._historyCount+i+size)%size

      out.push(this._history[idx])
    }

    return out
  }

  getState(){

    return Object.freeze({
      avgDelta:this.avgDelta,
      maxDelta:this.maxDelta,
      stable:this.isStable(),
      termAvg:{...this.termAvg}
    })
  }

}