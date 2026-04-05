const vscode = require('vscode');
const { COMMANDS } = require('../constants');
const { showHelpWebView } = require('../views/help-webview');
const { showSettingsWebView } = require('../views/settings-webview');

class CommandController {
  constructor({ context, statusController, providerManager, configAdapter, logger }) {
    this.context = context;
    this.statusController = statusController;
    this.providerManager = providerManager;
    this.configAdapter = configAdapter;
    this.logger = logger;
  }

  registerAll() {
    return [
      vscode.commands.registerCommand(COMMANDS.refresh, () =>
        this.statusController.refresh({ forceRefresh: true, reason: 'manual-refresh' }).catch((error) => {
          vscode.window.showErrorMessage(error.message);
        })
      ),
      vscode.commands.registerCommand(COMMANDS.setup, async () => {
        const panel = await showSettingsWebView(
          this.context,
          this.providerManager,
          this.configAdapter,
          this.logger
        );
        this.context.subscriptions.push(panel);
        panel.onDidDispose(() => {
          this.statusController.refresh({ reason: 'settings-panel-closed' }).catch(() => {});
        });
      }),
      vscode.commands.registerCommand(COMMANDS.switchProvider, async () => {
        const language = this.configAdapter.getLanguage();
        const providers = this.providerManager.getAvailableProviders();
        const configured = this.providerManager.getConfiguredProviders();

        const items = providers.map((p) => ({
          label: p.displayName,
          description: configured.includes(p.id) ? '✓' : '',
          id: p.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: language === 'zh-CN' ? '选择供应商' : 'Select provider',
        });
        if (!selected) return;

        if (!configured.includes(selected.id)) {
          const configure = language === 'zh-CN' ? '配置' : 'Configure';
          const later = language === 'zh-CN' ? '稍后' : 'Later';
          const choice = await vscode.window.showInformationMessage(
            `${selected.label} ${language === 'zh-CN' ? '未配置' : 'is not configured'}`,
            configure,
            later
          );
          if (choice === configure) {
            await vscode.commands.executeCommand(COMMANDS.setup);
          }
          return;
        }

        await this.providerManager.switchProvider(selected.id);
        await this.statusController.refresh({ reason: 'provider-switched' });
      }),
      vscode.commands.registerCommand(COMMANDS.showHelp, async () => {
        const panel = showHelpWebView(this.configAdapter);
        this.context.subscriptions.push(panel);
      }),
      vscode.commands.registerCommand(COMMANDS.showInfo, () =>
        this.statusController.showInfo().catch((error) => {
          vscode.window.showErrorMessage(error.message);
        })
      ),
      vscode.commands.registerCommand(COMMANDS.showLogs, () => {
        this.logger.show();
      }),
    ];
  }
}

module.exports = {
  CommandController,
};
