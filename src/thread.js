const { getThreadKey, sanitizeText } = require("./message");

const MAX_RUNTIME_THREADS = 100;

function createThreadStore(config, state) {
  const runtimeHistory = new Map();

  function cleanupRuntimeHistory() {
    if (runtimeHistory.size <= MAX_RUNTIME_THREADS) return;

    const entries = Array.from(runtimeHistory.entries());
    const threadsWithAge = entries.map(([key]) => {
      const threadState = state.threads[key];
      const lastActivity = threadState?.lastReplyAt || 0;
      return { key, lastActivity };
    });

    threadsWithAge.sort((a, b) => a.lastActivity - b.lastActivity);
    const toDelete = threadsWithAge.slice(0, runtimeHistory.size - MAX_RUNTIME_THREADS);
    toDelete.forEach(({ key }) => runtimeHistory.delete(key));
  }

  function rememberMessage(message, role, text) {
    const key = getThreadKey(message);
    const current = runtimeHistory.get(key) || [];
    current.push({
      role,
      user: role === "assistant" ? "бот" : sanitizeText(message.from?.username || message.from?.first_name || "user"),
      text: sanitizeText(text).slice(0, 300)
    });
    runtimeHistory.set(key, current.slice(-config.recentMessagesLimit));
    cleanupRuntimeHistory();
  }

  function getRecentMessages(message) {
    return runtimeHistory.get(getThreadKey(message)) || [];
  }

  return { runtimeHistory, rememberMessage, getRecentMessages };
}

module.exports = { createThreadStore, MAX_RUNTIME_THREADS };