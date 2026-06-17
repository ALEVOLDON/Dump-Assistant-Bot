const { parseDecisionJson } = require("./parseDecision");

async function createGeminiDecision(config, payload) {
  const url = `${config.geminiBaseUrl}/models/${config.geminiModel}:generateContent`;

  // Отладка - проверяем ключ
  if (!config.geminiApiKey) {
    throw new Error("Gemini API key is missing! Check GEMINI_API_KEY in .env");
  }

  const systemContent = [
    payload.systemPrompt.trim(),
    "",
    "═══",
    "Формат ответа — ТОЛЬКО валидный JSON:",
    '{"should_reply": boolean, "reply_text": "...", "reason": "...", "risk": "low|medium|high"}',
    "",
    payload.noSuffix
      ? ""
      : (payload.forceReply
          ? 'should_reply ДОЛЖЕН быть true. Напиши живой короткий ответ в reply_text.'
          : 'Если отвечать не нужно — should_reply: false, reply_text: "".')
  ].filter(val => val !== undefined && val !== "").join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.llmTimeoutMs);
  let response;

  try {
    response = await fetch(`${url}?key=${config.geminiApiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
        body: JSON.stringify((() => {
          const genConfig = {
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                should_reply: { type: "BOOLEAN" },
                reply_text: { type: "STRING" },
                reason: { type: "STRING" },
                risk: { type: "STRING", enum: ["low", "medium", "high"] }
              },
              required: ["should_reply", "reply_text"]
            }
          };

          // Turn off thinking for Gemini 2.5+ models to prevent MaxTokens truncation of JSON responses
          if (config.geminiModel.includes("2.5") || config.geminiModel.includes("3.")) {
            genConfig.thinkingConfig = {
              thinkingBudget: 0
            };
          }

          return {
            contents: [{
              parts: [{
                text: `${systemContent}\n\n${payload.userPrompt}`
              }]
            }],
            generationConfig: genConfig
          };
        })()),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Gemini timeout after ${config.llmTimeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const usage = data.usageMetadata || {};

  const parsed = parseDecisionJson(content);
  if (parsed.reason === "invalid_json") {
    console.error("[Gemini] Bad JSON:", content.slice(0, 200));
  }

  return {
    result: parsed,
    usage: {
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0
    }
  };
}

async function createOpenAiDecision(config, payload) {
  const url = `${config.openAiBaseUrl}/chat/completions`;

  const systemContent = [
    payload.systemPrompt.trim(),
    "",
    "═══",
    "Формат ответа — ТОЛЬКО валидный JSON:",
    '{"should_reply": boolean, "reply_text": "...", "reason": "...", "risk": "low|medium|high"}',
    "",
    payload.noSuffix
      ? ""
      : (payload.forceReply
          ? 'should_reply ДОЛЖЕН быть true. Напиши живой короткий ответ в reply_text.'
          : 'Если отвечать не нужно — should_reply: false, reply_text: "".')
  ].filter(val => val !== undefined && val !== "").join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.llmTimeoutMs);
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openAiApiKey}`
      },
      body: JSON.stringify({
        model: config.openAiModel,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: payload.userPrompt }
        ]
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`OpenAI timeout after ${config.llmTimeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const usage = data.usage || {};

  const parsed = parseDecisionJson(content);
  if (parsed.reason === "invalid_json") {
    console.error("[OpenAI] Bad JSON:", content.slice(0, 200));
  }

  return {
    result: parsed,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0
    }
  };
}

module.exports = { createGeminiDecision, createOpenAiDecision };
