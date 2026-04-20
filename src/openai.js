async function createOpenAiDecision(config, payload) {
  const url = `${config.openAiBaseUrl}/chat/completions`;

  const systemContent = [
    payload.systemPrompt.trim(),
    "",
    "═══",
    "Формат ответа — ТОЛЬКО валидный JSON:",
    '{"should_reply": boolean, "reply_text": "...", "reason": "...", "risk": "low|medium|high"}',
    "",
    payload.forceReply
      ? 'should_reply ДОЛЖЕН быть true. Напиши живой короткий ответ в reply_text.'
      : 'Если отвечать не нужно — should_reply: false, reply_text: "".'
  ].join("\n");

  const response = await fetch(url, {
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
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const usage = data.usage || {};

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[OpenAI] Bad JSON:", content.slice(0, 200));
    parsed = { should_reply: false, reason: "invalid_json", reply_text: "", risk: "low" };
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

module.exports = { createOpenAiDecision };
