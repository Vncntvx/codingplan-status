/**
 * 供应商抽象基类
 * 所有供应商实现必须继承此类
 */
class BaseProvider {
  /**
   * 供应商标识符
   * @returns {string} 如 'minimax', 'infini'
   */
  static get id() {
    throw new Error('Must implement static id');
  }

  /**
   * 供应商显示名称
   * @returns {string} 如 'MiniMax', 'Infini AI'
   */
  static get displayName() {
    throw new Error('Must implement static displayName');
  }

  /**
   * 配置文件字段定义
   * 返回此供应商需要的配置字段
   * @returns {Array<{key: string, label: string, required: boolean, secret: boolean}>}
   */
  static getConfigSchema() {
    throw new Error('Must implement static getConfigSchema');
  }

  constructor(config) {
    this.config = config || {};
    this.cache = {
      data: null,
      timestamp: 0,
    };
    this.cacheTimeout = 8000; // 8秒缓存
  }

  /**
   * 验证配置是否完整
   * @returns {boolean}
   */
  validateConfig() {
    const schema = this.constructor.getConfigSchema();
    for (const field of schema) {
      if (field.required && !this.config[field.key]) {
        return false;
      }
    }
    return true;
  }

  /**
   * 获取原始使用量数据
   * @param {boolean} forceRefresh - 强制刷新缓存
   * @returns {Promise<Object>} 供应商原始响应
   */
  async fetchUsageData(forceRefresh = false) {
    throw new Error('Must implement fetchUsageData');
  }

  /**
   * 将原始数据解析为统一格式
   * @param {Object} rawData - 供应商原始响应
   * @returns {NormalizedUsageData} 统一格式数据
   */
  parseUsageData(rawData) {
    throw new Error('Must implement parseUsageData');
  }

  /**
   * 获取使用量状态（带缓存）
   * @param {boolean} forceRefresh
   * @returns {Promise<NormalizedUsageData>}
   */
  async getUsageStatus(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache.data && now - this.cache.timestamp < this.cacheTimeout) {
      return this.cache.data;
    }

    const rawData = await this.fetchUsageData(forceRefresh);
    const normalizedData = this.parseUsageData(rawData);

    this.cache.data = normalizedData;
    this.cache.timestamp = now;

    return normalizedData;
  }

  /**
   * 获取订阅详情（可选实现）
   * @returns {Promise<Object|null>}
   */
  async getSubscriptionDetails() {
    return null;
  }

  /**
   * 获取账单记录（可选实现）
   * @returns {Promise<Array>}
   */
  async getBillingRecords() {
    return [];
  }

  /**
   * 计算消耗统计（可选实现）
   * @returns {Promise<Object|null>}
   */
  async getUsageStats() {
    return null;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = { data: null, timestamp: 0 };
  }

  /**
   * 测试连接是否正常
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    throw new Error('Must implement testConnection');
  }

  /**
   * 格式化数字为人类可读格式 (万, 亿)
   * @param {number} num
   * @returns {string}
   */
  formatNumber(num) {
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    }
    return num.toLocaleString('zh-CN');
  }
}

/**
 * @typedef {Object} NormalizedUsageData
 * @property {string} providerId - 供应商标识
 * @property {string} providerName - 供应商显示名称
 * @property {string} modelName - 当前模型名称
 * @property {TimeWindow} timeWindow - 时间窗口
 * @property {UsageQuota} shortTerm - 短周期配额 (5小时)
 * @property {UsageQuota} weekly - 周期配额 (7天)
 * @property {UsageQuota} [monthly] - 月度配额 (可选)
 * @property {RemainingTime} remaining - 剩余时间
 * @property {ExpiryInfo} [expiry] - 订阅到期信息 (可选)
 * @property {Array<ModelInfo>} [allModels] - 所有模型信息 (可选)
 */

/**
 * @typedef {Object} TimeWindow
 * @property {string} start - 开始时间
 * @property {string} end - 结束时间
 * @property {string} timezone - 时区
 */

/**
 * @typedef {Object} UsageQuota
 * @property {number} used - 已使用
 * @property {number} total - 总额度
 * @property {number} remaining - 剩余额度
 * @property {number} percentage - 使用百分比
 * @property {boolean} [unlimited] - 是否无限制
 */

/**
 * @typedef {Object} RemainingTime
 * @property {number} hours - 小时
 * @property {number} minutes - 分钟
 * @property {string} text - 文本描述
 */

/**
 * @typedef {Object} ExpiryInfo
 * @property {string} date - 到期日期
 * @property {number} daysRemaining - 剩余天数
 * @property {string} text - 文本描述
 */

/**
 * @typedef {Object} ModelInfo
 * @property {string} name - 模型名称
 * @property {number} used - 已使用
 * @property {number} total - 总额度
 * @property {number} percentage - 使用百分比
 */

module.exports = BaseProvider;
