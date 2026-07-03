/**
 * HAKARI v3 — runtime config template
 * -------------------------------------------------
 * 1. Copy this file to: hakari.config.js
 * 2. Fill in your API key
 * 3. hakari.config.js is gitignored — safe to store secrets there
 * -------------------------------------------------
 */

window.HAKARI_CONFIG = {
  LLM_API_KEY:  '',          // paste your Gemini / OpenAI / Anthropic key here
  LLM_PROVIDER: 'gemini',   // 'gemini' | 'openai' | 'anthropic' | 'groq'
  LLM_MODEL:    'gemini-2.0-flash',
};
