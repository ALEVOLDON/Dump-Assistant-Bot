async function createOllamaDecision(config, payload) {
  const url = `${config.ollamaBaseUrl}/api/chat`;

  // Системный промпт: роль бота + строгое требование JSON
  const systemContent = [
    payload.systemPrompt.trim(),
    "",
    "═══",
    "Формат ответа — ТОЛЬКО валидный JSON, без пояснений вне JSON:",
    '{"should_reply": boolean, "reply_text": "...", "reason": "...", "risk": "low|medium|high"}',
    "",
    payload.forceReply
      ? 'should_reply ДОЛЖЕН быть true. Напиши живой короткий ответ в reply_text.'
      : 'Если отвечать не нужно — should_reply: false, reply_text: "".'
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.llmTimeoutMs);
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: payload.userPrompt }
        ],
        stream: false,
        format: "json",
        options: {
          temperature: 0.4,
          num_ctx: config.ollamaNumCtx,
          num_predict: config.ollamaNumPredict
        }
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Ollama timeout after ${config.llmTimeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[Ollama] Bad JSON:", content.slice(0, 200));
    parsed = { should_reply: false, reason: "invalid_json", reply_text: "", risk: "low" };
  }

  // Если forceReply и модель всё равно сказала false — принудительно включаем
  if (payload.forceReply && !parsed.should_reply) {
    console.warn("[Ollama] forceReply=true but model said no. Overriding.");
    parsed.should_reply = true;
  }

  return {
    result: parsed,
    usage: {
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
    }
  };
}

module.exports = { createOllamaDecision };
