const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };

function log(level, message, ...args) {
  if (logLevels[level] <= logLevels[LOG_LEVEL]) {
    const timestamp = new Date().toISOString().slice(11, 19);
    const prefix = `[${timestamp}][${level.toUpperCase()}]`;
    console.log(prefix, message, ...args);
  }
}

const logger = {
  error: (msg, ...args) => log("error", msg, ...args),
  warn: (msg, ...args) => log("warn", msg, ...args),
  info: (msg, ...args) => log("info", msg, ...args),
  debug: (msg, ...args) => log("debug", msg, ...args)
};

module.exports = { logger };