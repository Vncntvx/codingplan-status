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

  async fetchUsageData() {
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
    // Infini 特定错误处理
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 400:
          throw new Error('Invalid request to Infini API.');
        case 401:
          throw new Error('Invalid Infini API key. Please run "cps auth infini <api-key>" to update.');
        case 403:
          throw new Error('Infini access denied. Your account may be restricted.');
        case 429:
          throw new Error('Infini rate limit exceeded. Please wait before retrying.');
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error('Infini service is temporarily unavailable. Please try again later.');
      }
    }

    // 委托父类处理通用错误
    super.handleApiError(error);
  }

  parseUsageData(apiData) {
    // Infini 返回格式: { "5_hour": {...}, "7_day": {...}, "30_day": {...} }
    const shortTerm = this.parseQuota(apiData['5_hour']);
    const weekly = this.parseQuota(apiData['7_day']);
    const monthly = this.parseQuota(apiData['30_day']);

    return {
      providerId: 'infini',
      providerName: 'Infini AI',
      modelName: 'Coding Plan',
      timeWindow: {
        start: '',
        end: '',
        timezone: 'UTC+8',
      },
      shortTerm,
      weekly,
      monthly,
      remaining: {
        hours: 0,
        minutes: 0,
        text: '滑动窗口 5 小时',
      },
      expiry: null,
      allModels: [],
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
