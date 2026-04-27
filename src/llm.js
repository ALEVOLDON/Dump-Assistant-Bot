const { createGeminiDecision, createOpenAiDecision } = require("./openai");
const { createOllamaDecision } = require("./ollama");

async function createAssistantDecision(config, payload) {
  let response;

  if (config.llmProvider === "gemini") {
    response = await createGeminiDecision(config, payload);
  } else if (config.llmProvider === "openai") {
    response = await createOpenAiDecision(config, payload);
  } else if (config.llmProvider === "ollama") {
    response = await createOllamaDecision(config, payload);
  } else {
    throw new Error(`Unsupported LLM_PROVIDER: ${config.llmProvider}`);
  }

  // Страховка: если forceReply=true, но модель всё равно сказала "нет" — принудительно включаем
  if (payload.forceReply && !response.result.should_reply) {
    console.warn(`[LLM] forceReply=true but model said no (${response.result.reason}). Overriding.`);
    response.result.should_reply = true;
  }

  return response;
}

module.exports = { createAssistantDecision };
