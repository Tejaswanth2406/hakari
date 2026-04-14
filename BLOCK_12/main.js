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

  // -- Chat: Dialogue UI ------------------------
  const chatWidget   = document.getElementById('chat-widget');
  const chatToggle   = document.getElementById('chat-toggle-btn');
  const chatClose    = document.getElementById('chat-close-btn');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput    = document.getElementById('chat-input');
  const chatSendBtn  = document.getElementById('chat-send-btn');
  const chatMicBtn   = document.getElementById('chat-mic-btn');

  // Center prompt components
  const centerOverlay = document.getElementById('center-prompt-overlay');
  const centerInput   = document.getElementById('center-chat-input');
  const centerSendBtn = document.getElementById('center-send-btn');
  const centerMicBtn  = document.getElementById('center-mic-btn');

  let chatOpen = false;

  const toggleChat = () => {
    chatOpen = !chatOpen;
    if (chatOpen) {
      chatWidget.style.transform = 'translateY(0)';
      chatToggle.style.transform = 'translateY(150%)';
      chatInput.focus();
    } else {
      chatWidget.style.transform = 'translateY(150%)';
      chatToggle.style.transform = 'translateY(0)';
    }
  };

  if (chatToggle && chatClose) {
    chatToggle.addEventListener('click', toggleChat);
    chatClose.addEventListener('click', toggleChat);
  }

  const appendMessage = (sender, text, isError = false) => {
    const msgDiv = document.createElement('div');
    msgDiv.style.fontFamily = 'var(--font-mono)';
    msgDiv.style.fontSize = '0.65rem';
    msgDiv.style.lineHeight = '1.4';
    
    if (sender === 'You') {
      msgDiv.style.color = 'var(--ink)';
      msgDiv.innerHTML = `<span style="color:var(--sage)">▶ YOU</span><br/>${text}`;
    } else if (sender === 'HAKARI') {
      msgDiv.style.color = isError ? 'var(--terra)' : 'var(--ink)';
      msgDiv.innerHTML = `<span style="color:var(--gold)">■ HAKARI</span><br/>${text}`;
    }
    
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  const speakText = (text) => {
    if(!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Simple scrub of markdown chars for basic speech
    utterance.text = text.replace(/[*_#`]/g, '');
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  const handleSend = async (customText) => {
    const text = (typeof customText === 'string') ? customText : chatInput.value.trim();
    if (!text) return;
    
    appendMessage('You', text);
    chatInput.value = '';
    
    // Create typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.style.fontFamily = 'var(--font-mono)';
    typingDiv.style.fontSize = '0.65rem';
    typingDiv.style.color = 'var(--ink3)';
    typingDiv.innerText = 'System reasoning...';
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      // Use the internal LLM connector
      const res = await hakari.query(text);
      let replyTxt = '';
      if(typeof res === 'object' && res.response) {
        replyTxt = res.response;
      } else if (typeof res === 'string') {
        replyTxt = res;
      } else {
        replyTxt = 'Query complete. No text response from API.';
      }
      
      chatMessages.removeChild(typingDiv);
      appendMessage('HAKARI', replyTxt);
      speakText(replyTxt);
      
    } catch (err) {
      chatMessages.removeChild(typingDiv);
      appendMessage('HAKARI', `Query Failed: ${err.message}`, true);
    }
  };

  if (chatSendBtn && chatInput) {
    chatSendBtn.addEventListener('click', () => handleSend());
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        handleSend(); 
      }
    });
  }

  const executeCenterSearch = () => {
    const text = centerInput?.value?.trim();
    if (!text) return;
    
    if (centerOverlay) {
      centerOverlay.style.opacity = '0';
      centerOverlay.style.pointerEvents = 'none';
    }
    
    if (!chatOpen) toggleChat();
    
    centerInput.value = '';
    handleSend(text);
  };

  if (centerSendBtn && centerInput) {
    centerSendBtn.addEventListener('click', executeCenterSearch);
    centerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeCenterSearch();
      }
    });
  }

  // Web Speech API Integration
  if (('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    let isRecording = false;
    let activeInputTarget = null;
    let activeMicBtn = null;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (activeInputTarget) {
        activeInputTarget.value += (activeInputTarget.value ? ' ' : '') + transcript;
      }
      if (activeMicBtn) {
        activeMicBtn.style.color = activeMicBtn === centerMicBtn ? 'var(--paper)' : 'var(--ink)';
        activeMicBtn.style.animation = 'none';
      }
      isRecording = false;
    };

    const resetMicState = () => {
      if (activeMicBtn) {
        activeMicBtn.style.color = activeMicBtn === centerMicBtn ? 'var(--paper)' : 'var(--ink)';
        activeMicBtn.style.animation = 'none';
      }
      isRecording = false;
    }

    recognition.onerror = resetMicState;
    recognition.onend = resetMicState;

    const bindMic = (btn, inputEl) => {
      if(!btn) return;
      btn.addEventListener('click', () => {
        window.speechSynthesis.cancel();
        if (!isRecording) {
          activeInputTarget = inputEl;
          activeMicBtn = btn;
          recognition.start();
          btn.style.color = 'var(--terra)';
          btn.style.animation = 'pulseInk 1s infinite alternate';
          isRecording = true;
        } else {
          recognition.stop();
          isRecording = false;
        }
      });
    };

    bindMic(chatMicBtn, chatInput);
    bindMic(centerMicBtn, centerInput);

  } else {
    if(chatMicBtn) {
      chatMicBtn.title = "Speech API not supported in this browser.";
      chatMicBtn.style.opacity = '0.5';
    }
    if(centerMicBtn) {
      centerMicBtn.title = "Speech API not supported in this browser.";
      centerMicBtn.style.opacity = '0.5';
    }
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
