const fs = require('fs');
const path = require('path');
const os = require('os');

// 凭据必填字段定义
const REQUIRED_FIELDS = {
  minimax: ['token'],
  infini: ['token'],
};

class ConfigManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.codingplan-config.json');
    this.config = null;
    this.writeLock = false;
    this.loadConfig();
  }

  getDefaultConfig() {
    return {
      version: 1,
      currentProvider: null,
      providers: {},
      settings: {
        cacheTTL: 30000,
        debug: false,
      },
    };
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(content);
        if (!this.config.settings) {
          this.config.settings = this.getDefaultConfig().settings;
        }
      } else {
        this.config = this.getDefaultConfig();
      }
    } catch (error) {
      this._logDebug('Failed to load config:', error.message);
      this.config = this.getDefaultConfig();
    }
  }

  saveConfig() {
    return new Promise((resolve, reject) => {
      const doSave = () => {
        this.writeLock = true;
        try {
          fs.writeFileSync(
            this.configPath,
            JSON.stringify(this.config, null, 2),
            { mode: 0o600 }
          );
          resolve();
        } catch (error) {
          this._logDebug('Failed to save config:', error.message);
          reject(error);
        } finally {
          this.writeLock = false;
        }
      };

      if (this.writeLock) {
        setTimeout(() => this.saveConfig().then(resolve).catch(reject), 10);
      } else {
        doSave();
      }
    });
  }

  // 同步保存
  saveConfigSync() {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      this._logDebug('Failed to save config:', error.message);
    }
  }

  // 验证凭据
  validateCredentials(providerId, credentials) {
    const requiredFields = REQUIRED_FIELDS[providerId];
    if (!requiredFields) {
      return { valid: false, error: `Unknown provider: ${providerId}` };
    }

    for (const field of requiredFields) {
      if (!credentials[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  setProviderCredentials(providerId, credentials) {
    const validation = this.validateCredentials(providerId, credentials);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    if (!this.config.providers[providerId]) {
      this.config.providers[providerId] = {};
    }

    Object.assign(this.config.providers[providerId], credentials);

    if (!this.config.currentProvider) {
      this.config.currentProvider = providerId;
    }

    return this.saveConfig();
  }

  // 获取设置项
  getSetting(key, defaultValue = null) {
    return this.config.settings?.[key] ?? defaultValue;
  }

  // 更新设置项
  updateSetting(key, value) {
    if (!this.config.settings) {
      this.config.settings = {};
    }
    this.config.settings[key] = value;
    return this.saveConfig();
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
    return this.saveConfig();
  }

  getProviderCredentials(providerId) {
    return this.config.providers[providerId] || null;
  }

  listConfiguredProviders() {
    return Object.keys(this.config.providers).filter((id) => {
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
    return this.saveConfig();
  }

  hasAnyConfig() {
    return this.config.currentProvider !== null;
  }

  getConfigPath() {
    return this.configPath;
  }

  resetConfig() {
    this.config = this.getDefaultConfig();
    return this.saveConfig();
  }

  _logDebug(message, detail) {
    if (process.env.CPS_DEBUG || this.config.settings?.debug) {
      console.error(`[ConfigManager] ${message}`, detail || '');
    }
  }
}

let instance = null;

function getConfigManager() {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

// 重置实例
function resetInstance() {
  instance = null;
}

module.exports = {
  ConfigManager,
  getConfigManager,
  resetInstance,
  REQUIRED_FIELDS,
};
