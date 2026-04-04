const { getCacheManager } = require('./cache-manager');
const { getConfigManager } = require('./config-manager');
const { createProvider } = require('./providers');

/**
 * 用量数据获取服务，封装缓存逻辑和 API 调用
 */
class UsageFetcher {
  constructor() {
    this.configManager = getConfigManager();
    this.cacheManager = getCacheManager({
      ttl: this.configManager.getSetting('cacheTTL', 30000),
    });
  }

  /**
   * 获取用量数据（带缓存）
   * @param {Object} options
   * @param {boolean} options.forceRefresh - 强制刷新
   * @param {string} options.providerId - 指定供应商（可选，默认当前）
   * @returns {Promise<Object|null>}
   */
  async fetch(options = {}) {
    const { forceRefresh = false, providerId: explicitProviderId } = options;

    const providerId = explicitProviderId || this.configManager.getCurrentProviderId();
    if (!providerId) {
      return null;
    }

    // 检查缓存
    if (!forceRefresh) {
      const cached = this.cacheManager.get();
      if (cached && cached.data) {
        this._logDebug('Using cached data');
        return cached.data;
      }
    }

    // 发起 API 请求
    try {
      const credentials = this.configManager.getProviderCredentials(providerId);
      if (!credentials) {
        return null;
      }

      this._logDebug('Fetching from API, provider:', providerId);
      const provider = createProvider(providerId, credentials);
      const apiData = await provider.fetchUsageData();

      let usageData;
      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);
      } else {
        usageData = provider.parseUsageData(apiData);
      }

      // 更新缓存
      this.cacheManager.writeSync(usageData, 'ok');

      return usageData;
    } catch (error) {
      this._logDebug('API error:', error.message);
      this.cacheManager.writeSync(null, 'error');
      return null;
    }
  }

  /**
   * 获取缓存状态
   */
  getCacheStatus() {
    return this.cacheManager.getStatus();
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cacheManager.clear();
  }

  _logDebug(message, detail) {
    if (process.env.CPS_DEBUG || this.configManager.getSetting('debug')) {
      console.error(`[UsageFetcher] ${message}`, detail || '');
    }
  }
}

let instance = null;

function getUsageFetcher() {
  if (!instance) {
    instance = new UsageFetcher();
  }
  return instance;
}

// 重置实例
function resetInstance() {
  instance = null;
}

module.exports = { UsageFetcher, getUsageFetcher, resetInstance };
