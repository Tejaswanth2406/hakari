/**
 * HAKARI v3 � main.js
 * ---------------------------------------------
 * Entry point. Lives inside BLOCK_12/
 *
 * Boot order:
 *   1. Hakari     � cognitive field engine
 *   2. Controls   � UI bindings + keyboard
 *   3. Scheduler  � rAF tick loop (needs controls)
 * ---------------------------------------------
 */

import { Hakari }    from './BLOCK_15_UPGRADE/Hakari.js';
import { Scheduler } from './BLOCK_15_UPGRADE/Scheduler.js';
import { Controls }  from './Controls.js';  // ? fixed: was ControlClass

const LLM_API_KEY  = null;
const LLM_PROVIDER = 'anthropic';   // 'anthropic' | 'openai'

// -- BOOT --------------------------------------
window.addEventListener('DOMContentLoaded', () => {

  const canvasEl = document.getElementById('hakari-canvas');

  // -- 1. Hakari engine ------------------------
  const hakari = new Hakari({
    canvasEl,
    seed: 42,

    llm: {
      apiKey:   LLM_API_KEY,
      provider: LLM_PROVIDER,
      model:    LLM_PROVIDER === 'anthropic'
        ? 'claude-sonnet-4-20250514'
        : 'gpt-4o-mini',
    },

    embedder: {
      apiKey: LLM_API_KEY,
      mode:   LLM_API_KEY ? 'api' : 'local',
    },

    statsIds: {
      nodeCount:     'stat-nodes',
      entropy:       'stat-entropy',
      entropyRegime: 'stat-regime',
      tick:          'stat-tick',
      collapseRate:  'stat-collapse',
      avgStrength:   'stat-strength',
      objective:     'stat-objective',
      topNode:       'stat-top-node',
      queryActive:   'stat-query',
      evoStatus:     'stat-evo',
      energyWarning: 'stat-energy-warn',
      csi:           'stat-csi',
      re:            'stat-re',
      kd:            'stat-kd',
      scs:           'stat-scs',
      ced:           'stat-ced',
      er:            'stat-er',
      gps:           'stat-gps',
    },
  });

  // -- 2. Controls -----------------------------
  // Must come BEFORE Scheduler so the tick callback can call syncPhaseBadge()
  const controls = new Controls(hakari);  // scheduler injected below

  // -- 3. Scheduler ----------------------------
  const scheduler = new Scheduler((dt) => {
    hakari.update(dt);
    controls.syncPhaseBadge();
  });

  // Inject scheduler reference so Space / pause shortcuts work in Controls
  controls._scheduler = scheduler;

  scheduler.start();

  // -- Chat: talk to backend --------------------
  async function askHAKARI(question) {
    const response = await fetch('http://localhost:5000/ask', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, user: 'User1' }),
    });
    const data = await response.json();
    return data.answer;
  }

  const sendBtn       = document.getElementById('sendBtn');
  const questionInput = document.getElementById('questionInput');
  const answerDiv     = document.getElementById('answerDiv');

  if (sendBtn && questionInput && answerDiv) {
    sendBtn.addEventListener('click', async () => {
      const input = questionInput.value.trim();
      if (!input) return;
      answerDiv.innerHTML += `<p><b>You:</b> ${input}</p>`;
      questionInput.value = '';
      try {
        const answer = await askHAKARI(input);
        answerDiv.innerHTML += `<p><b>HAKARI:</b> ${answer}</p>`;
      } catch (err) {
        answerDiv.innerHTML += `<p style="color:red"><b>Error:</b> Backend offline � is server.js running?</p>`;
        console.error('[Chat]', err);
      }
      answerDiv.scrollTop = answerDiv.scrollHeight;
    });

    questionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
    });
  }

  // -- Expose globals for console debugging ----
  window.__hakari    = hakari;
  window.__scheduler = scheduler;
  window.__controls  = controls;

  console.log(
    '%c HAKARI v3 %c online ',
    'background:#1c1a14;color:#b87a30;font-weight:bold;padding:2px 6px;',
    'background:#5a6b44;color:#f0ead8;padding:2px 6px;',
  );
  console.log([
    '  window.__hakari              � master engine',
    '  window.__scheduler           � tick loop',
    '  window.__controls            � UI controls',
    '  __hakari.systemReport()      � full snapshot',
    '  __hakari.query("text")       � LLM query',
    '  __hakari.whyDidNodeDie(id)   � causal trace',
    '  __hakari.predictNext(10)     � predictions',
    '  __hakari.semanticMap()       � concept space',
    '  __hakari.importantMoments()  � key history',
    '  __hakari.startLogging()      � record run',
    '  __hakari.downloadLog()       � export JSON',
    '  Ctrl+Shift+L                 � toggle logging',
    '  Ctrl+Shift+D                 � dump report',
    '  Space                        � pause/resume',
  ].join('\n'));
});
