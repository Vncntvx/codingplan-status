#!/usr/bin/env node

const StatusBar = require('./status');
const chalk = require('chalk');

const mockApiData = {
  model_remains: [{
    start_time: 1763863200000,
    end_time: 1763881200000,
    remains_time: 5160754,
    current_interval_total_count: 4500,
    current_interval_usage_count: 3307,
    model_name: "MiniMax-M2"
  }],
  base_resp: {
    status_code: 0,
    status_msg: "success"
  }
};

class MockAPI {
  parseUsageData(apiData) {
    const modelData = apiData.model_remains[0];
    const startTime = new Date(modelData.start_time);
    const endTime = new Date(modelData.end_time);

    const remainingMs = modelData.remains_time;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    const remainingCount = modelData.current_interval_usage_count;
    const usedCount = modelData.current_interval_total_count - remainingCount;
    const usedPercentage = Math.round((usedCount / modelData.current_interval_total_count) * 100);

    return {
      modelName: modelData.model_name,
      timeWindow: {
        start: startTime.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Shanghai',
          hour12: false
        }),
        end: endTime.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Shanghai',
          hour12: false
        }),
        timezone: 'UTC+8'
      },
      remaining: {
        hours,
        minutes,
        text: hours > 0 ? `${hours} 小时 ${minutes} 分钟后重置` : `${minutes} 分钟后重置`
      },
      usage: {
        used: remainingCount,
        total: modelData.current_interval_total_count,
        percentage: usedPercentage
      }
    };
  }
}

const api = new MockAPI();
const usageData = api.parseUsageData(mockApiData);
const statusBar = new StatusBar(usageData);

console.log('=== MiniMax Claude Code 状态栏示例 ===\n');
console.log(statusBar.render());
console.log('\n=== 紧凑模式示例 ===\n');
console.log(statusBar.renderCompact());
console.log('\n');
