import { clamp } from '../../../BLOCK1/math.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'

export class Connectivity {

  constructor(){

    this.avgConnectivity = 0
    this.maxConnectivity = 0
    this.isolatedCount   = 0
  }

  /* -------------------------------------------- */
  /* UPDATE                                       */
  /* -------------------------------------------- */

  update(nodes,graph,nodeMap){

    const n = nodes.length

    if(n === 0){

      this.avgConnectivity = 0
      this.maxConnectivity = 0
      this.isolatedCount   = 0

      return
    }

    let maxRaw = 0
    let isolated = 0

    const raw = new Map()

    /* --- pass 1 compute raw connectivity --- */

    for(const node of nodes){

      const neighbors =
        graph.getNeighbors(node.id) ?? []

      const degree =
        neighbors.length

      if(degree === 0){

        raw.set(node.id,0)
        isolated++
        continue
      }

      let weightedSum = 0

      for(const edge of neighbors){

        const nbr =
          nodeMap.get(edge.id)

        if(!nbr || !nbr.alive)
          continue

        const w =
          isFiniteNum(edge.weight)
          ? edge.weight
          : 0

        const H =
          isFiniteNum(nbr.strength)
          ? nbr.strength
          : 0

        const contrib = w*H

        if(isFiniteNum(contrib))
          weightedSum += contrib
      }

      const value =
        weightedSum / degree

      raw.set(node.id,value)

      if(value > maxRaw)
        maxRaw = value
    }

    this.isolatedCount = isolated

    /* --- pass 2 normalize --- */

    let totalC = 0

    for(const node of nodes){

      const r =
        raw.get(node.id) ?? 0

      const C =
        maxRaw > 1e-9
        ? clamp(r/maxRaw,0,1)
        : 0

      node.connectivity = C
      totalC += C
    }

    this.avgConnectivity =
      totalC / n

    this.maxConnectivity =
      maxRaw > 1e-9 ? 1 : 0
  }

  /* -------------------------------------------- */
  /* CLUSTER DETECTION (BFS)                       */
  /* -------------------------------------------- */

  findClusters(nodes,graph){

    const visited = new Set()
    const clusters = []

    for(const node of nodes){

      if(visited.has(node.id))
        continue

      const cluster = []
      const queue = [node.id]

      let qIndex = 0

      visited.add(node.id)

      while(qIndex < queue.length){

        const current =
          queue[qIndex++]

        cluster.push(current)

        const neighbors =
          graph.getNeighbors(current) ?? []

        for(const e of neighbors){

          if(!visited.has(e.id)){

            visited.add(e.id)
            queue.push(e.id)
          }
        }
      }

      clusters.push(cluster)
    }

    clusters.sort(
      (a,b)=>b.length-a.length
    )

    return clusters
  }

  /* -------------------------------------------- */
  /* ANALYTICS                                     */
  /* -------------------------------------------- */

  topConnected(nodes,n=5){

    return [...nodes]
      .sort(
        (a,b)=>
          b.connectivity-a.connectivity
      )
      .slice(0,n)
  }

  isolatedNodes(nodes){

    return nodes.filter(
      n => n.connectivity < 1e-6
    )
  }

  /* -------------------------------------------- */
  /* DIAGNOSTICS                                   */
  /* -------------------------------------------- */

  getState(){

    return {

      avgConnectivity:this.avgConnectivity,
      maxConnectivity:this.maxConnectivity,
      isolatedCount:this.isolatedCount
    }
  }
}