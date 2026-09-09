const express  = require('express');
const axios    = require('axios');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const { spawn } = require('child_process');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const providerConfig = {
    provider: process.env.LLM_PROVIDER || 'gemini',
    model: process.env.LLM_MODEL || 'gemini-2.0-flash',
    apiKey: null,
};

function getProviderConfig() {
    const envKey = providerConfig.provider === 'openai'
        ? process.env.OPENAI_KEY
        : providerConfig.provider === 'gemini'
            ? process.env.GEMINI_API_KEY
            : process.env.LLM_API_KEY;
    return { ...providerConfig, apiKey: providerConfig.apiKey || envKey };
}

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

function runPythonMetrics(payload) {
    return new Promise((resolve, reject) => {
        const projectRoot = path.resolve(__dirname, '..');
        const python = process.platform === 'win32' ? 'python' : 'python3';
        const child = spawn(python, ['-m', 'python_engine.metrics_cli'], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let output = '';
        let errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        child.on('error', error => reject(error));
        child.on('close', code => {
            if (code !== 0) return reject(new Error(errors || `Python exited with code ${code}`));
            try {
                const response = JSON.parse(output.trim().split('\n').pop());
                if (!response.ok) return reject(new Error(response.error));
                resolve(response.result);
            } catch (error) {
                reject(new Error(`Invalid Python metrics response: ${error.message}`));
            }
        });
        child.stdin.end(`${JSON.stringify(payload)}\n`);
    });
}

function runRustMetrics(payload) {
    return new Promise((resolve, reject) => {
        const projectRoot = path.resolve(__dirname, '..');
        const binaryName = process.platform === 'win32' ? 'hakari-metrics.exe' : 'hakari-metrics';
        const builtBinary = path.join(projectRoot, 'rust_engine', 'target', 'debug', binaryName);
        const command = fs.existsSync(builtBinary) ? builtBinary : 'cargo';
        const args = fs.existsSync(builtBinary)
            ? []
            : ['run', '--quiet', '--manifest-path', path.join(projectRoot, 'rust_engine', 'Cargo.toml'), '--'];
        args.push(
            (payload.predictions || []).join(','),
            (payload.observations || []).join(','),
            String(payload.observation_weight ?? 0.7)
        );
        const child = spawn(command, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        let errors = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errors += chunk; });
        child.on('error', error => reject(error));
        child.on('close', code => {
            if (code !== 0) return reject(new Error(errors || `Rust exited with code ${code}`));
            try { resolve(JSON.parse(output.trim().split('\n').pop())); }
            catch (error) { reject(new Error(`Invalid Rust metrics response: ${error.message}`)); }
        });
    });
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
    const config = getProviderConfig();
    const key   = config.apiKey;
    const model = config.model;
    if (!key) throw new Error('GEMINI_API_KEY is missing in hakari-backend/.env');
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const res = await axios.post(url, {
        contents: [{ role: 'user', parts: [{ text: question }] }]
    }, { headers: { 'Content-Type': 'application/json' } });

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── OpenAI helper (fallback) ──────────────────────────────────────
async function callOpenAI(question) {
    const key = getProviderConfig().apiKey;
    if (!key) throw new Error('An OpenAI API key has not been configured');
    const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: question }]
        },
        { headers: { 'Authorization': `Bearer ${key}` } }
    );
    return res.data.choices[0].message.content;
}

async function testProviderConfig() {
    const config = getProviderConfig();
    if (!config.apiKey) throw new Error('An API key has not been configured');

    if (config.provider === 'gemini') {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
            { contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        if (!response.data?.candidates?.[0]) throw new Error('Gemini returned no candidate');
        return;
    }

    await axios.get('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        timeout: 15000,
    });
}

// ── AI endpoint ──────────────────────────────────────────────────
app.post(['/ask', '/api/ask'], async (req, res) => {
    const { question, user, context } = req.body;
    const provider = getProviderConfig().provider;
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

app.post('/api/provider', (req, res) => {
    const { provider, apiKey, model } = req.body || {};
    const supportedProviders = ['gemini', 'openai'];
    const cleanProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    const cleanKey = typeof apiKey === 'string' ? apiKey.trim() : '';

    if (!supportedProviders.includes(cleanProvider)) {
        return res.status(400).json({ error: 'provider must be gemini or openai' });
    }
    if (!cleanKey) {
        return res.status(400).json({ error: 'apiKey is required' });
    }

    providerConfig.provider = cleanProvider;
    providerConfig.model = typeof model === 'string' && model.trim()
        ? model.trim()
        : cleanProvider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini';
    providerConfig.apiKey = cleanKey;

    res.json({
        provider: providerConfig.provider,
        model: providerConfig.model,
        keyConfigured: true,
    });
});

app.post('/api/provider/test', async (req, res) => {
    try {
        await testProviderConfig();
        res.json({ valid: true, provider: getProviderConfig().provider });
    } catch (error) {
        const status = error.response?.status;
        console.error('[/api/provider/test] error:', status || error.message);
        res.status(400).json({
            valid: false,
            error: status === 401 || status === 403
                ? 'The API key was rejected by the provider'
                : 'The provider could not be reached or returned an invalid response',
        });
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

// ── Cross-language scientific metrics ───────────────────────────
app.post('/api/metrics/:runtime', async (req, res) => {
    const runtime = req.params.runtime;
    if (!['python', 'rust'].includes(runtime)) {
        return res.status(400).json({ error: 'runtime must be python or rust' });
    }
    try {
        const result = runtime === 'python'
            ? await runPythonMetrics(req.body)
            : await runRustMetrics(req.body);
        res.json({ runtime, ...result });
    } catch (error) {
        console.error(`[metrics/${runtime}] error:`, error.message);
        res.status(502).json({ runtime, error: error.message });
    }
});

// ── Health check ─────────────────────────────────────────────────
app.get(['/health', '/api/health'], (req, res) => {
    const config = getProviderConfig();
    res.json({
        status: 'ok',
        provider: config.provider,
        model: config.model,
        keyConfigured: Boolean(config.apiKey),
    });
});

app.listen(process.env.PORT || 5000, () =>
    console.log(`HAKARI backend · ${process.env.LLM_PROVIDER || 'gemini'} · port ${process.env.PORT || 5000}`)
);