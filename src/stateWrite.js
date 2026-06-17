const { writeState } = require("./state");

let writeTimer = null;
let pendingPath = null;
let pendingState = null;

function scheduleStateWrite(filePath, state, delayMs = 500) {
  pendingPath = filePath;
  pendingState = state;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeState(pendingPath, pendingState);
    writeTimer = null;
  }, delayMs);
}

function flushStateWrite() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (pendingPath && pendingState) {
    writeState(pendingPath, pendingState);
  }
}

module.exports = { scheduleStateWrite, flushStateWrite };