const fs = require('fs');
const path = require('path');
const os = require('os');

const REQUIRED_FIELDS = {
  minimax: ['token'],
  infini: ['token'],
};

class ConfigManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.codingplan-config.json');
    this.backupPath = path.join(os.homedir(), '.codingplan-config.json.bak');
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
        idleTimeout: 3600000,
        maxRetries: 3,
      },
    };
  }

  loadConfig() {
    if (this._tryLoadConfig(this.configPath)) return;

    this._logDebug('Main config corrupted, trying backup...');
    if (this._tryLoadConfig(this.backupPath)) {
      this._logDebug('Restored from backup');
      this._atomicWriteSync(this.configPath, this.config);
      return;
    }

    this._logDebug('Using default config');
    this.config = this.getDefaultConfig();
  }

  _tryLoadConfig(filePath) {
    try {
      if (!fs.existsSync(filePath)) return false;
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null) return false;
      this.config = parsed;
      if (!this.config.settings) this.config.settings = this.getDefaultConfig().settings;
      return true;
    } catch {
      return false;
    }
  }

  saveConfig() {
    return new Promise((resolve, reject) => {
      if (this.writeLock) {
        setTimeout(() => this.saveConfig().then(resolve).catch(reject), 10);
        return;
      }

      this.writeLock = true;

      const doSave = (retryCount = 0) => {
        try {
          this._atomicWrite(this.configPath, this.config, this.backupPath);
          resolve();
        } catch (error) {
          if (retryCount < 3) {
            this._logDebug(`Save failed, retry ${retryCount + 1}/3:`, error.message);
            setTimeout(() => doSave(retryCount + 1), 50);
          } else {
            this._logDebug('Save failed after 3 retries:', error.message);
            reject(error);
          }
        }
      };

      try {
        doSave();
      } finally {
        // 确保锁始终被释放
        this.writeLock = false;
      }
    });
  }

  _atomicWrite(filePath, data, backupPath) {
    const tempPath = filePath + '.tmp';
    const content = JSON.stringify(data, null, 2);

    // 创建备份，失败时记录警告但不中断
    if (fs.existsSync(filePath) && backupPath) {
      try {
        fs.copyFileSync(filePath, backupPath);
        fs.chmodSync(backupPath, 0o600);
      } catch (backupError) {
        this._logDebug('Warning: Failed to create backup:', backupError.message);
        // 继续写入，但记录警告
      }
    }

    fs.writeFileSync(tempPath, content, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  }

  _atomicWriteSync(filePath, data) {
    this._atomicWrite(filePath, data, null);
  }

  saveConfigSync() {
    try {
      this._atomicWrite(this.configPath, this.config, this.backupPath);
    } catch (error) {
      this._logDebug('Failed to save config:', error.message);
    }
  }

  validateCredentials(providerId, credentials) {
    const requiredFields = REQUIRED_FIELDS[providerId];
    if (!requiredFields) return { valid: false, error: `Unknown provider: ${providerId}` };
    for (const field of requiredFields) {
      if (!credentials[field]) return { valid: false, error: `Missing required field: ${field}` };
    }
    return { valid: true };
  }

  setProviderCredentials(providerId, credentials) {
    const validation = this.validateCredentials(providerId, credentials);
    if (!validation.valid) throw new Error(validation.error);

    if (!this.config.providers[providerId]) this.config.providers[providerId] = {};
    Object.assign(this.config.providers[providerId], credentials);

    if (!this.config.currentProvider) this.config.currentProvider = providerId;
    return this.saveConfig();
  }

  getSetting(key, defaultValue = null) {
    return this.config.settings?.[key] ?? defaultValue;
  }

  updateSetting(key, value) {
    if (!this.config.settings) this.config.settings = {};
    this.config.settings[key] = value;
    return this.saveConfig();
  }

  getCurrentProviderId() { return this.config.currentProvider; }

  getCurrentProviderConfig() {
    const providerId = this.config.currentProvider;
    return providerId ? this.config.providers[providerId] || null : null;
  }

  setCurrentProvider(providerId) {
    if (!this.config.providers[providerId]) throw new Error(`Provider "${providerId}" not configured`);
    this.config.currentProvider = providerId;
    return this.saveConfig();
  }

  getProviderCredentials(providerId) { return this.config.providers[providerId] || null; }

  listConfiguredProviders() {
    return Object.keys(this.config.providers).filter(id => {
      const creds = this.config.providers[id];
      return creds && Object.keys(creds).length > 0;
    });
  }

  removeProvider(providerId) {
    delete this.config.providers[providerId];
    if (this.config.currentProvider === providerId) {
      this.config.currentProvider = this.listConfiguredProviders()[0] || null;
    }
    return this.saveConfig();
  }

  hasAnyConfig() { return this.config.currentProvider !== null; }
  getConfigPath() { return this.configPath; }

  resetConfig() {
    this.config = this.getDefaultConfig();
    return this.saveConfig();
  }

  _logDebug(message, detail) {
    if (process.env.CPS_DEBUG || this.config?.settings?.debug) {
      console.error(`[ConfigManager] ${message}`, detail || '');
    }
  }
}

let instance = null;

function getConfigManager() {
  if (!instance) instance = new ConfigManager();
  return instance;
}

function resetInstance() { instance = null; }

module.exports = { ConfigManager, getConfigManager, resetInstance, REQUIRED_FIELDS };
