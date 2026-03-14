/**
 * HAKARI v3 — Enterprise MetaLearningEngine
 */

import { PARAMS, PARAM_BOUNDS } from '../core/constants.js'
import { clamp } from '../../../BLOCK1/math.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'
import { sampleGaussian } from '../../../BLOCK1/random.js'
import { DIAGNOSTICS } from '../core/config.js'

const META_LEARNING_INTERVAL = 200
const POPULATION_SIZE = 12
const SURVIVORS_K = 4
const MUTATION_RATE = 0.08

const EVOLVABLE = [
  "alpha","beta","gamma",
  "epsilon","lambda0","kappa","sigma"
]

export class MetaLearningEngine {

  constructor(parameterField = {}, opts = {}) {

    this.parameterField = parameterField
    this._rng = opts.rng ?? Math.random

    this._interval = opts.interval ?? META_LEARNING_INTERVAL
    this._popSize = opts.popSize ?? POPULATION_SIZE

    this._tickCount = 0
    this._generation = 0

    this._prevNodeCount = 0

    this._bestFitness = -Infinity
    this._bestParams = { ...((parameterField && parameterField.current) ? parameterField.current : {}) }

    /* ring buffer fitness history */

    const size = DIAGNOSTICS.CURVE_BUFFER_SIZE
    this._fitnessHistory = new Float64Array(size)
    this._historyIndex = 0
    this._historyCount = 0

    /* population */

    this._population = new Array(this._popSize)
    this._initPopulation()
  }

  update(systemState){

    this._tickCount++

    if (this._tickCount % this._interval !== 0)
      return

    this._step(systemState)
  }

  /* evolution step */

  _step(state){

    this._generation++

    const pop = this._population
    const N = pop.length

    /* evaluate fitness */

    for(let i=0;i<N;i++){
      pop[i].fitness =
        this._evaluateFitness(pop[i].params,state)
    }

    /* sort descending */

    pop.sort((a,b)=>b.fitness-a.fitness)

    const best = pop[0]

    if(best.fitness > this._bestFitness){
      this._bestFitness = best.fitness
      this._bestParams = {...best.params}
    }

    this._recordFitness(best.fitness)

    /* survivors */

    const survivors = SURVIVORS_K

    /* generate children */

    for(let i=survivors;i<N;i++){

      const parent =
        pop[Math.floor(this._rng()*survivors)]

      const childParams =
        this._mutate(parent.params)

      pop[i] = {
        params: childParams,
        fitness: 0
      }
    }

    this.applyBestParams()
  }

  /* fitness */

  _evaluateFitness(params,state){

    const entropy =
      isFiniteNum(state.entropy)?state.entropy:0

    const collapseRate =
      isFiniteNum(state.collapseRate)?state.collapseRate:0

    const nodeCount =
      isFiniteNum(state.nodeCount)?state.nodeCount:0

    const ig =
      isFiniteNum(state.informationGain)?state.informationGain:0

    const goalSuccess =
      isFiniteNum(state.goalSuccessRate)?state.goalSuccessRate:0.5

    const growth =
      nodeCount>0
      ? Math.min(
          1,
          (nodeCount-this._prevNodeCount)/
          Math.max(nodeCount,1) + 0.5
        )
      :0.5

    this._prevNodeCount=nodeCount

    const f_sys =
        0.35*growth
      + 0.25*goalSuccess
      - 0.20*entropy
      - 0.20*collapseRate

    const current =
      this.parameterField.current

    let penalty=0
    let count=0

    for(let i=0;i<EVOLVABLE.length;i++){

      const k=EVOLVABLE[i]

      const bounds=PARAM_BOUNDS[k]

      if(!bounds) continue
      if(!isFiniteNum(params[k])) continue
      if(!isFiniteNum(current[k])) continue

      const range=bounds[1]-bounds[0]

      const dev=
        Math.abs(params[k]-current[k])/
        Math.max(range,1e-9)

      penalty+=dev
      count++
    }

    const f_params =
      count>0
      ? -(penalty/count)*0.3
      :0

    const f = f_sys + f_params

    return isFiniteNum(f)?f:0
  }

  /* mutation */

  _mutate(params){

    const child={...params}

    for(let i=0;i<EVOLVABLE.length;i++){

      const k=EVOLVABLE[i]

      const bounds=PARAM_BOUNDS[k]
      if(!bounds) continue

      const noise =
        sampleGaussian(0,MUTATION_RATE,this._rng)

      const v = child[k] + (isFiniteNum(noise)?noise:0)

      child[k] =
        clamp(v,bounds[0],bounds[1])
    }

    return child
  }

  /* init */

  _initPopulation(){

    for(let i=0;i<this._popSize;i++){

      const params={...PARAMS}

      if(i>0){

        for(let j=0;j<EVOLVABLE.length;j++){

          const k=EVOLVABLE[j]
          const bounds=PARAM_BOUNDS[k]

          if(!bounds) continue

          const noise=
            sampleGaussian(
              0,MUTATION_RATE*2,this._rng
            )

          params[k]=
            clamp(
              params[k]+(isFiniteNum(noise)?noise:0),
              bounds[0],bounds[1]
            )
        }
      }

      this._population[i]={
        params,
        fitness:0
      }
    }
  }

  /* history */

  _recordFitness(v){

    const size=this._fitnessHistory.length

    this._fitnessHistory[this._historyIndex]=v

    this._historyIndex=
      (this._historyIndex+1)%size

    if(this._historyCount<size)
      this._historyCount++
  }

  getFitnessHistory(){

    const out=[]
    const size=this._fitnessHistory.length

    for(let i=0;i<this._historyCount;i++){

      const idx=
        (this._historyIndex-this._historyCount+i+size)%size

      out.push(this._fitnessHistory[idx])
    }

    return out
  }

  getBestParams(){
    return {...this._bestParams}
  }

  applyBestParams(){

    const delta={}

    for(let i=0;i<EVOLVABLE.length;i++){

      const k=EVOLVABLE[i]

      const best=this._bestParams[k]
      const current=
        this.parameterField.current[k]

      if(!isFiniteNum(best)) continue

      delta[k]=best-(current??0)
    }

    this.parameterField.apply(delta)
  }

  getState(){

    return Object.freeze({
      generation:this._generation,
      bestFitness:this._bestFitness,
      bestParams:{...this._bestParams},
      popSize:this._population.length,
      interval:this._interval
    })
  }
}