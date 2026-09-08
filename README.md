<img width="1983" height="793" alt="image" src="https://github.com/user-attachments/assets/e5cbedae-5495-475b-aedc-67612faafe63" />


```
██╗  ██╗ █████╗ ██╗  ██╗ █████╗ ██████╗ ██╗
██║  ██║██╔══██╗██║ ██╔╝██╔══██╗██╔══██╗██║
███████║███████║█████╔╝ ███████║██████╔╝██║
██╔══██║██╔══██║██╔═██╗ ██╔══██║██╔══██╗██║
██║  ██║██║  ██║██║  ██╗██║  ██║██║  ██║██║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝
                                         v3
```

## 🧠 WHAT IS HAKARI?

HAKARI v3 is a **cognitive simulation engine** built on three interlocking subsystems running simultaneously inside a single tick-loop scheduler — every second the engine is alive.

## PROJECT SUMMARY

HAKARI is a JavaScript cognitive simulation engine for modeling knowledge
evolution, propagation, and decay through probabilistic and
information-theoretic concepts. Its Node.js REST API supports live retrieval
and modification of simulation state without restarting the application,
enabling API-driven data processing and system integration.

Unlike agent frameworks that orchestrate API calls, HAKARI's simulation state is **continuous and persistent**. The system doesn't reset between conversations — it remembers where it was, what entropy looked like, and how its learning curve evolved.

```
Tick → Physics Update → Entropy Δ → CSD Check → Cascade? → J Update → Diagnostics → Store + Log
```

---

## 🏛 THREE PILLARS

### `01` — PHYSICS LAYER
> Newtonian & Network Physics

Every node in HAKARI has **mass**, **velocity**, and **force interactions**. The tick-loop updates positions, computes network strength (`meanH`), and detects structural collapse in real time.

```
network_strength   FREEFALL vel=−0.007
collapse_cascade   6 nodes / tick
tick_loop          RUNNING
```

---

### `02` — INFORMATION LAYER
> Shannon Entropy & Tipping Points

HAKARI continuously measures **Shannon entropy** across its node graph. Entropy spikes signal critical state transitions. CSD detection via **AR1 autocorrelation** and **variance acceleration** identifies approaching collapse bifurcations.

```
entropy_spike      S = +2.840
tipping_point_risk 2 metrics flagged
csd_method         AR1 + VarAccel
```

---

### `03` — LEARNING LAYER
> Online Learning & Regression

HAKARI tracks its own **learning curve in real time**. The J-metric (cost function) is monitored tick-by-tick for regression, plateau, and convergence. The engine flags when learning is declining and auto-adjusts update rules.

```
J_rate             −0.02246 (declining)
regression_flag    ACTIVE
update_rule        ONLINE
```

---

## 🔌 CONSOLE API

HAKARI exposes a full live console API accessible from the browser devtools. Every function runs against the live simulation state — **no mocking, no static data**.

```javascript
window.__hakari                  // Master engine instance
window.__scheduler               // Tick-loop controller

__hakari.systemReport()          // Full snapshot as JSON
__hakari.query("text")           // LLM query with live state injected
__hakari.whyDidNodeDie(id)       // Causal trace to collapse event
__hakari.predictNext(10)         // 10-step lookahead simulation
__hakari.semanticMap()           // Live concept-space topology
__hakari.importantMoments()      // Key history extraction (7 events)
__hakari.downloadLog()           // Export full session as JSON
```

> **Shortcut:** `Ctrl+Shift+D` — export diagnostics snapshot

---

## 🔬 LIVE DIAGNOSTICS

### Physics Signals
```
✕  Collapse cascade: 6 nodes collapsed this tick
✕  Network collapse accelerating — vel=0.709
△  Strength freefall — meanH dropping fast (vel=−0.0072)
△  Strength freefall — meanH dropping fast (vel=−0.0122)
```

### Information Signals
```
△  Entropy spike +2.840 (S=2.840)
△  Tipping point risk — 2 metrics show CSD
✓  Semantic map: concept space topology computed
✓  importantMoments(): 7 key events logged
```

### Learning Signals
```
△  Learning regression — J declining (rate=−0.02246)
△  Learning regression — J declining (rate=−0.00525)
△  Learning regression — J declining (rate=−0.00259)
✓  Online update rule: adapting to regression
```

---

## 🧱 ARCHITECTURE — 10 BLOCKS, ONE ENGINE

```
┌─────────────────────────────────────────────────────────────┐
│                    HAKARI ENGINE CORE                       │
├───────────────────┬─────────────────────────────────────────┤
│  BLOCK 1          │  Mathematical Foundations               │
│                   │  Tensors · Distributions · Bayes        │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 2          │  Physics & Entropy Dynamics             │
│                   │  Force fields · Shannon entropy · Ticks │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 3          │  Node State Management                  │
│                   │  Birth · Decay · Death · Causal history │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 4          │  Network Evolution                      │
│                   │  Edge dynamics · Topology · Weakening   │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 5          │  Thermodynamics Layer                   │
│                   │  Heat diffusion · Phase transitions     │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 6          │  Intelligence & Decision                │
│                   │  Bayesian inference · predictNext(n)    │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 7          │  Evolutionary Mechanisms                │
│                   │  Genetic mutation · J-metric regression │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 8          │  Knowledge Diffusion & Memory           │
│                   │  Propagation · MongoDB integration      │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 9          │  Knowledge Synthesis                    │
│                   │  Concept formation · LLM context inject │
├───────────────────┼─────────────────────────────────────────┤
│  BLOCK 10         │  Runtime + Visualization                │
│                   │  __hakari · __scheduler · BLOCK_15_UPG  │
└───────────────────┴─────────────────────────────────────────┘
```

---

## 🛠 TECH STACK

```
Simulation Core  ──  JavaScript          ──  BLOCK1–9 + BLOCK_10
                     Tick Scheduler · Force Dynamics
                     Shannon Entropy · AR1 CSD
                     Bayesian Inference · Diagnostics.js

Python Engine     ──  Python             ──  python_engine/
                     Knowledge evolution · Propagation · Decay
                     Probabilistic state · Shannon entropy
                     Normalization · True-value estimation · RMSE

Rust Metrics      ──  Rust               ──  rust_engine/
                     Dependency-free numeric primitives
                     Normalization · True-value estimation · RMSE

Backend          ──  Node.js            ──  hakari-backend/server.js
                     Express · REST API · Live state endpoints
                     OpenAI GPT · .env secrets

Memory           ──  MongoDB            ──  BSON · Session Memory
                     Snapshots · importantMoments()

Frontend         ──  Vite.js            ──  index.html + vite.config.js
                     Controls.js · main.js
                     window.__hakari · window.__scheduler
                     window.__controls · BLOCK_15_UPGRADE
```

---

## 🚀 QUICK START

```bash
# Clone the repo
git clone https://github.com/Tejaswanth2406/hakari.git
cd hakari

# Install frontend dependencies
npm install

# Install backend dependencies
cd hakari-backend
npm install
cd ..

# Set backend environment variables
cp hakari-backend/.env.example hakari-backend/.env
# → Add the provider key and MongoDB URI to hakari-backend/.env

# Start the Node.js REST API
node hakari-backend/server.js

# Start the Vite frontend in a second terminal
npm run dev

# The engine is available at the Vite URL shown in the terminal
# Engine comes online. Tick-loop starts.
# Access via: window.__hakari in devtools
```

The live state API is available at `/api/state`:

```text
GET   /api/state       Retrieve the current simulation state
PATCH /api/state       Merge a state update without restarting
POST  /api/state/tick  Advance the API-managed simulation tick
```

### Python and Rust scientific metrics

JavaScript remains the live simulation runtime. The backend can also delegate
numeric evaluation to Python or Rust using one stable response shape:

```text
POST /api/metrics/python
POST /api/metrics/rust
```

Request body:

```json
{
    "predictions": [1, 3],
    "observations": [2, 5],
    "observation_weight": 0.7
}
```

Both adapters return min-max normalized series, an observation-weighted
`true_values` estimate, and root mean square error (`rmse`). Python is invoked
as a JSON-line module. Rust uses the built binary when available and otherwise
builds through Cargo.

```bash
python -m pytest python_engine/tests -q
cargo test --manifest-path rust_engine/Cargo.toml
```

---

## 🔮 NINE PILLARS

| # | Pillar | Description |
|---|--------|-------------|
| 01 | **Simulation** | Live physics tick-loop — mass, velocity, meanH per tick |
| 02 | **Entropy** | Shannon entropy S sampled every tick, spikes = regime change |
| 03 | **CSD** | AR1 + VarAccel tipping point detection before bifurcation |
| 04 | **Learning** | Multi-rate J-metric tracking, regression auto-detection |
| 05 | **Causality** | `whyDidNodeDie(id)` — full causal trace to collapse |
| 06 | **Semantic** | `semanticMap()` — live evolving concept-space topology |
| 07 | **Memory** | MongoDB + simulation-state-aware LLM context injection |
| 08 | **Export** | `downloadLog()` — full JSON export, fully reproducible |
| 09 | **Predict** | `predictNext(n)` — n-step entropy + collapse lookahead |

---

## 📂 PROJECT STRUCTURE

```
hakari/
├── main.js                   # Engine bootstrap · window.__hakari
├── BLOCK1.js                 # Mathematical foundations
├── BLOCK2.js                 # Physics & entropy dynamics
├── BLOCK3.js                 # Node state management
├── BLOCK4.js                 # Network evolution
├── BLOCK5.js                 # Thermodynamics layer
├── BLOCK6.js                 # Intelligence & decision
├── BLOCK7.js                 # Evolutionary mechanisms
├── BLOCK8.js                 # Knowledge diffusion & memory
├── BLOCK9.js                 # Knowledge synthesis
├── BLOCK10_Diagnostics.js    # Runtime + visualization
├── Controls.js               # window.__controls
├── hakari-backend/
│   ├── server.js             # Node.js REST API
│   ├── .env.example          # Server-side provider configuration
│   └── package.json
├── python_engine/            # Python knowledge evolution model
│   ├── simulation_engine.py  # Propagation, decay, and entropy
│   └── __init__.py
├── index.html                # Frontend entry point
├── vite.config.js            # Vite dev server and API proxy
└── .env                      # Local secrets (not tracked)
```

---

## 🌐 LANGUAGE BREAKDOWN

```
JavaScript  ████████████████████████████████████████████  94.0%
HTML        ████                                           6.0%
```

---

## 🔭 ROADMAP

- [ ] **Visual Simulation Renderer** — WebGL node graph with entropy heat maps and cascade propagation waves
- [ ] **Multi-Agent Simulation** — Spawn multiple HAKARI instances, study inter-agent entropy propagation
- [ ] **Bifurcation Control Layer** — Automated intervention strategies when CSD signals tipping point risk

---

## 🔗 LINKS
- **Live Demo:** [tejaswanth2406.github.io/Portfolio/hakari.html](https://tejaswanth2406.github.io/hakari/) 
- **Portfolio:** [tejaswanth2406.github.io/Portfolio](https://tejaswanth2406.github.io/Portfolio/hakari.html)

---

## 👤 AUTHOR

**Tejaswanth Surisetty**
Cognitive Simulation · Complex Systems · AI Research

---

```
○ HAKARI v3 · Cognitive Simulation Engine · Tejaswanth Surisetty
○ Status: ONLINE · Physics: RUNNING · Entropy: MONITORING · Learning: TRACKING
```
