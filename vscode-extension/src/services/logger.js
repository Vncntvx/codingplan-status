const vscode = require('vscode');
const { OUTPUT_CHANNEL_NAME } = require('../constants');

class Logger {
  constructor() {
    this.channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }

  info(message, meta) {
    this.write('INFO', message, meta);
  }

  warn(message, meta) {
    this.write('WARN', message, meta);
  }

  error(message, meta) {
    this.write('ERROR', message, meta);
  }

  write(level, message, meta) {
    const ts = new Date().toISOString();
    if (meta !== undefined) {
      this.channel.appendLine(`[${ts}] [${level}] ${message} ${this.stringify(meta)}`);
      return;
    }
    this.channel.appendLine(`[${ts}] [${level}] ${message}`);
  }

  stringify(data) {
    if (typeof data === 'string') {
      return data;
    }
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  show(preserveFocus = false) {
    this.channel.show(preserveFocus);
  }

  dispose() {
    this.channel.dispose();
  }
}

module.exports = {
  Logger,
};
