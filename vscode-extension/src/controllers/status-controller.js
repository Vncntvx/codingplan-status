const vscode = require('vscode');
const { COMMANDS } = require('../constants');

class StatusController {
  constructor({ statusBarItem, treeProvider, providerManager, configAdapter, daemonClient, logger }) {
    this.statusBarItem = statusBarItem;
    this.treeProvider = treeProvider;
    this.providerManager = providerManager;
    this.configAdapter = configAdapter;
    this.daemonClient = daemonClient;
    this.logger = logger;
    this.latestUsageData = null;
  }

  async refresh({ forceRefresh = false, reason = 'unknown' } = {}) {
    const language = this.configAdapter.getLanguage();
    const providerName = this.providerManager.getCurrentProviderName();

    if (!this.providerManager.isConfigured()) {
      this.latestUsageData = null;
      this.showNotConfiguredState(language);
      this.treeProvider.setData({ usageData: null, usageStats: null, language, providerName });
      return null;
    }

    try {
      const daemonData = await this.daemonClient.fetchStatus({ forceRefresh });
      const usageData = daemonData.usage;
      if (!usageData) {
        throw new Error(language === 'en-US' ? 'No data available' : '无数据');
      }

      this.latestUsageData = usageData;
      this.updateStatusBar(usageData, providerName, language);
      this.treeProvider.setData({
        usageData,
        usageStats: usageData.usageStats || null,
        language,
        providerName,
      });

      this.logger.info('Status updated', {
        reason,
        forceRefresh,
        source: daemonData.source,
        cacheAgeMs: daemonData.cache?.age,
        providerId: usageData.providerId,
      });
      return usageData;
    } catch (error) {
      this.latestUsageData = null;
      this.statusBarItem.text = '$(warning) CodingPlan';
      this.statusBarItem.tooltip = `${language === 'en-US' ? 'Error' : '错误'}: ${error.message}`;
      this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
      this.statusBarItem.command = COMMANDS.refresh;
      this.treeProvider.setData({ usageData: null, usageStats: null, language, providerName });
      this.logger.error('Failed to fetch status', { reason, error: error.message });
      throw error;
    }
  }

  async showInfo() {
    const language = this.configAdapter.getLanguage();
    if (!this.providerManager.isConfigured()) {
      vscode.window.showInformationMessage(
        language === 'zh-CN' ? '请先配置供应商' : 'Please configure a provider first'
      );
      return;
    }

    const usageData = this.latestUsageData || await this.refresh({ reason: 'show-info' }).catch(() => null);
    if (!usageData) {
      vscode.window.showWarningMessage(
        language === 'zh-CN' ? '无法获取数据' : 'Unable to fetch data'
      );
      return;
    }

    const providerName = this.providerManager.getCurrentProviderName();
    const lines = this.buildInfoLines(usageData);
    vscode.window.showInformationMessage(`${providerName}\n${lines.join('\n')}`);
  }

  showNotConfiguredState(language) {
    const notConfiguredText = language === 'en-US' ? 'Click to configure' : '点击配置';
    this.statusBarItem.text = '$(warning) CodingPlan';
    this.statusBarItem.tooltip = `CodingPlan Status\n${notConfiguredText}`;
    this.statusBarItem.color = new vscode.ThemeColor('warningForeground');
    this.statusBarItem.command = COMMANDS.setup;
  }

  updateStatusBar(data, providerName, language) {
    const { shortTerm, remaining } = data;
    const percentage = shortTerm?.percentage || 0;

    let text = `${providerName}: ${percentage}%`;
    if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
      const hourText = remaining.hours > 0 ? `${remaining.hours}h` : '';
      text += ` · ${hourText}${remaining.minutes}m`;
    }

    this.statusBarItem.text = `$(clock) ${text}`;
    this.statusBarItem.color = percentage >= 85 ? new vscode.ThemeColor('errorForeground') : undefined;
    this.statusBarItem.command = COMMANDS.showInfo;

    if (this.configAdapter.shouldShowTooltip()) {
      this.statusBarItem.tooltip = this.buildTooltip(data, providerName, language);
      return;
    }
    this.statusBarItem.tooltip = providerName;
  }

  buildTooltip(data, providerName) {
    const { providerId, shortTerm, weekly, monthly, remaining, modelName, timeWindow, expiry } = data;
    const md = new vscode.MarkdownString();
    md.supportHtml = true;
    md.appendMarkdown(`**${providerName}**\n\n`);

    const isInfini = providerId === 'infini' || (monthly && !expiry);

    if (isInfini) {
      if (shortTerm) md.appendMarkdown(`5小时: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})\n\n`);
      if (weekly) md.appendMarkdown(`周限额: ${weekly.percentage}% (${weekly.used}/${weekly.total})\n\n`);
      if (monthly) md.appendMarkdown(`月限额: ${monthly.percentage}% (${monthly.used}/${monthly.total})\n`);
      return md;
    }

    if (modelName) md.appendMarkdown(`模型: ${modelName}\n`);
    if (timeWindow?.start && timeWindow?.end) {
      md.appendMarkdown(`时间窗: ${timeWindow.start}-${timeWindow.end} (${timeWindow.timezone})\n`);
    }
    if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
      md.appendMarkdown(`重置: ${remaining.text}\n`);
    }
    md.appendMarkdown('\n');

    if (shortTerm) {
      md.appendMarkdown(`5小时: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})\n`);
      if (shortTerm.remaining !== undefined) {
        md.appendMarkdown(`剩余: ${shortTerm.remaining}/${shortTerm.total} 次\n`);
      }
    }

    if (weekly) {
      md.appendMarkdown('\n');
      md.appendMarkdown(weekly.unlimited ? '周限额: 不受限制\n' : `周限额: ${weekly.percentage}%\n`);
    }

    if (expiry) {
      const expiryText = typeof expiry === 'string' ? expiry : (expiry.text || expiry.date);
      md.appendMarkdown(`\n到期: ${expiryText}\n`);
    }

    return md;
  }

  buildInfoLines(data) {
    const { providerId, shortTerm, weekly, monthly, remaining, modelName, timeWindow, expiry } = data;
    const isInfini = providerId === 'infini' || (monthly && !expiry);
    const lines = [];

    if (isInfini) {
      if (shortTerm) lines.push(`5小时: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})`);
      if (weekly) lines.push(`周限额: ${weekly.percentage}% (${weekly.used}/${weekly.total})`);
      if (monthly) lines.push(`月限额: ${monthly.percentage}% (${monthly.used}/${monthly.total})`);
      return lines;
    }

    if (modelName) lines.push(`模型: ${modelName}`);
    if (timeWindow?.start && timeWindow?.end) {
      lines.push(`时间窗: ${timeWindow.start}-${timeWindow.end} (${timeWindow.timezone})`);
    }
    if (remaining?.text) lines.push(`重置: ${remaining.text}`);
    if (shortTerm) {
      lines.push(`5小时: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})`);
      if (shortTerm.remaining !== undefined) lines.push(`剩余: ${shortTerm.remaining}/${shortTerm.total} 次`);
    }
    if (weekly) lines.push(weekly.unlimited ? '周限额: 不受限制' : `周限额: ${weekly.percentage}%`);
    if (expiry) {
      const expiryText = typeof expiry === 'string' ? expiry : (expiry.text || expiry.date);
      lines.push(`到期: ${expiryText}`);
    }
    return lines;
  }
}

module.exports = {
  StatusController,
};
