const vscode = require('vscode');
const { getProviderManager } = require('./src/provider-manager');
const { getConfigAdapter } = require('./src/config-adapter');
const { CodingPlanTreeProvider } = require('./src/views/tree-provider');
const { Logger } = require('./src/services/logger');
const { DaemonClient } = require('./src/services/daemon-client');
const { StatusController } = require('./src/controllers/status-controller');
const { CommandController } = require('./src/controllers/command-controller');
const { COMMANDS } = require('./src/constants');

function activate(context) {
  const logger = new Logger();
  context.subscriptions.push({ dispose: () => logger.dispose() });

  try {
    const providerManager = getProviderManager();
    const configAdapter = getConfigAdapter();
    const daemonClient = new DaemonClient(logger);

    providerManager.initialize().catch((error) => {
      logger.error('Failed to initialize provider manager', { error: error.message });
    });

    configAdapter.migrateFromOldSettings().then((migrated) => {
      if (migrated) {
        logger.info('Migrated old minimaxStatus settings');
        providerManager.initialize();
      }
    }).catch((error) => {
      logger.warn('Settings migration check failed', { error: error.message });
    });

    const treeProvider = new CodingPlanTreeProvider(configAdapter);
    const treeView = vscode.window.createTreeView('codingplanStatusView', {
      treeDataProvider: treeProvider,
    });

    const statusBarItem = vscode.window.createStatusBarItem(
      'codingplanStatus',
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.name = 'CodingPlan Status';
    statusBarItem.command = COMMANDS.refresh;
    statusBarItem.show();

    const statusController = new StatusController({
      statusBarItem,
      treeProvider,
      providerManager,
      configAdapter,
      daemonClient,
      logger,
    });

    const commandController = new CommandController({
      context,
      statusController,
      providerManager,
      configAdapter,
      logger,
    });

    const commandDisposables = commandController.registerAll();

    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('codingplanStatus')) return;
      providerManager.refresh();
      statusController.refresh({ reason: 'config-changed' }).catch((error) => {
        logger.warn('Refresh failed after config change', { error: error.message });
      });
    });

    const viewVisibilityDisposable = treeView.onDidChangeVisibility((event) => {
      if (!event.visible) return;
      statusController.refresh({ reason: 'tree-visible' }).catch((error) => {
        logger.warn('Refresh failed on tree visibility', { error: error.message });
      });
    });

    context.subscriptions.push(
      statusBarItem,
      treeView,
      configChangeDisposable,
      viewVisibilityDisposable,
      ...commandDisposables
    );

    statusController.refresh({ reason: 'activate' }).catch((error) => {
      logger.error('Initial refresh failed', { error: error.message });
    });

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
              vscode.commands.executeCommand(COMMANDS.setup);
            }
          });
      }, 1200);
    }
  } catch (error) {
    logger.error('Extension activation failed', { error: error.message });
    vscode.window.showErrorMessage(`CodingPlan Status extension activation failed: ${error.message}`);
  }
}

module.exports = { activate };
