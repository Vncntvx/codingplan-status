const COMMANDS = Object.freeze({
  setup: 'codingplanStatus.setup',
  refresh: 'codingplanStatus.refresh',
  switchProvider: 'codingplanStatus.switchProvider',
  showHelp: 'codingplanStatus.showHelp',
  showInfo: 'codingplanStatus.showInfo',
  showLogs: 'codingplanStatus.showLogs',
});

const OUTPUT_CHANNEL_NAME = 'CodingPlan Status';

module.exports = {
  COMMANDS,
  OUTPUT_CHANNEL_NAME,
};
