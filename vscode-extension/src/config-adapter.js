const vscode = require('vscode');
const { getConfigManager } = require('./config-manager');

/**
 * Config Adapter for VSCode Extension
 * Bridges VSCode settings with CLI's shared config file
 */
class ConfigAdapter {
  constructor() {
    this.configManager = getConfigManager();
  }

  /**
   * Get the current provider ID from shared config
   * @returns {string|null}
   */
  getCurrentProviderId() {
    return this.configManager.getCurrentProviderId();
  }

  /**
   * Set the current provider in shared config
   * @param {string} providerId
   */
  setCurrentProvider(providerId) {
    this.configManager.setCurrentProvider(providerId);
  }

  /**
   * Get credentials for a provider from shared config
   * @param {string} providerId
   * @returns {Object|null}
   */
  getProviderCredentials(providerId) {
    return this.configManager.getProviderCredentials(providerId);
  }

  /**
   * Set credentials for a provider in shared config
   * @param {string} providerId
   * @param {Object} credentials
   */
  setProviderCredentials(providerId, credentials) {
    this.configManager.setProviderCredentials(providerId, credentials);
  }

  /**
   * Get list of configured providers
   * @returns {string[]}
   */
  getConfiguredProviders() {
    return this.configManager.listConfiguredProviders();
  }

  /**
   * Get extension-specific settings from VSCode settings
   * These are UI preferences that don't need to be shared with CLI
   * @returns {{refreshInterval: number, language: string, showTooltip: boolean}}
   */
  getExtensionSettings() {
    const config = vscode.workspace.getConfiguration('codingplanStatus');
    return {
      refreshInterval: config.get('refreshInterval', 30),
      language: config.get('language', 'zh-CN'),
      showTooltip: config.get('showTooltip', true),
    };
  }

  /**
   * Get refresh interval in seconds
   * @returns {number}
   */
  getRefreshInterval() {
    const config = vscode.workspace.getConfiguration('codingplanStatus');
    return config.get('refreshInterval', 30);
  }

  /**
   * Get UI language
   * @returns {string} 'zh-CN' or 'en-US'
   */
  getLanguage() {
    const config = vscode.workspace.getConfiguration('codingplanStatus');
    return config.get('language', 'zh-CN');
  }

  /**
   * Check if tooltip should be shown
   * @returns {boolean}
   */
  shouldShowTooltip() {
    const config = vscode.workspace.getConfiguration('codingplanStatus');
    return config.get('showTooltip', true);
  }

  /**
   * Get setting from shared config
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  getSharedSetting(key, defaultValue) {
    return this.configManager.getSetting(key, defaultValue);
  }

  /**
   * Update setting in shared config
   * @param {string} key
   * @param {*} value
   */
  updateSharedSetting(key, value) {
    this.configManager.updateSetting(key, value);
  }

  /**
   * Get the path to the shared config file
   * @returns {string}
   */
  getConfigPath() {
    return this.configManager.getConfigPath();
  }

  /**
   * Check if this is the first time using the extension
   * (no providers configured)
   * @returns {boolean}
   */
  isFirstTime() {
    return this.configManager.listConfiguredProviders().length === 0;
  }

  /**
   * Migrate old VSCode settings to shared config
   * This handles users upgrading from the old MiniMax-only version
   * @returns {Promise<boolean>} True if migration happened
   */
  async migrateFromOldSettings() {
    const oldConfig = vscode.workspace.getConfiguration('minimaxStatus');
    const oldToken = oldConfig.get('token');
    const oldGroupId = oldConfig.get('groupId');

    // Check if there are old settings to migrate
    if (!oldToken) {
      return false;
    }

    // Check if minimax is already configured in shared config
    const existingCredentials = this.getProviderCredentials('minimax');
    if (existingCredentials && existingCredentials.token) {
      return false; // Already configured, no migration needed
    }

    // Migrate to shared config
    const credentials = { token: oldToken };
    if (oldGroupId) {
      credentials.groupId = oldGroupId;
    }

    this.setProviderCredentials('minimax', credentials);
    this.setCurrentProvider('minimax');

    // Clear old settings (optional - could keep for backward compatibility)
    try {
      await oldConfig.update('token', '', vscode.ConfigurationTarget.Global);
      await oldConfig.update('groupId', '', vscode.ConfigurationTarget.Global);
    } catch (e) {
      // Ignore errors when clearing old settings
    }

    return true;
  }
}

// Singleton instance
let instance = null;

/**
 * Get the ConfigAdapter singleton
 * @returns {ConfigAdapter}
 */
function getConfigAdapter() {
  if (!instance) {
    instance = new ConfigAdapter();
  }
  return instance;
}

module.exports = {
  ConfigAdapter,
  getConfigAdapter
};
