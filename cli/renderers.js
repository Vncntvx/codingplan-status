const chalk = require('chalk').default;

/**
 * 渲染紧凑格式用量条
 * @param {Object} data - usageData
 * @returns {string}
 */
function renderCompact(data) {
  if (!data) return '';

  const { shortTerm, weekly } = data;
  const pct5h = shortTerm ? shortTerm.percentage || 0 : 0;
  const pct7d = weekly ? weekly.percentage || 0 : 0;

  const getBarColor = (percent, is5h) => {
    if (is5h) {
      if (percent >= 85) return chalk.hex('#991B1B'); // muted red
      if (percent >= 60) return chalk.hex('#B45309'); // muted amber
    } else {
      if (percent >= 90) return chalk.hex('#991B1B');
      if (percent >= 75) return chalk.hex('#B45309');
    }
    return chalk.hex('#065F46'); // muted green
  };

  const renderBar = (percent, is5h) => {
    const length = 10;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    const filled = Math.round((p / 100) * length);
    const colorFn = getBarColor(percent, is5h);
    return colorFn('█'.repeat(filled)) + chalk.dim('░'.repeat(length - filled));
  };

  const text5h = `${chalk.dim('5h')} ${pct5h.toString().padStart(3, ' ')}% ${renderBar(pct5h, true)}`;

  if (weekly) {
    const text7d = `${chalk.dim('7d')} ${pct7d.toString().padStart(3, ' ')}% ${renderBar(pct7d, false)}`;
    return ` ${text5h}      ${text7d}`;
  }
  return ` ${text5h}`;
}

/**
 * 渲染极简格式用量标识
 * @param {Object} data - usageData
 * @returns {string}
 */
function renderMinimal(data) {
  if (!data || !data.shortTerm) return '';

  const percentage = data.shortTerm.percentage;

  let color = chalk.green;
  if (percentage >= 85) color = chalk.red;
  else if (percentage >= 60) color = chalk.yellow;

  return color(`[${data.providerId || 'CP'}:${percentage}%]`);
}

module.exports = {
  renderCompact,
  renderMinimal,
};
