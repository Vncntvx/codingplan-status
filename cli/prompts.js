const { getConfigManager } = require("./config-manager");
const { createProvider } = require("./providers");
const chalk = require("chalk").default;

class PromptStatus {
  constructor() {
    this.configManager = getConfigManager();
  }

  async getPromptStatus(mode = "compact") {
    try {
      const providerId = this.configManager.getCurrentProviderId();
      if (!providerId) {
        return null;
      }

      const credentials = this.configManager.getProviderCredentials(providerId);
      const provider = createProvider(providerId, credentials);

      const apiData = await provider.fetchUsageData();

      let usageData;
      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);
      } else {
        usageData = provider.parseUsageData(apiData);
      }

      if (mode === "compact") {
        return this.renderCompact(usageData);
      } else if (mode === "minimal") {
        return this.renderMinimal(usageData);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  renderMinimal(data) {
    const { shortTerm } = data;
    const usage = shortTerm;
    const percentage = usage.percentage;

    let color = chalk.green;
    if (percentage >= 85) {
      color = chalk.red;
    } else if (percentage >= 60) {
      color = chalk.yellow;
    }

    return color(`[${data.providerId || 'CP'}:${percentage}%]`);
  }

  renderCompact(data) {
    const { shortTerm, remaining, modelName, expiry, providerName } = data;
    const usage = shortTerm;
    const percentage = usage.percentage;

    let color = chalk.green;
    if (percentage >= 85) {
      color = chalk.red;
    } else if (percentage >= 60) {
      color = chalk.yellow;
    }

    const status = percentage >= 85 ? "⚠" : percentage >= 60 ? "⚡" : "✓";

    let remainingText = '';
    if (remaining && (remaining.hours > 0 || remaining.minutes > 0)) {
      remainingText = remaining.hours > 0
        ? `${remaining.hours}h${remaining.minutes}m`
        : `${remaining.minutes}m`;
    }

    // 添加到期信息（如果可用）
    const expiryInfo = expiry ? ` ${chalk.cyan('•')} 剩余: ${expiry.daysRemaining}天` : '';

    return `${color("●")} ${modelName} ${color(
      percentage + "%"
    )} ${remainingText} ${status}${expiryInfo}`;
  }
}

// CLI 使用
async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--minimal") ? "minimal" : "compact";

  const prompt = new PromptStatus();
  const output = await prompt.getPromptStatus(mode);

  if (output) {
    console.log(output);
  } else {
    // 静默模式 - 未配置时不输出
  }
}

if (require.main === module) {
  main().catch((error) => {
    // 静默失败，用于提示集成
    process.exit(0);
  });
}

module.exports = PromptStatus;
