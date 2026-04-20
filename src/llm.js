const { createOpenAiDecision } = require("./openai");
const { createOllamaDecision } = require("./ollama");

async function createAssistantDecision(config, payload) {
  let response;

  if (config.llmProvider === "ollama") {
    response = await createOllamaDecision(config, payload);
  } else {
    response = await createOpenAiDecision(config, payload);
  }

  // Страховка: если forceReply=true, но модель всё равно сказала "нет" — принудительно включаем
  if (payload.forceReply && !response.result.should_reply) {
    console.warn(`[LLM] forceReply=true but model said no (${response.result.reason}). Overriding.`);
    response.result.should_reply = true;
  }

  return response;
}

module.exports = { createAssistantDecision };
