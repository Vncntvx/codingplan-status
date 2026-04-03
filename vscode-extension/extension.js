const vscode = require('vscode');
const { getProviderManager } = require('./src/provider-manager');
const { getConfigAdapter } = require('./src/config-adapter');

// TreeView data provider for sidebar
class CodingPlanTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.usageData = null;
    this.usageStats = null;
    this.language = 'zh-CN';
  }

  setData(usageData, usageStats, language) {
    this.usageData = usageData;
    this.usageStats = usageStats;
    this.language = language;
    this.refresh();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    const configAdapter = getConfigAdapter();
    this.language = configAdapter.getLanguage();

    if (element && element.children) {
      return element.children;
    }

    const items = [];
    const providerManager = getProviderManager();
    const currentProviderName = providerManager.getCurrentProviderName();
    const currentProviderId = providerManager.getCurrentProviderId();

    // Provider selector
    const providerItem = new vscode.TreeItem(
      `${this.language === 'zh-CN' ? '供应商' : 'Provider'}: ${currentProviderName}`,
      vscode.TreeItemCollapsibleState.None
    );
    providerItem.iconPath = new vscode.ThemeIcon('server');
    providerItem.command = {
      command: 'codingplanStatus.switchProvider',
      title: this.language === 'zh-CN' ? '切换供应商' : 'Switch Provider'
    };
    items.push(providerItem);

    // Token usage stats (if available)
    if (this.usageStats && (this.usageStats.lastDayUsage > 0 || this.usageStats.weeklyUsage > 0 || this.usageStats.planTotalUsage > 0)) {
      const statsHeader = new vscode.TreeItem(
        this.language === 'zh-CN' ? 'Token 消耗统计' : 'Token Usage Stats',
        vscode.TreeItemCollapsibleState.Expanded
      );
      statsHeader.iconPath = new vscode.ThemeIcon('graph');
      statsHeader.children = [];

      const yesterday = new vscode.TreeItem(
        `${this.language === 'zh-CN' ? '昨日消耗' : 'Yesterday'}: ${this.formatNum(this.usageStats.lastDayUsage)}`,
        vscode.TreeItemCollapsibleState.None
      );
      yesterday.iconPath = new vscode.ThemeIcon('calendar');
      statsHeader.children.push(yesterday);

      const weekly = new vscode.TreeItem(
        `${this.language === 'zh-CN' ? '近7天消耗' : 'Last 7 days'}: ${this.formatNum(this.usageStats.weeklyUsage)}`,
        vscode.TreeItemCollapsibleState.None
      );
      weekly.iconPath = new vscode.ThemeIcon('calendar');
      statsHeader.children.push(weekly);

      const monthly = new vscode.TreeItem(
        `${this.language === 'zh-CN' ? '当月消耗' : 'This month'}: ${this.formatNum(this.usageStats.planTotalUsage)}`,
        vscode.TreeItemCollapsibleState.None
      );
      monthly.iconPath = new vscode.ThemeIcon('calendar');
      statsHeader.children.push(monthly);

      items.push(statsHeader);
    }

    // Settings
    const settingsItem = new vscode.TreeItem(
      this.language === 'zh-CN' ? '插件设置' : 'Settings',
      vscode.TreeItemCollapsibleState.None
    );
    settingsItem.command = {
      command: 'codingplanStatus.setup',
      title: this.language === 'zh-CN' ? '打开设置' : 'Open Settings'
    };
    settingsItem.iconPath = new vscode.ThemeIcon('settings');
    items.push(settingsItem);

    // Help
    const helpItem = new vscode.TreeItem(
      this.language === 'zh-CN' ? '使用教程' : 'Help',
      vscode.TreeItemCollapsibleState.None
    );
    helpItem.command = {
      command: 'codingplanStatus.showHelp',
      title: this.language === 'zh-CN' ? '查看使用教程' : 'View Help'
    };
    helpItem.iconPath = new vscode.ThemeIcon('question');
    items.push(helpItem);

    return items;
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

// Activate function - entry point for the extension
function activate(context) {
  try {
    const providerManager = getProviderManager();
    const configAdapter = getConfigAdapter();

    // Initialize provider manager
    providerManager.initialize().catch(err => {
      console.error('Failed to initialize provider manager:', err.message);
    });

    // Check for migration from old settings
    configAdapter.migrateFromOldSettings().then(migrated => {
      if (migrated) {
        providerManager.initialize();
      }
    });

    // Create TreeView for sidebar
    const treeProvider = new CodingPlanTreeProvider();
    const treeView = vscode.window.createTreeView('codingplanStatusView', {
      treeDataProvider: treeProvider
    });

    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
      'codingplanStatus',
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.name = 'CodingPlan Status';
    statusBarItem.command = 'codingplanStatus.refresh';
    statusBarItem.show();

    let intervalId;

    const updateStatus = async () => {
      const language = configAdapter.getLanguage();

      try {
        // Check if provider is configured
        if (!providerManager.isConfigured()) {
          const notConfiguredText = language === 'en-US' ? 'Click to configure' : '点击配置';
          statusBarItem.text = `$(warning) CodingPlan`;
          statusBarItem.tooltip = `CodingPlan Status\n${notConfiguredText}`;
          statusBarItem.color = new vscode.ThemeColor('warningForeground');
          statusBarItem.command = 'codingplanStatus.setup';
          return;
        }

        // Fetch usage data
        const usageData = await providerManager.fetchUsageData();

        if (!usageData) {
          throw new Error(language === 'en-US' ? 'No data available' : '无数据');
        }

        // Update status bar
        updateStatusBar(statusBarItem, usageData, providerManager.getCurrentProviderName(), language);

        // Update tree view
        treeProvider.setData(usageData, usageData.usageStats || null, language);

      } catch (error) {
        console.error('Failed to fetch status:', error.message);
        const errorText = language === 'en-US' ? 'Error' : '错误';
        statusBarItem.text = `$(warning) CodingPlan`;
        statusBarItem.tooltip = `${errorText}: ${error.message}`;
        statusBarItem.color = new vscode.ThemeColor('errorForeground');
      }
    };

    // Initial update
    updateStatus();

    // Set up interval
    const interval = configAdapter.getRefreshInterval() * 1000;
    intervalId = setInterval(updateStatus, interval);

    // Register commands
    const refreshDisposable = vscode.commands.registerCommand(
      'codingplanStatus.refresh',
      updateStatus
    );

    const setupDisposable = vscode.commands.registerCommand(
      'codingplanStatus.setup',
      async () => {
        const panel = await showSettingsWebView(context, providerManager, configAdapter, updateStatus);
        context.subscriptions.push(panel);
      }
    );

    const switchProviderDisposable = vscode.commands.registerCommand(
      'codingplanStatus.switchProvider',
      async () => {
        const providers = providerManager.getAvailableProviders();
        const configured = providerManager.getConfiguredProviders();

        const items = providers.map(p => ({
          label: p.displayName,
          description: configured.includes(p.id) ? '✓' : '',
          id: p.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: language === 'zh-CN' ? '选择供应商' : 'Select provider'
        });

        if (selected) {
          // Check if provider is configured
          if (!configured.includes(selected.id)) {
            // Open settings to configure
            const configure = language === 'zh-CN' ? '配置' : 'Configure';
            const later = language === 'zh-CN' ? '稍后' : 'Later';
            const choice = await vscode.window.showInformationMessage(
              `${selected.label} ${language === 'zh-CN' ? '未配置' : 'is not configured'}`,
              configure,
              later
            );
            if (choice === configure) {
              vscode.commands.executeCommand('codingplanStatus.setup');
            }
            return;
          }

          providerManager.switchProvider(selected.id);
          updateStatus();
        }
      }
    );

    const helpDisposable = vscode.commands.registerCommand(
      'codingplanStatus.showHelp',
      async () => {
        const panel = await showHelpWebView(context, configAdapter);
        context.subscriptions.push(panel);
      }
    );

    const showInfoDisposable = vscode.commands.registerCommand(
      'codingplanStatus.showInfo',
      async () => {
        const language = configAdapter.getLanguage();
        if (!providerManager.isConfigured()) {
          vscode.window.showInformationMessage(
            language === 'zh-CN' ? '请先配置供应商' : 'Please configure a provider first'
          );
          return;
        }

        try {
          const usageData = await providerManager.fetchUsageData();
          if (!usageData) {
            vscode.window.showWarningMessage(
              language === 'zh-CN' ? '无法获取数据' : 'Unable to fetch data'
            );
            return;
          }

          const { providerId, shortTerm, weekly, monthly, remaining, modelName, timeWindow, expiry } = usageData;
          const providerName = providerManager.getCurrentProviderName();
          const isInfini = providerId === 'infini' || (monthly && !expiry);

          const lines = [];

          if (isInfini) {
            const labels = ['5小时', '周限额', '月限额'];
            const labelWidth = Math.max(...labels.map(l => l.length));
            const pad = (s) => s.padEnd(labelWidth, ' ');

            if (shortTerm) {
              lines.push(`${pad('5小时')}: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})`);
            }
            if (weekly) {
              lines.push(`${pad('周限额')}: ${weekly.percentage}% (${weekly.used}/${weekly.total})`);
            }
            if (monthly) {
              lines.push(`${pad('月限额')}: ${monthly.percentage}% (${monthly.used}/${monthly.total})`);
            }
          } else {
            const infoLabels = ['模型', '时间窗', '重置'];
            const quotaLabels = ['5小时', '剩余', '周限额'];
            const infoWidth = Math.max(...infoLabels.map(l => l.length));
            const quotaWidth = Math.max(...quotaLabels.map(l => l.length));

            const padInfo = (s) => s.padEnd(infoWidth, ' ');
            const padQuota = (s) => s.padEnd(quotaWidth, ' ');

            if (modelName) {
              lines.push(`${padInfo('模型')}: ${modelName}`);
            }
            if (timeWindow && timeWindow.start && timeWindow.end) {
              lines.push(`${padInfo('时间窗')}: ${timeWindow.start}-${timeWindow.end} (${timeWindow.timezone})`);
            }
            if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
              lines.push(`${padInfo('重置')}: ${remaining.text}`);
            }

            if (shortTerm) {
              lines.push(`${padQuota('5小时')}: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})`);
            }
            if (shortTerm && shortTerm.remaining !== undefined) {
              lines.push(`${padQuota('剩余')}: ${shortTerm.remaining}/${shortTerm.total} 次`);
            }
            if (weekly) {
              if (weekly.unlimited) {
                lines.push(`${padQuota('周限额')}: 不受限制`);
              } else {
                lines.push(`${padQuota('周限额')}: ${weekly.percentage}%`);
              }
            }
            if (expiry) {
              const expiryText = typeof expiry === 'string' ? expiry : (expiry.text || expiry.date);
              lines.push(`到期: ${expiryText}`);
            }
          }

          vscode.window.showInformationMessage(`${providerName}\n${lines.join('\n')}`);
        } catch (error) {
          vscode.window.showErrorMessage(error.message);
        }
      }
    );

    // Configuration change listener
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('codingplanStatus')) {
          const newInterval = configAdapter.getRefreshInterval() * 1000;
          clearInterval(intervalId);
          intervalId = setInterval(updateStatus, newInterval);
          treeProvider.refresh();
        }
      }
    );

    // Add to subscriptions
    context.subscriptions.push(
      statusBarItem,
      treeView,
      refreshDisposable,
      setupDisposable,
      switchProviderDisposable,
      helpDisposable,
      showInfoDisposable,
      configChangeDisposable
    );

    // Show welcome message if first time
    if (configAdapter.isFirstTime()) {
      setTimeout(() => {
        const language = configAdapter.getLanguage();
        vscode.window
          .showInformationMessage(
            language === 'zh-CN'
              ? '欢迎使用 CodingPlan Status！需要配置供应商凭据才能开始使用。'
              : 'Welcome to CodingPlan Status! Please configure provider credentials to get started.',
            language === 'zh-CN' ? '立即配置' : 'Configure Now',
            language === 'zh-CN' ? '稍后设置' : 'Later'
          )
          .then((selection) => {
            if (selection === (language === 'zh-CN' ? '立即配置' : 'Configure Now')) {
              vscode.commands.executeCommand('codingplanStatus.setup');
            }
          });
      }, 2000);
    }

  } catch (error) {
    console.error('CodingPlan Status extension activation failed:', error.message);
    vscode.window.showErrorMessage(
      'CodingPlan Status extension activation failed: ' + error.message
    );
  }
}

function updateStatusBar(statusBarItem, data, providerName, language) {
  const { providerId, shortTerm, weekly, monthly, remaining, modelName, timeWindow, expiry } = data;
  const percentage = shortTerm?.percentage || 0;

  // Status bar text - show provider and percentage
  let text = `${providerName}: ${percentage}%`;
  if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
    text += ` · ${remaining.hours > 0 ? `${remaining.hours}h` : ''}${remaining.minutes}m`;
  }
  statusBarItem.text = `$(clock) ${text}`;

  // Color based on percentage - only show red when critical
  if (percentage >= 85) {
    statusBarItem.color = new vscode.ThemeColor('errorForeground');
  } else {
    statusBarItem.color = undefined;
  }

  // Click command - show info message
  statusBarItem.command = 'codingplanStatus.showInfo';

  // Build tooltip matching CLI format
  const isZh = language === 'zh-CN';
  const md = new vscode.MarkdownString();
  md.supportHtml = true;

  const isInfini = providerId === 'infini' || (monthly && !expiry);

  if (isInfini) {
    // Infini AI format
    const labels = ['5小时', '周限额', '月限额'];
    const labelWidth = Math.max(...labels.map(l => l.length));
    const padLabel = (label) => label.padEnd(labelWidth, ' ');

    md.appendMarkdown(`**${providerName}**\n\n`);

    if (shortTerm) {
      md.appendMarkdown(`${padLabel('5小时')}: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})\n\n`);
    }

    if (weekly) {
      md.appendMarkdown(`${padLabel('周限额')}: ${weekly.percentage}% (${weekly.used}/${weekly.total})\n\n`);
    }

    if (monthly) {
      md.appendMarkdown(`${padLabel('月限额')}: ${monthly.percentage}% (${monthly.used}/${monthly.total})\n`);
    }
  } else {
    // MiniMax format
    const infoLabels = ['模型', '时间窗', '重置'];
    const quotaLabels = ['5小时', '剩余', '周限额'];
    const infoWidth = Math.max(...infoLabels.map(l => l.length));
    const quotaWidth = Math.max(...quotaLabels.map(l => l.length));

    const padInfo = (label) => label.padEnd(infoWidth, ' ');
    const padQuota = (label) => label.padEnd(quotaWidth, ' ');

    md.appendMarkdown(`**${providerName}**\n\n`);

    // Basic info
    if (modelName) {
      md.appendMarkdown(`${padInfo('模型')}: ${modelName}\n`);
    }

    if (timeWindow && timeWindow.start && timeWindow.end) {
      md.appendMarkdown(`${padInfo('时间窗')}: ${timeWindow.start}-${timeWindow.end} (${timeWindow.timezone})\n`);
    }

    if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
      md.appendMarkdown(`${padInfo('重置')}: ${remaining.text}\n`);
    }

    md.appendMarkdown('\n');

    // Quota info
    if (shortTerm) {
      md.appendMarkdown(`${padQuota('5小时')}: ${shortTerm.percentage}% (${shortTerm.used}/${shortTerm.total})\n`);
    }

    if (shortTerm && shortTerm.remaining !== undefined) {
      md.appendMarkdown(`${padQuota('剩余')}: ${shortTerm.remaining}/${shortTerm.total} 次\n`);
    }

    if (weekly) {
      md.appendMarkdown('\n');
      if (weekly.unlimited) {
        md.appendMarkdown(`${padQuota('周限额')}: 不受限制\n`);
      } else {
        md.appendMarkdown(`${padQuota('周限额')}: ${weekly.percentage}%\n`);
      }
    }

    if (expiry) {
      md.appendMarkdown('\n');
      const expiryText = typeof expiry === 'string' ? expiry : (expiry.text || expiry.date);
      md.appendMarkdown(`到期: ${expiryText}\n`);
    }
  }

  statusBarItem.tooltip = md;
}

async function showHelpWebView(context, configAdapter) {
  const language = configAdapter.getLanguage();

  const panel = vscode.window.createWebviewPanel(
    'codingplanHelp',
    language === 'zh-CN' ? '使用教程' : 'Help',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const i18n = {
    'zh-CN': {
      title: 'CodingPlan Status 使用教程',
      step1Title: '第一步：获取 API Key',
      step1Content: `Infini AI: 访问 cloud.infini-ai.com/genstudio/code 获取 API Key (以 sk-cp- 开头)

MiniMax: 访问 platform.minimaxi.com 的 Token-Plan 页面创建 API Key`,
      step2Title: '第二步：配置插件',
      step2Content: `1. 点击左侧边栏的 CodingPlan 图标
2. 点击「插件设置」按钮
3. 选择供应商并填写 API Key
4. 点击保存`,
      usageTitle: '使用说明',
      usageContent: `• 状态栏显示当前使用进度
• 点击状态栏可刷新数据
• 支持多个供应商切换`,
    },
    'en-US': {
      title: 'CodingPlan Status Help',
      step1Title: 'Step 1: Get API Key',
      step1Content: `Infini AI: Visit cloud.infini-ai.com/genstudio/code to get API Key (starts with sk-cp-)

MiniMax: Visit platform.minimaxi.com Token-Plan page to create API Key`,
      step2Title: 'Step 2: Configure Plugin',
      step2Content: `1. Click CodingPlan icon in sidebar
2. Click Settings
3. Select provider and enter API Key
4. Click Save`,
      usageTitle: 'Usage',
      usageContent: `• Status bar shows usage progress
• Click status bar to refresh
• Support multiple providers`,
    }
  };

  const t = i18n[language] || i18n['zh-CN'];

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${t.title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; padding: 0; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { color: var(--vscode-editor-foreground); border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 24px; }
        .step { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
        .step h2 { font-size: 16px; font-weight: 600; margin: 0 0 12px 0; color: var(--vscode-editor-foreground); }
        .step p { margin: 0; color: var(--vscode-foreground); line-height: 1.6; white-space: pre-line; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${t.title}</h1>
        <div class="step"><h2>${t.step1Title}</h2><p>${t.step1Content}</p></div>
        <div class="step"><h2>${t.step2Title}</h2><p>${t.step2Content}</p></div>
        <div class="step"><h2>${t.usageTitle}</h2><p>${t.usageContent}</p></div>
      </div>
    </body>
    </html>
  `;

  return panel;
}

async function showSettingsWebView(context, providerManager, configAdapter, updateStatus) {
  const language = configAdapter.getLanguage();

  const panel = vscode.window.createWebviewPanel(
    'codingplanSettings',
    language === 'zh-CN' ? 'CodingPlan 设置' : 'CodingPlan Settings',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const providers = providerManager.getAvailableProviders();
  const configured = providerManager.getConfiguredProviders();
  const currentProviderId = providerManager.getCurrentProviderId() || providers[0]?.id;

  // Build provider options HTML
  const providerOptions = providers.map(p =>
    `<option value="${p.id}" ${p.id === currentProviderId ? 'selected' : ''}>${p.displayName}</option>`
  ).join('');

  // Build credential fields based on selected provider's schema
  const currentSchema = providerManager.getProviderConfigSchema(currentProviderId) || [];
  const currentCredentials = providerManager.getCredentials(currentProviderId) || {};

  const credentialFields = currentSchema.map(field => {
    const value = currentCredentials[field.key] || '';
    return `
      <div class="form-group">
        <label for="${field.key}">${field.label}</label>
        <input type="text" id="${field.key}" value="${value}" placeholder="${field.label}">
      </div>
    `;
  }).join('');

  const i18n = {
    'zh-CN': {
      title: 'CodingPlan 设置',
      provider: '供应商',
      credentials: '凭据配置',
      displaySettings: '显示设置',
      refreshInterval: '刷新间隔（秒）',
      refreshIntervalInfo: '自动刷新间隔，建议 10-30 秒',
      showTooltip: '显示详细提示信息',
      language: '语言',
      save: '保存',
      cancel: '取消',
    },
    'en-US': {
      title: 'CodingPlan Settings',
      provider: 'Provider',
      credentials: 'Credentials',
      displaySettings: 'Display Settings',
      refreshInterval: 'Refresh Interval (seconds)',
      refreshIntervalInfo: 'Auto-refresh interval, 10-30 seconds recommended',
      showTooltip: 'Show detailed tooltip',
      language: 'Language',
      save: 'Save',
      cancel: 'Cancel',
    }
  };

  const t = i18n[language] || i18n['zh-CN'];
  const extensionSettings = configAdapter.getExtensionSettings();

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${t.title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; padding: 0; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { color: var(--vscode-editor-foreground); border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 24px; }
        .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
        .card h2 { font-size: 14px; font-weight: 600; margin: 0 0 16px 0; color: var(--vscode-editorForeground); border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
        .form-group { margin-bottom: 16px; }
        .form-group:last-child { margin-bottom: 0; }
        label { display: block; margin-bottom: 6px; font-weight: 600; color: var(--vscode-editor-foreground); font-size: 13px; }
        input[type="text"], input[type="number"], select { padding: 12px 16px; border: 1px solid var(--vscode-input-border); border-radius: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 14px; width: 100%; box-sizing: border-box; }
        input[type="number"] { width: 120px; }
        .checkbox-group { display: flex; align-items: center; gap: 8px; }
        .checkbox-group label { margin-bottom: 0; font-weight: 400; }
        .info-text { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
        .button-group { display: flex; gap: 12px; margin-top: 8px; }
        button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; }
        button:hover { background-color: var(--vscode-button-hoverBackground); }
        button.secondary { background-color: transparent; border: 1px solid var(--vscode-button-secondaryBackground); }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${t.title}</h1>

        <div class="card">
          <h2>${t.provider}</h2>
          <div class="form-group">
            <label for="provider">${t.provider}</label>
            <select id="provider">${providerOptions}</select>
          </div>
        </div>

        <div class="card" id="credentialsCard">
          <h2>${t.credentials}</h2>
          <div id="credentialFields">${credentialFields}</div>
        </div>

        <div class="card">
          <h2>${t.displaySettings}</h2>
          <div class="form-group">
            <label for="interval">${t.refreshInterval}</label>
            <input type="number" id="interval" min="5" max="300" value="${extensionSettings.refreshInterval}">
            <div class="info-text">${t.refreshIntervalInfo}</div>
          </div>
          <div class="form-group">
            <div class="checkbox-group">
              <input type="checkbox" id="showTooltip" ${extensionSettings.showTooltip ? 'checked' : ''}>
              <label for="showTooltip">${t.showTooltip}</label>
            </div>
          </div>
          <div class="form-group">
            <label for="language">${t.language}</label>
            <select id="language">
              <option value="zh-CN" ${language === 'zh-CN' ? 'selected' : ''}>中文</option>
              <option value="en-US" ${language === 'en-US' ? 'selected' : ''}>English</option>
            </select>
          </div>
        </div>

        <div class="button-group">
          <button id="saveBtn">${t.save}</button>
          <button id="cancelBtn" class="secondary">${t.cancel}</button>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        // Store provider schemas
        const providerSchemas = ${JSON.stringify(providers.reduce((acc, p) => { acc[p.id] = p.configSchema; return acc; }, {}))};

        // Update credential fields when provider changes
        document.getElementById('provider').addEventListener('change', (e) => {
          const providerId = e.target.value;
          const schema = providerSchemas[providerId] || [];
          const fieldsHtml = schema.map(field => \`
            <div class="form-group">
              <label for="\${field.key}">\${field.label}</label>
              <input type="text" id="\${field.key}" value="" placeholder="\${field.label}">
            </div>
          \`).join('');
          document.getElementById('credentialFields').innerHTML = fieldsHtml;
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
          const providerId = document.getElementById('provider').value;
          const interval = parseInt(document.getElementById('interval').value, 10);
          const showTooltip = document.getElementById('showTooltip').checked;
          const language = document.getElementById('language').value;

          // Collect credentials from form
          const schema = providerSchemas[providerId] || [];
          const credentials = {};
          schema.forEach(field => {
            const input = document.getElementById(field.key);
            if (input) {
              credentials[field.key] = input.value.trim();
            }
          });

          vscode.postMessage({
            command: 'saveSettings',
            providerId,
            credentials,
            interval,
            showTooltip,
            language
          });
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
          vscode.postMessage({ command: 'cancelSettings' });
        });
      </script>
    </body>
    </html>
  `;

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'saveSettings':
          // Save credentials to shared config
          if (message.credentials && Object.values(message.credentials).some(v => v)) {
            providerManager.setCredentials(message.providerId, message.credentials);
          }

          // Save extension settings to VSCode settings
          const config = vscode.workspace.getConfiguration('codingplanStatus');
          await config.update('refreshInterval', message.interval, vscode.ConfigurationTarget.Global);
          await config.update('showTooltip', message.showTooltip, vscode.ConfigurationTarget.Global);
          await config.update('language', message.language, vscode.ConfigurationTarget.Global);

          panel.dispose();

          // Refresh status
          providerManager.refresh();
          updateStatus();

          const successMsg = message.language === 'en-US' ? 'Settings saved!' : '配置保存成功！';
          vscode.window.showInformationMessage(successMsg);
          break;

        case 'cancelSettings':
          panel.dispose();
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  return panel;
}

module.exports = { activate };
