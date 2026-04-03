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

  /**
   * 默认配置结构
   */
  getDefaultConfig() {
    return {
      version: 1,
      currentProvider: null,
      providers: {},
    };
  }

  /**
   * 加载配置
   */
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

  /**
   * 保存配置
   */
  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error.message);
    }
  }

  /**
   * 获取当前供应商 ID
   * @returns {string|null}
   */
  getCurrentProviderId() {
    return this.config.currentProvider;
  }

  /**
   * 获取当前供应商配置
   * @returns {Object|null}
   */
  getCurrentProviderConfig() {
    const providerId = this.config.currentProvider;
    if (!providerId) return null;
    return this.config.providers[providerId] || null;
  }

  /**
   * 设置当前供应商
   * @param {string} providerId
   */
  setCurrentProvider(providerId) {
    if (!this.config.providers[providerId]) {
      throw new Error(`Provider "${providerId}" not configured`);
    }
    this.config.currentProvider = providerId;
    this.saveConfig();
  }

  /**
   * 设置供应商凭据
   * @param {string} providerId
   * @param {Object} credentials
   */
  setProviderCredentials(providerId, credentials) {
    if (!this.config.providers[providerId]) {
      this.config.providers[providerId] = {};
    }
    Object.assign(this.config.providers[providerId], credentials);

    // 如果是第一个配置的供应商，自动设为当前供应商
    if (!this.config.currentProvider) {
      this.config.currentProvider = providerId;
    }

    this.saveConfig();
  }

  /**
   * 获取供应商凭据
   * @param {string} providerId
   * @returns {Object|null}
   */
  getProviderCredentials(providerId) {
    return this.config.providers[providerId] || null;
  }

  /**
   * 列出所有已配置的供应商
   * @returns {string[]}
   */
  listConfiguredProviders() {
    return Object.keys(this.config.providers).filter(id => {
      const creds = this.config.providers[id];
      return creds && Object.keys(creds).length > 0;
    });
  }

  /**
   * 删除供应商配置
   * @param {string} providerId
   */
  removeProvider(providerId) {
    delete this.config.providers[providerId];
    if (this.config.currentProvider === providerId) {
      const remaining = this.listConfiguredProviders();
      this.config.currentProvider = remaining[0] || null;
    }
    this.saveConfig();
  }

  /**
   * 检查是否有任何配置
   * @returns {boolean}
   */
  hasAnyConfig() {
    return this.config.currentProvider !== null;
  }

  /**
   * 获取配置文件路径
   * @returns {string}
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * 重置配置
   */
  resetConfig() {
    this.config = this.getDefaultConfig();
    this.saveConfig();
  }
}

// 单例实例
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
