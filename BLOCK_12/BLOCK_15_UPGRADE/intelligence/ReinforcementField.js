/**
 * HAKARI v3 — ReinforcementField (enterprise optimized)
 */

import { DIAGNOSTICS } from "../core/config.js"
import { isFiniteNum } from "../../../BLOCK1/numerics.js"
import { clamp } from "../../../BLOCK1/math.js"

const REINFORCE_THRESHOLD = 0.1
const EDGE_REINFORCE_DELTA = 0.008
const MEMORY_KAPPA = 0.15

export class ReinforcementField {

  constructor(){

    this.avgReinforcement = 0
    this.activeEdges = 0

    const size = DIAGNOSTICS.CURVE_BUFFER_SIZE
    this._history = new Float64Array(size)
    this._historyIndex = 0
    this._historyCount = 0
  }

  update(nodes, graph, nodeMap){

    const N = nodes.length
    if(N===0) return

    let totalR = 0
    let edgesReinforced = 0

    for(let i=0;i<N;i++){

      const node = nodes[i]
      if(!node.alive) continue

      const neighbors = graph.getNeighbors(node.id)

      let sum = 0
      const nodeA =
        isFiniteNum(node.activationScore)
        ? node.activationScore
        : 0

      for(let j=0;j<neighbors.length;j++){

        const e = neighbors[j]
        const nbr = nodeMap.get(e.id)

        if(!nbr || !nbr.alive) continue

        const w =
          isFiniteNum(e.weight)
          ? e.weight
          : 0

        const A =
          isFiniteNum(nbr.activationScore)
          ? nbr.activationScore
          : 0

        sum += w * A

        /* Hebbian reinforcement */

        if(
          nodeA > REINFORCE_THRESHOLD &&
          A > REINFORCE_THRESHOLD
        ){
          graph.reinforceEdge(
            node.id,
            e.id,
            EDGE_REINFORCE_DELTA
          )
          edgesReinforced++
        }
      }

      /* base reinforcement */

      let R = Math.tanh(sum)

      /* memory coupling */

      const mem = node.memoryTrace

      if(isFiniteNum(mem) && mem>0){
        R = Math.tanh(R + MEMORY_KAPPA * mem)
      }

      /* UI reinforcement */

      const acc = node.reinforcementAcc

      if(isFiniteNum(acc) && acc>0){

        R = Math.tanh(R + acc)

        node.reinforcementAcc =
          Math.max(0, acc - 0.05)
      }

      if(!isFiniteNum(R)) R = 0

      node.reinforcement = R

      totalR += Math.abs(R)

      /* attention update */

      const target = Math.abs(R)

      node.attention =
        clamp(
          node.attention + 0.1*(target-node.attention),
          0,
          1
        )
    }

    this.avgReinforcement = totalR / N
    this.activeEdges = edgesReinforced

    this._record(this.avgReinforcement)
  }

  boost(nodes, amount = 0.3, ids = null){

    const idSet = ids ? new Set(ids) : null

    for(let i=0;i<nodes.length;i++){

      const node = nodes[i]

      if(!node.alive) continue
      if(idSet && !idSet.has(node.id)) continue

      node.boost(amount)
    }
  }

  recentAverage(window=30){

    if(this._historyCount===0)
      return 0

    let sum=0
    let count=0

    const size=this._history.length

    for(let i=0;i<window && i<this._historyCount;i++){

      const idx =
        (this._historyIndex - 1 - i + size) % size

      sum += this._history[idx]
      count++
    }

    return count ? sum/count : 0
  }

  getHistory(){

    const out=[]

    const size=this._history.length

    for(let i=0;i<this._historyCount;i++){

      const idx =
        (this._historyIndex - this._historyCount + i + size) % size

      out.push(this._history[idx])
    }

    return out
  }

  getState(){

    return {
      avgReinforcement: this.avgReinforcement,
      activeEdges: this.activeEdges
    }
  }

  _record(v){

    const size=this._history.length

    this._history[this._historyIndex]=v

    this._historyIndex =
      (this._historyIndex+1)%size

    if(this._historyCount<size)
      this._historyCount++
  }
}