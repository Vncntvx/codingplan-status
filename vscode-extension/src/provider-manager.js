const vscode = require('vscode');
const { createProvider, listProviders, hasProvider, getProviderClass } = require('./providers');
const { getConfigManager } = require('./config-manager');

/**
 * Provider Manager for VSCode Extension
 * Manages provider lifecycle and bridges CLI providers with VSCode
 */
class ProviderManager {
  constructor() {
    this.configManager = getConfigManager();
    this.currentProvider = null;
    this.currentProviderId = null;
  }

  /**
   * Initialize the provider manager
   * Loads the current provider from config
   */
  async initialize() {
    const providerId = this.configManager.getCurrentProviderId();
    if (providerId) {
      this._createProviderInstance(providerId);
    }
  }

  /**
   * Create a provider instance for the given provider ID
   * @param {string} providerId
   * @private
   */
  _createProviderInstance(providerId) {
    if (!hasProvider(providerId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const credentials = this.configManager.getProviderCredentials(providerId);
    if (!credentials || Object.keys(credentials).length === 0) {
      this.currentProvider = null;
      this.currentProviderId = null;
      return;
    }

    try {
      this.currentProvider = createProvider(providerId, credentials);
      this.currentProviderId = providerId;
    } catch (error) {
      console.error(`Failed to create provider ${providerId}:`, error.message);
      this.currentProvider = null;
      this.currentProviderId = null;
    }
  }

  /**
   * Fetch usage data from the current provider
   * @returns {Promise<Object|null>} Normalized usage data
   */
  async fetchUsageData() {
    if (!this.currentProvider) {
      return null;
    }

    try {
      const rawData = await this.currentProvider.fetchUsageData();

      // Use provider-specific parsing based on provider type
      if (this.currentProvider.constructor.id === 'minimax') {
        const subscriptionData = await this.currentProvider.getSubscriptionDetails();
        const usageData = this.currentProvider.parseWithExpiry(rawData, subscriptionData);

        // Try to get usage stats
        try {
          const usageStats = await this.currentProvider.getUsageStats();
          if (usageStats) {
            usageData.usageStats = usageStats;
          }
        } catch (e) {
          // Ignore stats errors
        }

        // Get all models if available
        if (this.currentProvider.parseAllModels) {
          usageData.allModels = this.currentProvider.parseAllModels(rawData);
        }

        return usageData;
      } else {
        // Infini and other providers
        return this.currentProvider.parseUsageData(rawData);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Switch to a different provider
   * @param {string} providerId
   */
  switchProvider(providerId) {
    if (!hasProvider(providerId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    this._createProviderInstance(providerId);
    this.configManager.setCurrentProvider(providerId);
  }

  /**
   * Get list of all available providers
   * @returns {Array<{id: string, displayName: string, configSchema: Array}>}
   */
  getAvailableProviders() {
    return listProviders();
  }

  /**
   * Get list of configured providers
   * @returns {string[]}
   */
  getConfiguredProviders() {
    return this.configManager.listConfiguredProviders();
  }

  /**
   * Get the current provider ID
   * @returns {string|null}
   */
  getCurrentProviderId() {
    return this.currentProviderId;
  }

  /**
   * Get the current provider display name
   * @returns {string}
   */
  getCurrentProviderName() {
    if (!this.currentProviderId) {
      return 'Not Configured';
    }
    const ProviderClass = getProviderClass(this.currentProviderId);
    return ProviderClass ? ProviderClass.displayName : this.currentProviderId;
  }

  /**
   * Check if current provider is configured
   * @returns {boolean}
   */
  isConfigured() {
    return this.currentProvider !== null;
  }

  /**
   * Set credentials for a provider
   * @param {string} providerId
   * @param {Object} credentials
   */
  setCredentials(providerId, credentials) {
    this.configManager.setProviderCredentials(providerId, credentials);

    // If this is the first provider, set it as current
    const configured = this.configManager.listConfiguredProviders();
    if (configured.length === 1) {
      this.configManager.setCurrentProvider(providerId);
    }

    // If setting credentials for current provider, refresh instance
    if (providerId === this.currentProviderId) {
      this._createProviderInstance(providerId);
    }
  }

  /**
   * Get credentials for a provider
   * @param {string} providerId
   * @returns {Object|null}
   */
  getCredentials(providerId) {
    return this.configManager.getProviderCredentials(providerId);
  }

  /**
   * Get config schema for a provider
   * @param {string} providerId
   * @returns {Array<{key: string, label: string, required: boolean, secret: boolean}>}
   */
  getProviderConfigSchema(providerId) {
    const ProviderClass = getProviderClass(providerId);
    return ProviderClass ? ProviderClass.getConfigSchema() : [];
  }

  /**
   * Test connection for current provider
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    if (!this.currentProvider) {
      return { success: false, message: 'No provider configured' };
    }
    return this.currentProvider.testConnection();
  }

  /**
   * Refresh provider instance (reload credentials)
   */
  refresh() {
    if (this.currentProviderId) {
      this._createProviderInstance(this.currentProviderId);
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get the ProviderManager singleton
 * @returns {ProviderManager}
 */
function getProviderManager() {
  if (!instance) {
    instance = new ProviderManager();
  }
  return instance;
}

module.exports = {
  ProviderManager,
  getProviderManager
};
