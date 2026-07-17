const { isOwner } = require("../utils/access");
const { writeState } = require("../core/state");

function registerCommands(bot, { config, state, posts }) {
  bot.command("status", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    const u = state.usage;
    await ctx.reply([
      `auto_reply: ${state.autoReplyEnabled ? "on" : "off"}`,
      `ephemeral_replies: ${state.ephemeralRepliesEnabled ? "on" : "off"}`,
      `provider: ${config.llmProvider}`,
      `model: ${config.activeLlmModel}`,
      `requests: ${u.requests}`,
      `tokens_total: ${u.totalTokens}`,
      `posts_cached: ${Object.keys(posts.cache).length}`
    ].join("\n"));
  });

  bot.command("on", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    state.autoReplyEnabled = true;
    writeState(config.statePath, state);
    await ctx.reply("Автоответы включены.");
  });

  bot.command("off", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    state.autoReplyEnabled = false;
    writeState(config.statePath, state);
    await ctx.reply("Автоответы выключены.");
  });

  bot.command("ephemeral", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    const arg = (ctx.message?.text || "").split(" ")[1];
    if (arg === "on") {
      state.ephemeralRepliesEnabled = true;
      writeState(config.statePath, state);
      await ctx.reply("Приватные ответы в группе включены.");
    } else if (arg === "off") {
      state.ephemeralRepliesEnabled = false;
      writeState(config.statePath, state);
      await ctx.reply("Приватные ответы в группе выключены.");
    } else {
      await ctx.reply(`Приватные ответы в группе: ${state.ephemeralRepliesEnabled ? "on" : "off"}\nИспользуйте '/ephemeral on' или '/ephemeral off' для изменения.`);
    }
  });

  bot.command("usage", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    await ctx.reply(JSON.stringify(state.usage, null, 2));
  });

  bot.command("chatid", async (ctx) => {
    if (!isOwner(config, ctx.from.id)) return;
    const threadId = ctx.message?.message_thread_id || 0;
    await ctx.reply([
      `chat_id: ${ctx.chat.id}`,
      `chat_type: ${ctx.chat.type}`,
      `thread_id: ${threadId}`
    ].join("\n"));
  });
}

module.exports = { registerCommands };