#!/usr/bin/env node

// Force color output even in non-TTY environments
process.env.FORCE_COLOR = "1";

const { getConfigManager } = require("./config-manager");
const { createProvider } = require("./providers");
const PromptStatus = require("./prompts");

const configManager = getConfigManager();

async function main() {
  try {
    const providerId = configManager.getCurrentProviderId();
    if (!providerId) {
      console.log("❌ 未配置供应商");
      process.exit(1);
    }
    const credentials = configManager.getProviderCredentials(providerId);
    if (!credentials) {
      console.log("❌ 未找到供应商凭据");
      process.exit(1);
    }

    const provider = createProvider(providerId, credentials);
    const apiData = await provider.fetchUsageData();

    let usageData;
    if (provider.constructor.id === 'minimax') {
      const subscriptionData = await provider.getSubscriptionDetails();
      usageData = provider.parseWithExpiry(apiData, subscriptionData);
    } else {
      usageData = provider.parseUsageData(apiData);
    }

    const promptStatus = new PromptStatus();
    console.log(promptStatus.renderCompact(usageData));

  } catch (error) {
    console.log('');
  }
}

main();
