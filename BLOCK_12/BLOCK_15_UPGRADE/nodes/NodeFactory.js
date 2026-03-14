/**
 * HAKARI v3 — Advanced NodeFactory
 * --------------------------------
 * High-performance node creation engine.
 *
 * Features
 * • deterministic RNG support
 * • spatial clustering
 * • semantic spawning
 * • adaptive strength
 * • node pooling
 * • exploration vs exploitation policies
 */

import { Node } from './Node.js'
import { PARAMS, PHYSICS } from '../core/constants.js'
import { NODES } from '../core/config.js'
import { clamp } from '../../../BLOCK1/math.js'
import { sampleUniform } from '../../../BLOCK1/random.js'

export class NodeFactory {

  constructor(opts = {}) {

    this.canvasW = opts.canvasW ?? 800
    this.canvasH = opts.canvasH ?? 500

    this._rng = opts.rng ?? sampleUniform
    this._physics = opts.physicsEngine ?? null

    this.pool = []
    this.spawnPolicy = "balanced"

  }

  setPhysicsEngine(engine) {
    this._physics = engine
  }

  setSpawnPolicy(policy) {
    this.spawnPolicy = policy
  }

  setCanvasSize(w, h) {
    this.canvasW = w
    this.canvasH = h
  }

  /* ===============================
     NODE CREATION CORE
  =============================== */

  _createNode(opts) {

    let node

    if (this.pool.length > 0) {
      node = this.pool.pop()
      Object.assign(node, new Node(opts))
    } else {
      node = new Node(opts)
    }

    if (this._physics)
      this._physics.initNode(node)

    return node
  }

  recycle(node) {
    node.alive = false
    this.pool.push(node)
  }

  /* ===============================
     BASIC SPAWN
  =============================== */

  random(overrides = {}) {

    return this._createNode({

      x: this._randX(),
      y: this._randY(),
      vx: this._randVelocity(),
      vy: this._randVelocity(),

      strength: this._adaptiveStrength(),
      lambda: this._randLambda(),

      source: 'manual',
      ...overrides

    })
  }

  fromLabel(label, overrides = {}) {

    return this._createNode({

      label,
      source: 'llm',

      x: this._randX(),
      y: this._randY(),

      vx: this._randVelocity(),
      vy: this._randVelocity(),

      strength: this._adaptiveStrength(0.4, 0.8),
      lambda: this._randLambda(),

      ...overrides

    })
  }

  fromEmbedding(label, embedding, overrides = {}) {

    return this._createNode({

      label,
      embedding: Node._toFloat32(embedding, NODES.EMBEDDING_DIM),
      source: 'rag',

      x: this._randX(),
      y: this._randY(),

      vx: this._randVelocity(),
      vy: this._randVelocity(),

      strength: this._adaptiveStrength(0.5, 0.9),
      lambda: this._randLambda(),

      ...overrides

    })
  }

  /* ===============================
     SEMANTIC SPAWN
  =============================== */

  nearNode(referenceNode, overrides = {}) {

    const radius = 40

    return this._createNode({

      x: referenceNode.x + (this._rng() - 0.5) * radius,
      y: referenceNode.y + (this._rng() - 0.5) * radius,

      vx: this._randVelocity(),
      vy: this._randVelocity(),

      strength: this._adaptiveStrength(),
      lambda: this._randLambda(),

      source: "semantic",

      ...overrides
    })
  }

  /* ===============================
     CLUSTER SPAWN
  =============================== */

  cluster(centerX, centerY, count) {

    const nodes = []

    for (let i = 0; i < count; i++) {

      nodes.push(this._createNode({

        x: centerX + (this._rng() - 0.5) * 80,
        y: centerY + (this._rng() - 0.5) * 80,

        vx: this._randVelocity(),
        vy: this._randVelocity(),

        strength: this._adaptiveStrength(),
        lambda: this._randLambda(),

        source: "cluster"

      }))

    }

    return nodes
  }

  /* ===============================
     MEMORY RESTORE
  =============================== */

  fromMemory(snapshot) {

    const embedding = snapshot.embedding
      ? Node._toFloat32(snapshot.embedding, NODES.EMBEDDING_DIM)
      : null

    const node = this._createNode({

      id: snapshot.id,
      label: snapshot.label,
      source: 'memory',

      createdAt: snapshot.createdAt,

      x: snapshot.x ?? this._randX(),
      y: snapshot.y ?? this._randY(),

      strength: snapshot.strength ?? 0.3,
      lambda: snapshot.adaptiveLambda ?? PARAMS.lambda0,

      uncertainty: snapshot.uncertainty ?? 0.5,

      memoryTrace: snapshot.memoryTrace ?? 0,

      embedding

    })

    node.activationCount = snapshot.activationCount ?? 0
    node.lastActivatedAt = snapshot.lastActivatedAt ?? 0
    node.connectivity = snapshot.connectivity ?? 0
    node.reinforcement = snapshot.reinforcement ?? 0
    node.attention = snapshot.attention ?? 0

    return node
  }

  /* ===============================
     MASS SPAWN
  =============================== */

  batch(count, existingCount = 0) {

    const allowed = Math.min(count, NODES.MAX - existingCount)

    const nodes = new Array(allowed)

    for (let i = 0; i < allowed; i++) {
      nodes[i] = this.random()
    }

    return nodes
  }

  /* ===============================
     SPAWN POLICIES
  =============================== */

  _adaptiveStrength(min = 0.3, max = 0.85) {

    if (this.spawnPolicy === "exploration") {
      max += 0.1
    }

    if (this.spawnPolicy === "exploitation") {
      min += 0.1
    }

    return clamp(
      min + this._rng() * (max - min),
      PHYSICS.H_MIN,
      PHYSICS.H_MAX
    )
  }

  /* ===============================
     RANDOM HELPERS
  =============================== */

  _randX() {
    const pad = 20
    return pad + this._rng() * (this.canvasW - pad * 2)
  }

  _randY() {
    const pad = 20
    return pad + this._rng() * (this.canvasH - pad * 2)
  }

  _randVelocity() {
    return (this._rng() - 0.5) * 0.4
  }

  _randLambda() {

    const base = PARAMS.lambda0
    const jitter = base * 0.5

    return clamp(
      base + (this._rng() - 0.5) * jitter,
      0.001,
      0.1
    )
  }

}