const axios = require('axios');
const https = require('https');
const BaseProvider = require('./base-provider');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 10000,
  servername: 'minimaxi.com'
});

class MinimaxProvider extends BaseProvider {
  static get id() {
    return 'minimax';
  }

  static get displayName() {
    return 'MiniMax';
  }

  static getConfigSchema() {
    return [
      { key: 'token', label: 'API Token', required: true, secret: true },
      { key: 'groupId', label: 'Group ID', required: false, secret: false },
    ];
  }

  constructor(config) {
    super(config);
    this.baseUrl = 'https://www.minimaxi.com/v1/api/openplatform';
  }

  async fetchUsageData(forceRefresh = false) {
    if (!this.config.token) {
      throw new Error('Missing token. Please run "cps auth minimax <token>" first');
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/coding_plan/remains`,
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

  async getSubscriptionDetails() {
    if (!this.config.token) return null;

    try {
      const response = await axios.get(
        `${this.baseUrl}/charge/combo/cycle_audio_resource_package`,
        {
          params: {
            biz_line: 2,
            cycle_type: 1,
            resource_package_type: 7,
          },
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
      return null;
    }
  }

  async getBillingRecords(page = 1, limit = 100) {
    if (!this.config.token) return [];

    try {
      const response = await axios.get(
        `https://www.minimaxi.com/account/amount`,
        {
          params: {
            page: page,
            limit: limit,
            aggregate: false,
          },
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
      return null;
    }
  }

  async getUsageStats() {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

      const allRecords = [];
      for (let page = 1; page <= 100; page++) {
        const response = await this.getBillingRecords(page, 100);
        if (!response || !response.charge_records || response.charge_records.length === 0) break;
        allRecords.push(...response.charge_records);
        if (response.charge_records.length < 100) break;
      }

      if (allRecords.length === 0) return null;

      const nowMs = Date.now();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
      const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;

      const stats = {
        lastDayUsage: 0,
        weeklyUsage: 0,
        planTotalUsage: 0,
      };

      for (const record of allRecords) {
        const tokens = parseInt(record.consume_token, 10) || 0;
        const createdAt = (record.created_at || 0) * 1000;

        if (createdAt >= yesterdayStart && createdAt < todayStart) {
          stats.lastDayUsage += tokens;
        }
        if (createdAt >= weekAgo) {
          stats.weeklyUsage += tokens;
        }
        if (createdAt >= monthStart) {
          stats.planTotalUsage += tokens;
        }
      }

      return stats;
    } catch (error) {
      return null;
    }
  }

  handleApiError(error) {
    if (error.response?.status === 401) {
      throw new Error('Invalid token or unauthorized. Please check your credentials.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your network connection.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('Network error. Please check your internet connection.');
    }
    throw new Error(`API request failed: ${error.message}`);
  }

  parseUsageData(apiData) {
    if (!apiData.model_remains || apiData.model_remains.length === 0) {
      throw new Error('No usage data available');
    }

    const modelData = apiData.model_remains[0];
    const startTime = new Date(modelData.start_time);
    const endTime = new Date(modelData.end_time);

    // current_interval_usage_count 实际是剩余次数
    const remainingCount = modelData.current_interval_usage_count;
    const usedCount = modelData.current_interval_total_count - remainingCount;
    const usedPercentage = Math.round((usedCount / modelData.current_interval_total_count) * 100);

    const remainingMs = modelData.remains_time;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    const weeklyUsed = modelData.current_weekly_total_count - modelData.current_weekly_usage_count;
    const weeklyTotal = modelData.current_weekly_total_count;
    const weeklyPercentage = weeklyTotal > 0 ? Math.floor((weeklyUsed / weeklyTotal) * 100) : 0;

    return {
      providerId: 'minimax',
      providerName: 'MiniMax',
      modelName: modelData.model_name,
      timeWindow: {
        start: startTime.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Shanghai',
          hour12: false,
        }),
        end: endTime.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Shanghai',
          hour12: false,
        }),
        timezone: 'UTC+8',
      },
      shortTerm: {
        used: usedCount,
        total: modelData.current_interval_total_count,
        remaining: remainingCount,
        percentage: usedPercentage,
      },
      weekly: {
        used: weeklyUsed,
        total: weeklyTotal,
        remaining: modelData.current_weekly_usage_count,
        percentage: weeklyPercentage,
        unlimited: weeklyTotal === 0,
      },
      remaining: {
        hours,
        minutes,
        text: hours > 0 ? `${hours} 小时 ${minutes} 分钟后重置` : `${minutes} 分钟后重置`,
      },
      expiry: null,
      allModels: this.parseAllModels(apiData),
    };
  }

  parseWithExpiry(apiData, subscriptionData) {
    const data = this.parseUsageData(apiData);

    if (
      subscriptionData &&
      subscriptionData.current_subscribe &&
      subscriptionData.current_subscribe.current_subscribe_end_time
    ) {
      const expiryDate = subscriptionData.current_subscribe.current_subscribe_end_time;
      const expiry = new Date(expiryDate);
      const now = new Date();
      const timeDiff = expiry.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      data.expiry = {
        date: expiryDate,
        daysRemaining: daysDiff,
        text:
          daysDiff > 0
            ? `还剩 ${daysDiff} 天`
            : daysDiff === 0
            ? '今天到期'
            : `已过期 ${Math.abs(daysDiff)} 天`,
      };
    }

    return data;
  }

  parseAllModels(apiData) {
    if (!apiData.model_remains || apiData.model_remains.length === 0) return [];

    return apiData.model_remains.map(modelData => {
      const totalCount = modelData.current_interval_total_count;
      const remainingCount = modelData.current_interval_usage_count;
      const usedCount = totalCount - remainingCount;
      const percentage = totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0;

      const weeklyTotal = modelData.current_weekly_total_count || 0;
      const weeklyUsed = weeklyTotal > 0 ? (modelData.current_weekly_total_count - modelData.current_weekly_usage_count) : 0;
      const weeklyPercentage = weeklyTotal > 0 ? Math.floor((weeklyUsed / weeklyTotal) * 100) : 0;

      return {
        name: modelData.model_name,
        used: usedCount,
        remaining: remainingCount,
        total: totalCount,
        percentage,
        unlimited: weeklyTotal === 0,
        weeklyPercentage,
        weeklyTotal,
        weeklyRemainingCount: modelData.current_weekly_usage_count || 0,
      };
    });
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

module.exports = MinimaxProvider;
