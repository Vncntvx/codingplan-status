const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.configPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.codingplan-config.json'
    );
    this.config = null;
    this.loadConfig();
  }

  getDefaultConfig() {
    return {
      version: 1,
      currentProvider: null,
      providers: {},
    };
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(content);
      } else {
        this.config = this.getDefaultConfig();
      }
    } catch (error) {
      console.error('Failed to load config:', error.message);
      this.config = this.getDefaultConfig();
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error.message);
    }
  }

  getCurrentProviderId() {
    return this.config.currentProvider;
  }

  getCurrentProviderConfig() {
    const providerId = this.config.currentProvider;
    if (!providerId) return null;
    return this.config.providers[providerId] || null;
  }

  setCurrentProvider(providerId) {
    if (!this.config.providers[providerId]) {
      throw new Error(`Provider "${providerId}" not configured`);
    }
    this.config.currentProvider = providerId;
    this.saveConfig();
  }

  setProviderCredentials(providerId, credentials) {
    if (!this.config.providers[providerId]) {
      this.config.providers[providerId] = {};
    }
    Object.assign(this.config.providers[providerId], credentials);

    if (!this.config.currentProvider) {
      this.config.currentProvider = providerId;
    }

    this.saveConfig();
  }

  getProviderCredentials(providerId) {
    return this.config.providers[providerId] || null;
  }

  listConfiguredProviders() {
    return Object.keys(this.config.providers).filter(id => {
      const creds = this.config.providers[id];
      return creds && Object.keys(creds).length > 0;
    });
  }

  removeProvider(providerId) {
    delete this.config.providers[providerId];
    if (this.config.currentProvider === providerId) {
      const remaining = this.listConfiguredProviders();
      this.config.currentProvider = remaining[0] || null;
    }
    this.saveConfig();
  }

  hasAnyConfig() {
    return this.config.currentProvider !== null;
  }

  getConfigPath() {
    return this.configPath;
  }

  resetConfig() {
    this.config = this.getDefaultConfig();
    this.saveConfig();
  }
}

let instance = null;

function getConfigManager() {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

module.exports = {
  ConfigManager,
  getConfigManager,
};
