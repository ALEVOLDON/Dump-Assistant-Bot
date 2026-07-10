const { createGeminiDecision, createOpenAiDecision, createOllamaDecision } = require("./providers");

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

  response.result = applyForceReply(response.result, payload.forceReply);
  return response;
}

function applyForceReply(result, forceReply) {
  if (forceReply && !result.should_reply) {
    console.warn(`[LLM] forceReply=true but model said no (${result.reason}). Overriding.`);
    return { ...result, should_reply: true };
  }
  return result;
}

module.exports = { createAssistantDecision, applyForceReply };
