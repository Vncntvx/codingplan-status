const vscode = require('vscode');

async function showSettingsWebView(context, providerManager, configAdapter, logger) {
  const language = configAdapter.getLanguage();

  const panel = vscode.window.createWebviewPanel(
    'codingplanSettings',
    language === 'zh-CN' ? 'CodingPlan 设置' : 'CodingPlan Settings',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const providers = providerManager.getAvailableProviders();
  const currentProviderId = providerManager.getCurrentProviderId() || providers[0]?.id;

  const providerOptions = providers.map((p) =>
    `<option value="${p.id}" ${p.id === currentProviderId ? 'selected' : ''}>${p.displayName}</option>`
  ).join('');

  const currentSchema = providerManager.getProviderConfigSchema(currentProviderId) || [];
  const currentCredentials = providerManager.getCredentials(currentProviderId) || {};

  const credentialFields = currentSchema.map((field) => {
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
      showTooltip: 'Show detailed tooltip',
      language: 'Language',
      save: 'Save',
      cancel: 'Cancel',
    },
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
        input[type="text"], select { padding: 12px 16px; border: 1px solid var(--vscode-input-border); border-radius: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 14px; width: 100%; box-sizing: border-box; }
        .checkbox-group { display: flex; align-items: center; gap: 8px; }
        .checkbox-group label { margin-bottom: 0; font-weight: 400; }
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
        const providerSchemas = ${JSON.stringify(providers.reduce((acc, p) => { acc[p.id] = p.configSchema; return acc; }, {}))};

        document.getElementById('provider').addEventListener('change', (e) => {
          const providerId = e.target.value;
          const schema = providerSchemas[providerId] || [];
          const fieldsHtml = schema.map((field) => \`
            <div class="form-group">
              <label for="\${field.key}">\${field.label}</label>
              <input type="text" id="\${field.key}" value="" placeholder="\${field.label}">
            </div>
          \`).join('');
          document.getElementById('credentialFields').innerHTML = fieldsHtml;
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
          const providerId = document.getElementById('provider').value;
          const showTooltip = document.getElementById('showTooltip').checked;
          const language = document.getElementById('language').value;

          const schema = providerSchemas[providerId] || [];
          const credentials = {};
          schema.forEach((field) => {
            const input = document.getElementById(field.key);
            if (input) {
              credentials[field.key] = input.value.trim();
            }
          });

          vscode.postMessage({
            command: 'saveSettings',
            providerId,
            credentials,
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

  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'saveSettings': {
          if (message.credentials && Object.values(message.credentials).some((v) => v)) {
            await providerManager.setCredentials(message.providerId, message.credentials);
          }

          const config = vscode.workspace.getConfiguration('codingplanStatus');
          await config.update('showTooltip', message.showTooltip, vscode.ConfigurationTarget.Global);
          await config.update('language', message.language, vscode.ConfigurationTarget.Global);
          await providerManager.switchProvider(message.providerId);

          logger.info('Settings saved', { providerId: message.providerId, language: message.language });

          panel.dispose();
          const successMsg = message.language === 'en-US' ? 'Settings saved!' : '配置保存成功！';
          vscode.window.showInformationMessage(successMsg);
          break;
        }

        case 'cancelSettings':
          panel.dispose();
          break;

        default:
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  return panel;
}

module.exports = {
  showSettingsWebView,
};
