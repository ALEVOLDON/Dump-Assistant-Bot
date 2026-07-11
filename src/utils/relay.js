const { writeState } = require("../core/state");

const MAX_RELAY_TARGETS = 1000;

function ensureRelayState(state) {
  if (!state.relayTargets || typeof state.relayTargets !== "object") {
    state.relayTargets = {};
  }
}

function storeRelayTarget(statePath, state, ownerMessageId, targetUserId) {
  ensureRelayState(state);
  state.relayTargets[String(ownerMessageId)] = {
    targetUserId,
    createdAt: Date.now()
  };

  const entries = Object.entries(state.relayTargets);
  if (entries.length > MAX_RELAY_TARGETS) {
    entries
      .sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0))
      .slice(0, entries.length - MAX_RELAY_TARGETS)
      .forEach(([key]) => delete state.relayTargets[key]);
  }

  writeState(statePath, state);
}

function getRelayTarget(state, replyMessageId) {
  ensureRelayState(state);
  return state.relayTargets[String(replyMessageId)]?.targetUserId || null;
}

module.exports = {
  ensureRelayState,
  storeRelayTarget,
  getRelayTarget,
  MAX_RELAY_TARGETS
};