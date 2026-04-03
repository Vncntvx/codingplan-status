const chalk = require('chalk').default;
const dayjs = require('dayjs');
const { default: boxen } = require('boxen');
const { default: stringWidth } = require('string-width');
const { renderCompact: renderCompactBar } = require('./renderers');

const LAYOUT = {
  PROGRESS_BAR_WIDTH: 30,
  COLON: ':',
  COLON_SPACE: ' ',
};

class StatusBar {
  constructor(data, usageStats = null, api = null, allModels = []) {
    this.data = data;
    this.usageStats = usageStats;
    this.api = api;
    this.allModels = allModels;
  }

  padLabel(label, targetWidth) {
    const visualWidth = stringWidth(label);
    const padding = ' '.repeat(Math.max(0, targetWidth - visualWidth));
    return label + padding;
  }

  getMaxLabelWidth(labels) {
    return Math.max(...labels.map(l => stringWidth(l)));
  }

  renderMetricRow(label, quota, labelWidth) {
    if (!quota) return null;
    const paddedLabel = this.padLabel(label, labelWidth);
    const progressBar = this.createProgressBar(quota.percentage, LAYOUT.PROGRESS_BAR_WIDTH);
    const usageText = `${quota.percentage}% (${quota.used}/${quota.total})`;
    return `${chalk.cyan(paddedLabel)}${LAYOUT.COLON}${LAYOUT.COLON_SPACE}${progressBar} ${usageText}`;
  }

  renderStatusRow(label, statusText, labelWidth) {
    const paddedLabel = this.padLabel(label, labelWidth);
    return `${chalk.cyan(paddedLabel)}${LAYOUT.COLON}${LAYOUT.COLON_SPACE}${statusText}`;
  }

  renderKeyValueRow(label, value, labelWidth) {
    const paddedLabel = this.padLabel(label, labelWidth);
    return `${chalk.cyan(paddedLabel)}${LAYOUT.COLON}${LAYOUT.COLON_SPACE}${value}`;
  }

  formatNumber(num) {
    if (this.api) return this.api.formatNumber(num);
    if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    return num.toLocaleString("zh-CN");
  }

  createProgressBar(percentage, width = LAYOUT.PROGRESS_BAR_WIDTH) {
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if (percentage >= 85) return chalk.hex('#EF4444')(bar);
    if (percentage >= 60) return chalk.hex('#F59E0B')(bar);
    return chalk.hex('#10B981')(bar);
  }

  getStatus(percentage) {
    if (percentage >= 85) return '⛔ 即将用完';
    if (percentage >= 60) return '⚡ 注意使用';
    return '✓ 正常使用';
  }

  getStatusColor(status) {
    if (status === '⚡ 注意使用') return chalk.hex('#F59E0B')(status);
    if (status === '⛔ 即将用完') return chalk.hex('#EF4444')(status);
    return chalk.hex('#10B981')(status);
  }

  renderInfiniStatus() {
    const { providerName, shortTerm, weekly, monthly } = this.data;
    const lines = [];

    const labels = ['5小时', '周限额', '月限额', '状态'];
    const labelWidth = this.getMaxLabelWidth(labels);

    lines.push(chalk.bold(`${providerName || 'Infini AI'} 额度与用量`));
    lines.push('');

    const shortTermLine = this.renderMetricRow('5小时', shortTerm, labelWidth);
    if (shortTermLine) lines.push(shortTermLine);

    if (weekly) {
      lines.push('');
      const weeklyLine = this.renderMetricRow('周限额', weekly, labelWidth);
      if (weeklyLine) lines.push(weeklyLine);
    }

    if (monthly) {
      lines.push('');
      const monthlyLine = this.renderMetricRow('月限额', monthly, labelWidth);
      if (monthlyLine) lines.push(monthlyLine);
    }

    lines.push('');
    const status = this.getStatus(shortTerm.percentage);
    lines.push(this.renderStatusRow('状态', this.getStatusColor(status), labelWidth));

    return lines;
  }

  renderMiniMaxStatus() {
    const { providerName, modelName, timeWindow, remaining, shortTerm, weekly, expiry } = this.data;
    const usage = shortTerm;
    const lines = [];

    lines.push(chalk.bold(`${providerName || 'MiniMax'} 额度与用量`));
    lines.push('');

    // 基本信息
    const infoLabels = ['模型', '时间窗', '重置'];
    const infoLabelWidth = this.getMaxLabelWidth(infoLabels);

    lines.push(this.renderKeyValueRow('模型', modelName, infoLabelWidth));

    if (timeWindow && timeWindow.start && timeWindow.end) {
      lines.push(this.renderKeyValueRow('时间窗', `${timeWindow.start}-${timeWindow.end} (${timeWindow.timezone})`, infoLabelWidth));
    }

    if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
      lines.push(this.renderKeyValueRow('重置', remaining.text, infoLabelWidth));
    }

    lines.push('');

    // 配额信息
    const quotaLabels = ['5小时', '剩余', '周限额', '周重置', '到期', '状态'];
    const quotaLabelWidth = this.getMaxLabelWidth(quotaLabels);

    const shortTermLine = this.renderMetricRow('5小时', usage, quotaLabelWidth);
    if (shortTermLine) lines.push(shortTermLine);

    if (usage.remaining !== undefined) {
      lines.push(this.renderKeyValueRow('剩余', `${usage.remaining}/${usage.total} 次`, quotaLabelWidth));
    }

    if (weekly) {
      lines.push('');
      if (weekly.unlimited) {
        lines.push(this.renderKeyValueRow('周限额', chalk.hex('#10B981')('不受限制'), quotaLabelWidth));
      } else {
        const weeklyLine = this.renderMetricRow('周限额', weekly, quotaLabelWidth);
        if (weeklyLine) lines.push(weeklyLine);
        if (weekly.text && weekly.text !== 'undefined') {
          lines.push(this.renderKeyValueRow('周重置', weekly.text, quotaLabelWidth));
        }
      }
    }

    if (expiry) {
      lines.push('');
      lines.push(this.renderKeyValueRow('到期', `${expiry.date} (${expiry.text})`, quotaLabelWidth));
    }

    if (this.usageStats) lines.push(this.renderConsumptionStats());
    if (this.allModels && this.allModels.length > 0) lines.push(this.renderAllModelsSection());

    lines.push('');
    const status = this.getStatus(usage.percentage);
    lines.push(this.renderStatusRow('状态', this.getStatusColor(status), quotaLabelWidth));

    return lines;
  }

  renderConsumptionStats() {
    if (!this.usageStats) return '';

    const lines = [];
    lines.push('');
    lines.push(chalk.bold('📊 Token 消耗统计'));

    const labels = ['昨日消耗', '近7天消耗', '当月消耗'];
    const labelWidth = this.getMaxLabelWidth(labels);

    lines.push(this.renderKeyValueRow('昨日消耗', this.formatNumber(this.usageStats.lastDayUsage), labelWidth));
    lines.push(this.renderKeyValueRow('近7天消耗', this.formatNumber(this.usageStats.weeklyUsage), labelWidth));
    lines.push(this.renderKeyValueRow('当月消耗', this.formatNumber(this.usageStats.planTotalUsage), labelWidth));

    return lines.join('\n');
  }

  renderAllModelsSection() {
    if (!this.allModels || this.allModels.length === 0) return '';

    const lines = [];
    lines.push('');
    lines.push(chalk.bold('📋 所有模型额度'));

    const shortName = (name) => {
      if (name.includes('MiniMax-M')) return 'MiniMax-M*';
      if (name.includes('speech')) return 'speech-hd';
      if (name.includes('Hailuo-2.3-Fast')) return 'Hailuo';
      if (name.includes('Hailuo-2.3')) return 'Hailuo-2.3';
      if (name.includes('Hailuo')) return 'Hailuo';
      if (name.includes('music')) return 'music';
      if (name.includes('image')) return 'image';
      return name.length > 15 ? name.substring(0, 12) + '...' : name;
    };

    const getStatusColor = (percentage) => {
      if (percentage >= 85) return chalk.hex('#EF4444');
      if (percentage >= 60) return chalk.hex('#F59E0B');
      return chalk.hex('#10B981');
    };

    const getStatusText = (percentage) => {
      if (percentage >= 85) return '⛔';
      if (percentage >= 60) return '⚡';
      return '✓';
    };

    for (const model of this.allModels) {
      const short = shortName(model.name);
      const color = getStatusColor(model.percentage);
      const status = getStatusText(model.percentage);
      lines.push(`  ${color(short.padEnd(15))} ${color(`${model.percentage}%`.padEnd(5))} ${color(`${model.used}/${model.total}`.padEnd(12))} ${color(status)}`);
    }

    return lines.join('\n');
  }

  render() {
    const { providerId, monthly, expiry } = this.data;
    const isInfini = providerId === 'infini' || (monthly && !expiry);

    const contentLines = isInfini ? this.renderInfiniStatus() : this.renderMiniMaxStatus();

    return boxen(contentLines.join('\n'), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderColor: 'blue',
      borderStyle: 'single',
      dimBorder: true
    });
  }

  renderCompact() {
    return renderCompactBar(this.data);
  }
}

module.exports = StatusBar;
