#!/usr/bin/env node

// Force color output even in non-TTY environments
process.env.FORCE_COLOR = "1";

const fs = require("fs");
const path = require("path");
const chalk = require("chalk").default;
const { getConfigManager } = require("./config-manager");
const { createProvider } = require("./providers");

const configManager = getConfigManager();

async function main() {
  let targetSessionPath = process.argv[2];
  const currentCwd = process.cwd().replace(/\\/g, "/");

  if (!targetSessionPath) {
    const sessionsDir = path.join(process.env.HOME || process.env.USERPROFILE, ".factory", "sessions");

    if (!fs.existsSync(sessionsDir)) {
      console.log("❌ 未找到 Droid sessions 目录");
      process.exit(1);
    }

    const userDirs = fs.readdirSync(sessionsDir);
    let matchedSession = null;
    let latestSession = null;
    let latestStartTime = 0;

    for (const userDir of userDirs) {
      const userPath = path.join(sessionsDir, userDir);
      if (!fs.statSync(userPath).isDirectory()) continue;

      const sessions = fs.readdirSync(userPath);
      for (const session of sessions) {
        if (!session.endsWith(".jsonl")) continue;

        const jsonlPath = path.join(userPath, session);
        try {
          const content = fs.readFileSync(jsonlPath, "utf8");
          const firstLine = content.split("\n")[0];
          const entry = JSON.parse(firstLine);

          if (entry.cwd) {
            const sessionCwd = entry.cwd.replace(/\\/g, "/");
            if (sessionCwd === currentCwd || currentCwd.includes(sessionCwd) || sessionCwd.includes(currentCwd)) {
              if (!matchedSession) {
                matchedSession = userPath;
              }
            }
          }

          if (entry.timestamp) {
            const startTime = new Date(entry.timestamp).getTime();
            if (startTime > latestStartTime) {
              latestStartTime = startTime;
              latestSession = userPath;
            }
          }
        } catch (e) {}
      }
    }

    targetSessionPath = matchedSession || latestSession;

    if (!targetSessionPath) {
      console.log("❌ 未找到 Droid session");
      process.exit(1);
    }
  }

  const settingsFiles = fs.readdirSync(targetSessionPath).filter(f => f.endsWith(".settings.json"));
  let settings = {};

  for (const sf of settingsFiles) {
    try {
      const content = fs.readFileSync(path.join(targetSessionPath, sf), "utf8");
      const parsed = JSON.parse(content);
      if (parsed.tokenUsage) {
        settings = parsed;
        break;
      }
    } catch (e) {}
  }

  let cwd = process.cwd();
  let jsonlTokens = null;
  const jsonlFiles = fs.readdirSync(targetSessionPath).filter(f => f.endsWith(".jsonl"));

  for (const jf of jsonlFiles) {
    try {
      const content = fs.readFileSync(path.join(targetSessionPath, jf), "utf8");
      const lines = content.split('\n').filter(l => l.trim());

      if (lines.length > 0) {
        try {
          const firstEntry = JSON.parse(lines[0]);
          if (firstEntry.cwd) {
            cwd = firstEntry.cwd;
          }
        } catch (e) {}
      }

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.type === 'message' && entry.message?.role === 'assistant' && entry.message?.usage) {
            const u = entry.message.usage;
            jsonlTokens = {
              inputTokens: u.input_tokens || u.prompt_tokens || 0,
              outputTokens: u.output_tokens || u.completion_tokens || 0,
              cacheCreationTokens: u.cache_creation_input_tokens || u.cache_creation_prompt_tokens || 0,
              cacheReadTokens: u.cache_read_input_tokens || u.cache_read_prompt_tokens || 0,
              thinkingTokens: u.thinking_tokens || 0
            };
            break;
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {}
  }

  const currentDir = cwd.split(/[/\\]/).pop();

  const tokenUsage = (jsonlTokens && (jsonlTokens.inputTokens > 0 || jsonlTokens.outputTokens > 0))
    ? jsonlTokens
    : (settings.tokenUsage || {});

  const inputTokens = tokenUsage.inputTokens || 0;
  const outputTokens = tokenUsage.outputTokens || 0;
  const cacheCreationTokens = tokenUsage.cacheCreationTokens || 0;
  const thinkingTokens = tokenUsage.thinkingTokens || 0;

  const contextTokens = inputTokens + outputTokens + cacheCreationTokens + thinkingTokens;

  const modelName = settings.model || "Coding Plan";
  const modelDisplayName = modelName.replace(/^custom:/, "").replace(/-[0-9]+$/, "");

  let usageData = null;
  try {
    const providerId = configManager.getCurrentProviderId();
    if (providerId) {
      const credentials = configManager.getProviderCredentials(providerId);
      const provider = createProvider(providerId, credentials);
      const apiData = await provider.fetchUsageData();

      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);
      } else {
        usageData = provider.parseUsageData(apiData);
      }
    }
  } catch (e) {}

  if (!usageData) {
    usageData = {
      shortTerm: { percentage: 0, used: 0, total: 0, remaining: 0 },
      weekly: null,
      monthly: null,
      remaining: { hours: 0, minutes: 0, text: "未知" },
      expiry: null,
      modelName: modelDisplayName
    };
  }

  const { shortTerm: usage, weekly, monthly, remaining, expiry } = usageData;

  let gitBranch = null;
  try {
    const branch = require('child_process').execSync(
      'git symbolic-ref --short HEAD',
      { cwd: cwd, encoding: 'utf8', timeout: 3000 }
    ).trim();
    if (branch) {
      gitBranch = { name: branch };

      try {
        const status = require('child_process').execSync(
          'git status --porcelain',
          { cwd: cwd, encoding: 'utf8', timeout: 3000 }
        ).trim();
        if (status) {
          gitBranch.hasChanges = true;
        }
      } catch (e) {}
    }
  } catch (e) {}

  const contextUsageValue = contextTokens;
  const contextSizeValue = 204800;

  const blocks = [];

  if (currentDir) {
    blocks.push({ text: ` ${currentDir} `, bg: '#1D4ED8' });
  }

  const useNerdFonts = !process.env.MINIMAX_PLAIN_UI && !process.env.NO_NERD_FONTS;
  const arrow = useNerdFonts ? '\uE0B0' : '>';
  const branchIcon = useNerdFonts ? '\uE0A0' : '*';

  if (gitBranch && gitBranch.name) {
    let branchStr = gitBranch.name;
    if (branchStr.length > 20) branchStr = branchStr.substring(0, 10) + '…' + branchStr.substring(branchStr.length - 7);
    if (gitBranch.hasChanges) {
      branchStr += ' *';
    }
    blocks.push({ text: ` ${branchIcon} ${branchStr} `, bg: '#7E22CE' });
  }

  if (usage && usage.total > 0) {
    let bg = '#065F46';
    if (usage.percentage >= 95) bg = '#991B1B';
    else if (usage.percentage >= 75) bg = '#9A3412';

    let usageText = ` ${usage.percentage}%  (${usage.used}/${usage.total}) `;
    if (weekly) {
      if (weekly.unlimited) {
        usageText += `· W ∞ `;
      } else {
        usageText += `· W ${weekly.percentage}% `;
      }
    }
    blocks.push({ text: usageText, bg: bg });
  }

  if (remaining && remaining.hours > 0) {
    const remainingText = remaining.hours > 0
      ? `${remaining.hours}h${remaining.minutes}m`
      : `${remaining.minutes}m`;
    blocks.push({ text: ` ${remainingText} `, bg: '#92400E' });
  }

  if (expiry) {
    let bg = '#374151';
    if (expiry.daysRemaining <= 7) bg = '#9A3412';
    if (expiry.daysRemaining <= 3) bg = '#991B1B';
    blocks.push({ text: ` 剩${expiry.daysRemaining}天 `, bg: bg });
  }

  let out = '';
  const leftArrow = useNerdFonts ? '\uE0B0' : '>';

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    if (i === 0) {
      out += '\u001b[0m' + chalk.bgHex(b.bg).black(leftArrow);
    }

    out += '\u001b[0m' + chalk.bgHex(b.bg).bold.whiteBright(b.text);

    if (i < blocks.length - 1) {
      const nextB = blocks[i + 1];
      if (useNerdFonts) {
        out += '\u001b[0m' + chalk.bgHex(nextB.bg).hex(b.bg)(arrow);
      } else {
        out += '\u001b[0m' + chalk.bgHex(b.bg).bold.whiteBright(arrow);
      }
    } else {
      out += '\u001b[0m' + chalk.hex(b.bg)(arrow);
    }
  }

  console.log(out);
}

main();
