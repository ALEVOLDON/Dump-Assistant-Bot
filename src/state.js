const fs = require("fs");
const path = require("path");

const DEFAULT_STATE = {
  autoReplyEnabled: true,
  usage: {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  },
  threads: {},
  history: {},
  relayTargets: {}
};

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readState(filePath) {
  ensureDir(filePath);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_STATE, null, 2));
    return structuredClone(DEFAULT_STATE);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      usage: {
        ...structuredClone(DEFAULT_STATE).usage,
        ...(parsed.usage || {})
      },
      threads: parsed.threads || {},
      history: parsed.history || {},
      relayTargets: parsed.relayTargets || {}
    };
  } catch (error) {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_STATE, null, 2));
    return structuredClone(DEFAULT_STATE);
  }
}

function writeState(filePath, state) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

module.exports = {
  readState,
  writeState
};
