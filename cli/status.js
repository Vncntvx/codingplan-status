const chalk = require('chalk').default;
const dayjs = require('dayjs');
const { default: boxen } = require('boxen');
const { default: stringWidth } = require('string-width');

class StatusBar {
  constructor(data, usageStats = null, api = null, allModels = []) {
    this.data = data;
    this.usageStats = usageStats;
    this.api = api;
    this.allModels = allModels;
    this.totalWidth = 63; // 总宽度包括边框
    this.borderWidth = 4; // '│ ' (2) + ' │' = 4
  }

  // 格式化数字
  formatNumber(num) {
    if (this.api) {
      return this.api.formatNumber(num);
    }
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    }
    return num.toLocaleString("zh-CN");
  }

  // 渲染消耗统计表格
  renderConsumptionStats() {
    if (!this.usageStats) {
      return '';
    }

    const lines = [];
    lines.push('');
    lines.push(chalk.bold('📊 Token 消耗统计'));

    const leftWidth = 12;
    const rightWidth = 15;
    const padding = this.totalWidth - this.borderWidth - leftWidth - rightWidth;

    const pad = ' '.repeat(Math.max(0, padding));

    const formatLine = (label, value) => {
      return `│ ${chalk.cyan(label)}${pad}${this.formatNumber(value)}`;
    };

    lines.push(formatLine('昨日消耗: ', this.usageStats.lastDayUsage));
    lines.push(formatLine('近7天消耗: ', this.usageStats.weeklyUsage));
    lines.push(formatLine('当月消耗: ', this.usageStats.planTotalUsage));

    return lines.join('\n');
  }

  // 渲染所有模型额度区块
  renderAllModelsSection() {
    if (!this.allModels || this.allModels.length === 0) {
      return '';
    }

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
      const pct = `${model.percentage}%`;
      const usedTotal = `${model.used}/${model.total}`;

      lines.push(`  ${color(short.padEnd(15))} ${color(pct.padEnd(5))} ${color(usedTotal.padEnd(12))} ${color(status)}`);
    }

    return lines.join('\n');
  }

  padLine(leftContent, rightContent) {
    const leftClean = leftContent.replace(/\x1b\[[0-9;]*m/g, '');
    const rightClean = rightContent.replace(/\x1b\[[0-9;]*m/g, '');

    const leftLength = stringWidth(leftClean);
    const rightLength = stringWidth(rightClean);

    const contentAreaWidth = this.totalWidth - this.borderWidth;
    const totalContentLength = leftLength + rightLength;
    const paddingNeeded = Math.max(0, contentAreaWidth - totalContentLength);
    const padding = ' '.repeat(paddingNeeded);

    return `│ ${leftContent}${padding}${rightContent}`;
  }

  // 渲染配额行
  renderQuotaLine(label, quota, progressBarWidth = 30) {
    if (!quota) return null;

    const filled = Math.floor((quota.percentage / 100) * progressBarWidth);
    const empty = progressBarWidth - filled;
    const progressBar = this.createProgressBar(filled, empty, quota.percentage);

    // 计算标签视觉宽度，填充空格让进度条对齐（目标：冒号后 1 空格）
    // 最大标签宽度: "5小时:" = 6 视觉宽度
    const labelWidth = stringWidth(label);
    const targetWidth = 6; // "5小时:" 的宽度
    const padding = ' '.repeat(targetWidth - labelWidth + 1);

    // 显示已用/总额，确保视觉（进度条）与括号内数据一致为“已用”逻辑
    return `${chalk.cyan(label)}${padding}${progressBar} ${quota.percentage}% (${quota.used}/${quota.total})`;
  }

  render() {
    const { providerId, providerName, modelName, timeWindow, remaining, shortTerm, weekly, monthly, expiry } = this.data;
    const usage = shortTerm;

    const contentLines = [];

    // 标题
    contentLines.push(chalk.bold(`${providerName || 'Coding Plan'} 额度与用量`));
    contentLines.push('');

    // 判断是否为 Infini（根据 providerId 或是否有 monthly 数据）
    const isInfini = providerId === 'infini' || (monthly && !expiry);

    if (isInfini) {
      // === Infini 专用显示 ===

      // 5小时配额
      const shortTermLine = this.renderQuotaLine('5小时:', usage, 30);
      if (shortTermLine) contentLines.push(shortTermLine);

      // 7天配额
      if (weekly) {
        contentLines.push('');
        const weeklyLine = this.renderQuotaLine('7天:', weekly, 30);
        if (weeklyLine) contentLines.push(weeklyLine);
      }

      // 30天配额
      if (monthly) {
        contentLines.push('');
        const monthlyLine = this.renderQuotaLine('30天:', monthly, 30);
        if (monthlyLine) contentLines.push(monthlyLine);
      }

    } else {
      // === MiniMax 及其他供应商显示 ===

      // 模型名称
      contentLines.push(`${chalk.cyan('当前模型:')} ${modelName}`);

      // 时间窗口
      if (timeWindow && timeWindow.start && timeWindow.end) {
        const timeWindowText = `${timeWindow.start}-${timeWindow.end}(${timeWindow.timezone})`;
        contentLines.push(`${chalk.cyan('时间窗口:')} ${timeWindowText}`);
      }

      // 剩余时间
      if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
        contentLines.push(`${chalk.cyan('剩余时间:')} ${remaining.text}`);
      }

      contentLines.push('');

      // 使用百分比与进度条
      const width = 30;
      const filled = Math.floor((usage.percentage / 100) * width);
      const empty = width - filled;
      const progressBar = this.createProgressBar(filled, empty, usage.percentage);

      contentLines.push(`${chalk.cyan('已用额度:')} ${progressBar} ${usage.percentage}%`);
      contentLines.push(`${chalk.dim('     剩余:')} ${usage.remaining}/${usage.total} 次调用`);

      // 周用量（如果有数据）
      if (weekly) {
        contentLines.push('');
        if (weekly.unlimited) {
          contentLines.push(`${chalk.cyan('周限额:')} ${chalk.hex('#10B981')('不受限制')}`);
        } else {
          const weeklyPercent = weekly.percentage;
          const weeklyColor = weeklyPercent >= 85 ? chalk.hex('#EF4444') : weeklyPercent >= 60 ? chalk.hex('#F59E0B') : chalk.hex('#10B981');
          const weeklyProgress = this.createProgressBar(
            Math.floor((weeklyPercent / 100) * 15),
            15 - Math.floor((weeklyPercent / 100) * 15),
            weeklyPercent
          );
          contentLines.push(`${chalk.cyan('周限额:')} ${weeklyColor(weeklyProgress)} ${weeklyColor(weekly.percentage + '%')} (${weekly.used}/${weekly.total})`);
          // 只在有重置时间时显示
          if (weekly.text && weekly.text !== 'undefined') {
            contentLines.push(`${chalk.dim('     重置:')} ${weekly.text}`);
          }
        }
      }

      // 到期信息
      if (expiry) {
        contentLines.push('');
        const expiryText = `${expiry.date} (${expiry.text})`;
        contentLines.push(`${chalk.cyan('套餐到期:')} ${expiryText}`);
      }

      // 消耗统计
      if (this.usageStats) {
        contentLines.push(this.renderConsumptionStats());
      }

      // 所有模型额度
      if (this.allModels && this.allModels.length > 0) {
        contentLines.push(this.renderAllModelsSection());
      }
    }

    contentLines.push('');

    // 状态行
    const status = this.getStatus(usage.percentage);
    const statusColor = this.getStatusColor(status);
    contentLines.push(`${chalk.cyan('状态:')} ${statusColor}`);

    const boxenOptions = {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderColor: 'blue',
      borderStyle: 'single',
      dimBorder: true
    };

    return boxen(contentLines.join('\n'), boxenOptions);
  }

  createProgressBar(filled, empty, percentage) {
    const usedBar = '█'.repeat(filled);
    const remainingBar = '░'.repeat(empty);
    const bar = `${usedBar}${remainingBar}`;

    if (percentage >= 85) {
      return chalk.hex('#EF4444')(bar);
    } else if (percentage >= 60) {
      return chalk.hex('#F59E0B')(bar);
    } else {
      return chalk.hex('#10B981')(bar);
    }
  }

  getStatusColor(status) {
    if (status === '⚡ 注意使用') {
      return chalk.hex('#F59E0B')(status);
    } else if (status === '⛔ 即将用完') {
      return chalk.hex('#EF4444')(status);
    } else {
      return chalk.hex('#10B981')(status);
    }
  }

  getStatus(percentage) {
    if (percentage >= 85) {
      return '⛔ 即将用完';
    } else if (percentage >= 60) {
      return '⚡ 注意使用';
    } else {
      return '✓ 正常使用';
    }
  }

  renderCompact() {
    const { providerId, shortTerm, remaining, modelName, expiry, providerName, weekly, monthly } = this.data;
    const usage = shortTerm;
    const status = this.getStatus(usage.percentage);
    const isInfini = providerId === 'infini' || (monthly && !expiry);

    let color;
    if (usage.percentage >= 85) {
      color = chalk.hex('#EF4444');
    } else if (usage.percentage >= 60) {
      color = chalk.hex('#F59E0B');
    } else {
      color = chalk.hex('#10B981');
    }

    if (isInfini) {
      // Infini 紧凑模式：括号内显示已用/总额以保持一致
      let extraInfo = '';
      if (weekly) {
        extraInfo = ` ${chalk.gray('•')} 7天:${weekly.percentage}%`;
      }
      return `${color('●')} ${providerName || 'Infini'} ${usage.percentage}% ${chalk.dim(`(${usage.used}/${usage.total})`)}${extraInfo} ${chalk.gray('•')} ${status}`;
    } else {
      // MiniMax 紧凑模式
      const expiryInfo = expiry ? ` ${chalk.gray('•')} 剩${expiry.daysRemaining}天` : '';
      const remainingText = remaining && (remaining.hours > 0 || remaining.minutes > 0)
        ? `${remaining.hours > 0 ? remaining.hours + 'h' : ''}${remaining.minutes}m`
        : '';

      return `${color('●')} ${modelName} ${usage.percentage}% ${chalk.dim(`(${usage.used}/${usage.total})`)} ${remainingText ? chalk.gray('•') + ' ' + remainingText : ''} ${chalk.gray('•')} ${status}${expiryInfo}`;
    }
  }
}

module.exports = StatusBar;
