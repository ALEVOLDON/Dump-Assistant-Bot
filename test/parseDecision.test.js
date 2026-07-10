const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseDecisionJson } = require("../src/llm/parseDecision");
const { applyForceReply } = require("../src/llm/llm");

describe("parseDecisionJson", () => {
  it("parses valid json", () => {
    const parsed = parseDecisionJson('{"should_reply":true,"reply_text":"ok"}');
    assert.equal(parsed.should_reply, true);
    assert.equal(parsed.reply_text, "ok");
  });

  it("returns safe fallback for invalid json", () => {
    const parsed = parseDecisionJson("not json");
    assert.deepEqual(parsed, {
      should_reply: false,
      reason: "invalid_json",
      reply_text: "",
      risk: "low"
    });
  });
});

describe("applyForceReply", () => {
  it("overrides should_reply when forceReply is true", () => {
    const result = applyForceReply(
      { should_reply: false, reply_text: "", reason: "no" },
      true
    );
    assert.equal(result.should_reply, true);
  });

  it("keeps result when forceReply is false", () => {
    const result = applyForceReply(
      { should_reply: false, reply_text: "", reason: "no" },
      false
    );
    assert.equal(result.should_reply, false);
  });
});