const express  = require('express');
const axios    = require('axios');
const cors     = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// ── Live simulation state ───────────────────────────────────────
const simulationState = {
    tick: 0,
    status: 'ready',
    nodes: {},
    updatedAt: new Date().toISOString()
};

function updateSimulationState(patch = {}) {
    if (typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError('state patch must be an object');
    }

    Object.assign(simulationState, patch, {
        updatedAt: new Date().toISOString()
    });
    return simulationState;
}

// ── MongoDB ──────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

const memorySchema = new mongoose.Schema({
    user:      String,
    question:  String,
    answer:    String,
    provider:  String,
    timestamp: Date
});
const Memory = mongoose.model('Memory', memorySchema);

// ── Gemini helper ────────────────────────────────────────────────
async function callGemini(question) {
    const key   = process.env.GEMINI_API_KEY;
    const model = process.env.LLM_MODEL || 'gemini-2.0-flash';
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const res = await axios.post(url, {
        contents: [{ role: 'user', parts: [{ text: question }] }]
    }, { headers: { 'Content-Type': 'application/json' } });

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── OpenAI helper (fallback) ──────────────────────────────────────
async function callOpenAI(question) {
    const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: question }]
        },
        { headers: { 'Authorization': `Bearer ${process.env.OPENAI_KEY}` } }
    );
    return res.data.choices[0].message.content;
}

// ── AI endpoint ──────────────────────────────────────────────────
app.post(['/ask', '/api/ask'], async (req, res) => {
    const { question, user, context } = req.body;
    const provider = process.env.LLM_PROVIDER || 'gemini';
    const prompt = context ? `${question}\n\nHAKARI CONTEXT:\n${context}` : question;

    try {
        let answer;

        if (provider === 'gemini') {
            answer = await callGemini(prompt);
        } else {
            answer = await callOpenAI(prompt);
        }

        // Save conversation to DB
        await Memory.create({ user, question, answer, provider, timestamp: new Date() });

        res.json({ answer, provider });
    } catch (err) {
        console.error('[/ask] error:', err.message);
        res.status(500).json({ error: 'AI call failed', detail: err.message });
    }
});

// ── Simulation state API ────────────────────────────────────────
app.get('/api/state', (req, res) => {
    res.json({ ...simulationState });
});

app.patch('/api/state', (req, res) => {
    try {
        res.json(updateSimulationState(req.body));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/state/tick', (req, res) => {
    const tick = Number.isFinite(req.body?.tick)
        ? req.body.tick
        : simulationState.tick + 1;
    res.json(updateSimulationState({ tick, status: 'running' }));
});

// ── Health check ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        provider: process.env.LLM_PROVIDER || 'gemini',
        model:    process.env.LLM_MODEL    || 'gemini-2.0-flash'
    });
});

app.listen(process.env.PORT || 5000, () =>
    console.log(`HAKARI backend · ${process.env.LLM_PROVIDER || 'gemini'} · port ${process.env.PORT || 5000}`)
);