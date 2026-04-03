#!/usr/bin/env node

// Force color output even in non-TTY environments
process.env.FORCE_COLOR = '1';

const { getConfigManager } = require('./config-manager');
const { getUsageFetcher } = require('./usage-fetcher');
const { renderCompact } = require('./renderers');

async function main() {
  const configManager = getConfigManager();
  const usageFetcher = getUsageFetcher();

  // 1. 检查是否已配置
  const providerId = configManager.getCurrentProviderId();
  if (!providerId) {
    const usageFetcher = getUsageFetcher();
    const cache = usageFetcher.getCacheStatus();
    if (!cache.hasData) {
      console.log('⚠ 请先配置: cps auth <provider> <token>');
    }
    process.exit(0);
  }

  // 2. 获取用量数据（带缓存）
  const usageData = await usageFetcher.fetch();

  // 3. 渲染输出
  if (usageData) {
    console.log(renderCompact(usageData));
  } else {
    console.log('');
  }
}

main().catch(() => process.exit(0));
