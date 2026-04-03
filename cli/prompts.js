#!/usr/bin/env node
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
      if (!providerId) return null;

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

      if (mode === "compact") return this.renderCompact(usageData);
      if (mode === "minimal") return this.renderMinimal(usageData);
      return null;
    } catch (error) {
      return null;
    }
  }

  renderMinimal(data) {
    const { shortTerm } = data;
    const percentage = shortTerm.percentage;

    let color = chalk.green;
    if (percentage >= 85) color = chalk.red;
    else if (percentage >= 60) color = chalk.yellow;

    return color(`[${data.providerId || 'CP'}:${percentage}%]`);
  }

  renderCompact(data) {
    const { shortTerm, weekly } = data;
    const pct5h = shortTerm ? (shortTerm.percentage || 0) : 0;
    const pct7d = weekly ? (weekly.percentage || 0) : 0;

    const getBarColor = (percent, is5h) => {
      // Muted color palette for better visual harmony with claude-hud
      if (is5h) {
        if (percent >= 85) return chalk.hex('#991B1B'); // muted red
        if (percent >= 60) return chalk.hex('#B45309'); // muted amber
      } else {
        if (percent >= 90) return chalk.hex('#991B1B');
        if (percent >= 75) return chalk.hex('#B45309');
      }
      return chalk.hex('#065F46'); // muted green
    };

    const renderBar = (percent, is5h) => {
      const length = 10;
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      const filled = Math.round((p / 100) * length);
      const colorFn = getBarColor(percent, is5h);
      return colorFn('█'.repeat(filled)) + chalk.dim('░'.repeat(length - filled));
    };

    const text5h = `${chalk.dim('5h')} ${pct5h.toString().padStart(3, ' ')}% ${renderBar(pct5h, true)}`;

    if (weekly) {
      const text7d = `${chalk.dim('7d')} ${pct7d.toString().padStart(3, ' ')}% ${renderBar(pct7d, false)}`;
      return ` ${text5h}      ${text7d}`;
    }
    return ` ${text5h}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--minimal") ? "minimal" : "compact";

  const prompt = new PromptStatus();
  const output = await prompt.getPromptStatus(mode);

  if (output) console.log(output);
}

if (require.main === module) {
  main().catch(() => process.exit(0));
}

module.exports = PromptStatus;
