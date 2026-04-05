const vscode = require('vscode');
const { COMMANDS } = require('../constants');

class CodingPlanTreeProvider {
  constructor(configAdapter) {
    this.configAdapter = configAdapter;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.usageData = null;
    this.usageStats = null;
    this.language = 'zh-CN';
    this.providerName = 'CodingPlan';
  }

  setData({ usageData = null, usageStats = null, language = 'zh-CN', providerName = 'CodingPlan' }) {
    this.usageData = usageData;
    this.usageStats = usageStats;
    this.language = language;
    this.providerName = providerName;
    this.refresh();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    this.language = this.configAdapter.getLanguage();

    if (element && element.children) {
      return element.children;
    }

    const items = [];

    const providerItem = new vscode.TreeItem(
      `${this.language === 'zh-CN' ? '供应商' : 'Provider'}: ${this.providerName}`,
      vscode.TreeItemCollapsibleState.None
    );
    providerItem.iconPath = new vscode.ThemeIcon('server');
    providerItem.command = {
      command: COMMANDS.switchProvider,
      title: this.language === 'zh-CN' ? '切换供应商' : 'Switch Provider',
    };
    items.push(providerItem);

    if (this.usageStats && (this.usageStats.lastDayUsage > 0 || this.usageStats.weeklyUsage > 0 || this.usageStats.planTotalUsage > 0)) {
      const statsHeader = new vscode.TreeItem(
        this.language === 'zh-CN' ? 'Token 消耗统计' : 'Token Usage Stats',
        vscode.TreeItemCollapsibleState.Expanded
      );
      statsHeader.iconPath = new vscode.ThemeIcon('graph');
      statsHeader.children = [
        this.buildStatItem(this.language === 'zh-CN' ? '昨日消耗' : 'Yesterday', this.usageStats.lastDayUsage),
        this.buildStatItem(this.language === 'zh-CN' ? '近7天消耗' : 'Last 7 days', this.usageStats.weeklyUsage),
        this.buildStatItem(this.language === 'zh-CN' ? '当月消耗' : 'This month', this.usageStats.planTotalUsage),
      ];
      items.push(statsHeader);
    }

    const settingsItem = new vscode.TreeItem(
      this.language === 'zh-CN' ? '插件设置' : 'Settings',
      vscode.TreeItemCollapsibleState.None
    );
    settingsItem.iconPath = new vscode.ThemeIcon('settings');
    settingsItem.command = {
      command: COMMANDS.setup,
      title: this.language === 'zh-CN' ? '打开设置' : 'Open Settings',
    };
    items.push(settingsItem);

    const helpItem = new vscode.TreeItem(
      this.language === 'zh-CN' ? '使用教程' : 'Help',
      vscode.TreeItemCollapsibleState.None
    );
    helpItem.iconPath = new vscode.ThemeIcon('question');
    helpItem.command = {
      command: COMMANDS.showHelp,
      title: this.language === 'zh-CN' ? '查看使用教程' : 'View Help',
    };
    items.push(helpItem);

    const logsItem = new vscode.TreeItem(
      this.language === 'zh-CN' ? '查看日志' : 'Show Logs',
      vscode.TreeItemCollapsibleState.None
    );
    logsItem.iconPath = new vscode.ThemeIcon('output');
    logsItem.command = {
      command: COMMANDS.showLogs,
      title: this.language === 'zh-CN' ? '打开日志' : 'Show Logs',
    };
    items.push(logsItem);

    return items;
  }

  buildStatItem(label, value) {
    const item = new vscode.TreeItem(`${label}: ${this.formatNum(value)}`, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('calendar');
    return item;
  }

  formatNum(num) {
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    }
    return num.toLocaleString('zh-CN');
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}

module.exports = {
  CodingPlanTreeProvider,
};
