#!/usr/bin/env node

const { getConfigManager } = require('./config-manager');
const { getUsageFetcher } = require('./usage-fetcher');
const { renderCompact, renderMinimal } = require('./renderers');

class PromptStatus {
  constructor() {
    this.configManager = getConfigManager();
    this.usageFetcher = getUsageFetcher();
  }

  async getPromptStatus(mode = 'compact') {
    try {
      const providerId = this.configManager.getCurrentProviderId();
      if (!providerId) return null;

      const usageData = await this.usageFetcher.fetch();
      if (!usageData) return null;

      if (mode === 'compact') return renderCompact(usageData);
      if (mode === 'minimal') return renderMinimal(usageData);
      return null;
    } catch (error) {
      if (process.env.CPS_DEBUG) {
        console.error('[PromptStatus] Error:', error.message);
      }
      return null;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--minimal') ? 'minimal' : 'compact';

  const prompt = new PromptStatus();
  const output = await prompt.getPromptStatus(mode);

  if (output) console.log(output);
}

if (require.main === module) {
  main().catch(() => process.exit(0));
}

module.exports = PromptStatus;
