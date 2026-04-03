const axios = require('axios');
const https = require('https');
const BaseProvider = require('./base-provider');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 10000,
});

class InfiniProvider extends BaseProvider {
  static get id() {
    return 'infini';
  }

  static get displayName() {
    return 'Infini AI';
  }

  static getConfigSchema() {
    return [
      { key: 'token', label: 'API Key (sk-cp-xxx)', required: true, secret: true },
    ];
  }

  constructor(config) {
    super(config);
    this.baseUrl = 'https://cloud.infini-ai.com/maas/coding';
  }

  async fetchUsageData(forceRefresh = false) {
    if (!this.config.token) {
      throw new Error('Missing API key. Please run "cps auth infini <api-key>" first');
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/usage`,
        {
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            Accept: 'application/json',
          },
          timeout: 10000,
          httpsAgent,
        }
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  handleApiError(error) {
    if (error.response?.status === 401) {
      throw new Error('Invalid API key. Please check your credentials.');
    } else if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your network connection.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('Network error. Please check your internet connection.');
    }
    throw new Error(`API request failed: ${error.message}`);
  }

  parseUsageData(apiData) {
    // Infini 返回格式: { "5_hour": {...}, "7_day": {...}, "30_day": {...} }
    const shortTerm = this.parseQuota(apiData['5_hour']);
    const weekly = this.parseQuota(apiData['7_day']);
    const monthly = this.parseQuota(apiData['30_day']);

    return {
      providerId: 'infini',
      providerName: 'Infini AI',
      modelName: 'Coding Plan', // Infini 不区分模型
      timeWindow: {
        start: '', // Infini 不提供具体时间窗口
        end: '',
        timezone: 'UTC+8',
      },
      shortTerm,
      weekly,
      monthly,
      remaining: {
        hours: 0, // Infini 不提供剩余时间（滑动窗口）
        minutes: 0,
        text: '滑动窗口 5 小时',
      },
      expiry: null, // Infini 不提供到期信息
      allModels: [], // Infini 不区分模型
    };
  }

  parseQuota(quotaData) {
    if (!quotaData) {
      return { used: 0, total: 0, remaining: 0, percentage: 0 };
    }

    const { quota = 0, used = 0, remain = 0 } = quotaData;
    const percentage = quota > 0 ? Math.round((used / quota) * 100) : 0;

    return {
      used,
      total: quota,
      remaining: remain,
      percentage,
    };
  }

  async testConnection() {
    try {
      await this.fetchUsageData(true);
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = InfiniProvider;
