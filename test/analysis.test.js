const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeMessage, isNoise, isQuestion, isDirectAddress } = require("../src/utils/analysis");

const baseConfig = {
  botUsername: "testbot",
  allowedChatIds: [-100111],
  allowAllChats: false,
  ownerUserIds: [42],
  threadCooldownMs: 90_000
};

const baseState = {
  autoReplyEnabled: true,
  threads: {}
};

function makeMessage(overrides = {}) {
  return {
    chat: { id: -100111, type: "supergroup" },
    from: { id: 99, username: "user", is_bot: false },
    message_thread_id: 1,
    ...overrides
  };
}

describe("isNoise", () => {
  it("detects short and reaction messages", () => {
    assert.equal(isNoise("ok"), true);
    assert.equal(isNoise("👍"), true);
    assert.equal(isNoise("как работает бот"), false);
  });
});

describe("isQuestion", () => {
  it("detects question marks and Russian question words", () => {
    assert.equal(isQuestion("это правда?"), true);
    assert.equal(isQuestion("объясни пожалуйста"), true);
    assert.equal(isQuestion("круто"), false);
  });
});

describe("isDirectAddress", () => {
  it("detects bot mention and admin keywords", () => {
    assert.equal(isDirectAddress(baseConfig, "привет @testbot"), true);
    assert.equal(isDirectAddress(baseConfig, "админ помоги"), true);
    assert.equal(isDirectAddress(baseConfig, "просто текст"), false);
  });
});

describe("analyzeMessage", () => {
  it("skips disallowed chats", () => {
    const result = analyzeMessage(baseConfig, baseState, makeMessage({ chat: { id: -999 } }), "вопрос?");
    assert.equal(result.skip, true);
    assert.equal(result.reason, "chat_not_allowed");
  });

  it("forces reply for owner messages", () => {
    const result = analyzeMessage(baseConfig, baseState, makeMessage({ from: { id: 42, is_bot: false } }), "привет");
    assert.equal(result.skip, false);
    assert.equal(result.forceReply, true);
  });

  it("skips noise", () => {
    const result = analyzeMessage(baseConfig, baseState, makeMessage(), "ок");
    assert.equal(result.skip, true);
    assert.equal(result.reason, "noise");
  });

  it("applies thread cooldown for non-questions", () => {
    const state = {
      ...baseState,
      threads: { "-100111:1": { lastReplyAt: Date.now() - 10_000 } }
    };
    const result = analyzeMessage(baseConfig, state, makeMessage(), "интересная мысль");
    assert.equal(result.skip, true);
    assert.equal(result.reason, "cooldown");
  });

  it("allows questions during cooldown", () => {
    const state = {
      ...baseState,
      threads: { "-100111:1": { lastReplyAt: Date.now() - 10_000 } }
    };
    const result = analyzeMessage(baseConfig, state, makeMessage(), "как это работает?");
    assert.equal(result.skip, false);
  });
});