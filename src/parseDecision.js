function parseDecisionJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return { should_reply: false, reason: "invalid_json", reply_text: "", risk: "low" };
  }
}

module.exports = { parseDecisionJson };