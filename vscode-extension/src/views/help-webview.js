const vscode = require('vscode');

function showHelpWebView(configAdapter) {
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
    },
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

module.exports = {
  showHelpWebView,
};
