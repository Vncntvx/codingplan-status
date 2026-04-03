#!/usr/bin/env node

const chalk = require('chalk').default;
const readline = require('readline');
const { getConfigManager } = require('./config-manager');
const { createProvider } = require('./providers');

class StatusBar {
  constructor(data) {
    this.data = data;
  }

  render() {
    const { shortTerm, remaining, modelName, weekly, providerName } = this.data;
    const usage = shortTerm;
    const percentage = usage.percentage;

    // 基于已使用百分比：使用越多越危险
    let color = chalk.green;
    if (percentage >= 85) {
      color = chalk.red;
    } else if (percentage >= 60) {
      color = chalk.yellow;
    }

    const statusIcon = percentage >= 85 ? '⚠' : percentage >= 60 ? '⚡' : '✓';

    let remainingText = '';
    if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
      remainingText = remaining.hours > 0
        ? `${remaining.hours}h${remaining.minutes}m`
        : `${remaining.minutes}m`;
    }

    let weeklyStr = '';
    if (weekly) {
      if (weekly.unlimited) {
        weeklyStr = ` ${chalk.blue('W')} ♾️`;
      } else {
        const weeklyColor = weekly.percentage >= 85 ? chalk.red : weekly.percentage >= 60 ? chalk.yellow : chalk.green;
        weeklyStr = ` ${chalk.blue('W')} ${weeklyColor(weekly.percentage + '%')}`;
      }
    }

    return `${color('●')} ${modelName} ${color(percentage + '%')} (${usage.used}/${usage.total}) ${remainingText}${weeklyStr} ${statusIcon}`;
  }
}

class TerminalStatusBar {
  constructor() {
    this.configManager = getConfigManager();
    this.currentLine = '';
    this.isActive = false;
  }

  async start() {
    const providerId = this.configManager.getCurrentProviderId();

    if (!providerId) {
      console.log(chalk.red('错误：未配置供应商'));
      console.log(chalk.yellow('请先运行: cps auth <provider> <token>'));
      process.exit(1);
    }

    this.isActive = true;
    console.log(chalk.green(`✓ ${providerId} 状态栏已启动`));
    console.log(chalk.gray('按 Ctrl+C 退出\n'));

    // 隐藏光标
    process.stdout.write('\x1B[?25l');
    this.startUpdating();
  }

  async startUpdating() {
    const update = async () => {
      if (!this.isActive) return;

      try {
        const providerId = this.configManager.getCurrentProviderId();
        const credentials = this.configManager.getProviderCredentials(providerId);
        const provider = createProvider(providerId, credentials);

        const apiData = await provider.fetchUsageData();

        let usageData;
        if (provider.constructor.id === 'minimax') {
          const subscriptionData = await provider.getSubscriptionDetails();
          usageData = provider.parseWithExpiry(apiData, subscriptionData);
        } else {
          usageData = provider.parseUsageData(apiData);
        }

        const statusBar = new StatusBar(usageData);
        const newLine = statusBar.render();

        // 清除上一行并显示新状态
        if (this.currentLine) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
        }

        process.stdout.write(newLine);
        this.currentLine = newLine;

        // 移动光标到底部下一行
        process.stdout.write('\n');
        readline.cursorTo(process.stdout, 0);

      } catch (error) {
        // 显示错误但不退出
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(chalk.red(`错误: ${error.message}`));
        process.stdout.write('\n');
        readline.cursorTo(process.stdout, 0);
      }
    };

    // 立即更新一次
    await update();

    // 每 10 秒更新（近实时）
    setInterval(update, 10000);

    // 处理 Ctrl+C
    process.on('SIGINT', () => {
      this.stop();
    });

    // 处理进程退出
    process.on('exit', () => {
      this.cleanup();
    });
  }

  stop() {
    this.isActive = false;
    console.log(chalk.yellow('\n\n状态栏已停止'));
    this.cleanup();
    process.exit(0);
  }

  cleanup() {
    // 显示光标
    process.stdout.write('\x1B[?25h');

    // 清除状态行
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  }
}

// 直接运行此文件时
if (require.main === module) {
  const statusBar = new TerminalStatusBar();
  statusBar.start().catch(error => {
    console.error(chalk.red('启动失败:'), error.message);
    process.exit(1);
  });
}

module.exports = TerminalStatusBar;
