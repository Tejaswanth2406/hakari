/**
 * HAKARI v3 — llm/LLMConnector.js
 * ------------------------------------------------
 * Cognitive bridge between HAKARI knowledge field
 * and external LLM providers.
 */

import { RETRIEVAL } from '../core/config.js'

const DEFAULT_SYSTEM_PROMPT =
`You are HAKARI — an adaptive intelligence system.
You reason using a dynamic knowledge field where concepts have strength,
decay, and entropy. Answer using the supplied knowledge context.`

export class LLMConnector {

  constructor(opts={}){

    this.apiKey   = opts.apiKey ?? null
    this.provider = opts.provider ?? 'anthropic'

    this.model =
      opts.model ?? this._defaultModel()

    this.maxTokens =
      opts.maxTokens ?? 1024

    this.systemPrompt =
      opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

    this.maxRetries =
      opts.maxRetries ?? 2

    this.timeoutMs =
      opts.timeoutMs ?? 20000

    this.synthesizer =
      opts.knowledgeSynthesizer ?? null

    this.queryCount = 0
    this.errorCount = 0

    this.lastResponse = null
    this.lastContext  = null
    this.lastError    = null
  }

  /* ------------------------------------------------ */
  /* MAIN QUERY PIPELINE                              */
  /* ------------------------------------------------ */

  async query(queryText,hakari,opts={}){

    const k =
      opts.k ?? RETRIEVAL.TOP_K

    const nodes =
      hakari.aliveNodes()

    /* ---- 1 embed query ---- */

    const queryVec =
      await hakari.embedder.embed(queryText)

    /* ---- 2 activate field ---- */

    hakari.knowledgeEngine.setQuery(
      queryVec,
      queryText
    )

    /* ---- 3 immediate activation ---- */

    hakari.knowledgeEngine.update(
      nodes,
      hakari.networkEngine?.graph,
      hakari.nodeMap,
      hakari.params
    )

    /* ---- 4 retrieve ---- */

    const results =
      hakari.knowledgeEngine.retrieve(nodes,k)

    /* ---- 5 context build ---- */

    const meta = {

      entropy:
        hakari.thermodynamicEngine?.S ??
        hakari.entropyField?.S,

      nodeCount:nodes.length,

      tick:hakari.tick,

      temperature:
        hakari.thermodynamicEngine?.T,

      freeEnergy:
        hakari.thermodynamicEngine?.F,

      phase:
        hakari
          .thermodynamicEngine
          ?.phaseTransition
          ?.currentPhase
    }

    const context =
      hakari.contextBuilder.build(
        results,
        queryText,
        meta
      )

    this.lastContext = context

    /* ---- 6 call LLM ---- */

    let response

    try{

      if(this.apiKey)
        response =
          await this._callWithRetry(
            queryText,
            context
          )
      else
        response =
          this._noAPIResponse(
            context,
            results
          )

    }catch(err){

      this.lastError = err.message
      this.errorCount++

      response =
        this._noAPIResponse(
          context,
          results
        )
    }

    this.lastResponse = response
    this.queryCount++

    /* ---- 7 synthesis ---- */

    if(opts.synthesize && this.synthesizer){

      try{

        const newNodes =
          await this.synthesizer.synthesize(
            response,
            nodes
          )

        for(const node of newNodes)
          hakari.addNode(node)

      }catch(err){

        console.warn(
          '[LLMConnector] synthesis failed',
          err
        )
      }
    }

    /* ---- legacy inject ---- */

    if(opts.injectResponse && response){

      await this._injectResponseNode(
        queryText,
        queryVec,
        hakari
      )
    }

    return {

      response,
      context,
      nodes:results,
      queryText,
      tick:hakari.tick
    }
  }

  /* ------------------------------------------------ */
  /* RETRY WRAPPER                                    */
  /* ------------------------------------------------ */

  async _callWithRetry(queryText,context){

    let lastErr

    for(let i=0;i<=this.maxRetries;i++){

      try{

        return await this._callLLM(
          queryText,
          context
        )

      }catch(err){

        lastErr = err

        if(i < this.maxRetries)
          await this._sleep(
            400 * (i+1)
          )
      }
    }

    throw lastErr
  }

  /* ------------------------------------------------ */
  /* PROVIDER SWITCH                                  */
  /* ------------------------------------------------ */

  async _callLLM(queryText,context){

    if(this.provider==='anthropic')
      return this._callAnthropic(
        queryText,
        context
      )

    if(this.provider==='gemini')
      return this._callGemini(
        queryText,
        context
      )

    if(this.provider==='groq')
      return this._callGroq(
        queryText,
        context
      )

    return this._callOpenAI(
      queryText,
      context
    )
  }

  /* ------------------------------------------------ */
  /* ANTHROPIC                                        */
  /* ------------------------------------------------ */

  async _callAnthropic(queryText,context){

    const response =
      await this._fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'x-api-key':this.apiKey,
            'anthropic-version':'2023-06-01'
          },
          body:JSON.stringify({
            model:this.model,
            max_tokens:this.maxTokens,
            system:this.systemPrompt,
            messages:[
              {
                role:'user',
                content:
`${context}

---

User query:
${queryText}`
              }
            ]
          })
        }
      )

    if(!response.ok)
      throw new Error(
        `Anthropic API ${response.status}`
      )

    const data =
      await response.json()

    return (
      data?.content?.[0]?.text
      ?? ''
    )
  }

  /* ------------------------------------------------ */
  /* OPENAI                                           */
  /* ------------------------------------------------ */

  async _callOpenAI(queryText,context){

    const response =
      await this._fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Authorization':
              `Bearer ${this.apiKey}`
          },
          body:JSON.stringify({
            model:this.model,
            max_tokens:this.maxTokens,
            messages:[
              {
                role:'system',
                content:this.systemPrompt
              },
              {
                role:'user',
                content:
`${context}

---

User query:
${queryText}`
              }
            ]
          })
        }
      )

    if(!response.ok)
      throw new Error(
        `OpenAI API ${response.status}`
      )

    const data =
      await response.json()

    return (
      data?.choices?.[0]
        ?.message
        ?.content
      ?? ''
    )
  }

  /* ------------------------------------------------ */
  /* GEMINI                                           */
  /* ------------------------------------------------ */

  async _callGemini(queryText,context){

    const response =
      await this._fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            systemInstruction: {
              parts: [{text: this.systemPrompt}]
            },
            contents:[
              {
                role:'user',
                parts:[{
                  text:
`${context}

---

User query:
${queryText}`
                }]
              }
            ]
          })
        }
      )

    if(!response.ok)
      throw new Error(
        `Gemini API ${response.status}`
      )

    const data =
      await response.json()

    return (
      data?.candidates?.[0]
        ?.content
        ?.parts?.[0]
        ?.text
      ?? ''
    )
  }

  /* ------------------------------------------------ */
  /* GROQ                                             */
  /* ------------------------------------------------ */

  async _callGroq(queryText,context){

    const response =
      await this._fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Authorization':
              `Bearer ${this.apiKey}`
          },
          body:JSON.stringify({
            model:this.model,
            max_tokens:this.maxTokens,
            messages:[
              {
                role:'system',
                content:this.systemPrompt
              },
              {
                role:'user',
                content:
`${context}

---

User query:
${queryText}`
              }
            ]
          })
        }
      )

    if(!response.ok)
      throw new Error(
        `Groq API ${response.status}`
      )

    const data =
      await response.json()

    return (
      data?.choices?.[0]
        ?.message
        ?.content
      ?? ''
    )
  }

  /* ------------------------------------------------ */
  /* FALLBACK RESPONSE                                */
  /* ------------------------------------------------ */

  _noAPIResponse(context,results){

    const top =
      results
        .slice(0,3)
        .map(r =>
          r.node?.label ??
          r.node?.id
        )
        .join(', ')

    return `[HAKARI field response — no API key]

Top nodes: ${top || 'none'}

Context:
${context}`
  }

  /* ------------------------------------------------ */
  /* NODE INJECTION                                   */
  /* ------------------------------------------------ */

  async _injectResponseNode(
    queryText,
    queryVec,
    hakari
  ){

    try{

      const node =
        hakari.nodeFactory
          .fromEmbedding(
            queryText,
            Array.from(queryVec),
            {
              strength:0.6,
              source:'llm'
            }
          )

      hakari.addNode(node)

    }catch(err){

      console.warn(
        '[LLMConnector] injection failed',
        err
      )
    }
  }

  /* ------------------------------------------------ */
  /* UTILITIES                                        */
  /* ------------------------------------------------ */

  _defaultModel(){

    if(this.provider==='gemini')
      return 'gemini-2.0-flash'
      
    if(this.provider==='groq')
      return 'llama3-8b-8192'

    return this.provider==='anthropic'
      ? 'claude-sonnet-4-20250514'
      : 'gpt-4o-mini'
  }

  async _fetchWithTimeout(url,opts){

    const controller =
      new AbortController()

    const id =
      setTimeout(
        ()=>controller.abort(),
        this.timeoutMs
      )

    try{

      return await fetch(
        url,
        {
          ...opts,
          signal:controller.signal
        }
      )

    }finally{

      clearTimeout(id)
    }
  }

  _sleep(ms){

    return new Promise(
      r=>setTimeout(r,ms)
    )
  }

  /* ------------------------------------------------ */
  /* DIAGNOSTICS                                      */
  /* ------------------------------------------------ */

  getState(){

    return {

      provider:this.provider,
      model:this.model,
      queryCount:this.queryCount,
      errorCount:this.errorCount,
      hasApiKey:!!this.apiKey,
      lastError:this.lastError
    }
  }
}