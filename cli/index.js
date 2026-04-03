#!/usr/bin/env node

// Force color output even in non-TTY environments (e.g., Claude Code statusline)
process.env.FORCE_COLOR = "1";

const { Command } = require("commander");
const chalk = require("chalk").default;
const ora = require("ora").default;
const StatusBar = require("./status");
const TranscriptParser = require("./transcript-parser");
const ConfigCounter = require("./config-counter");
const Renderer = require("./renderer");
const { getConfigManager } = require("./config-manager");
const { listProviders, createProvider, hasProvider, getProviderIds } = require("./providers");
const packageJson = require("../package.json");

const program = new Command();
const transcriptParser = new TranscriptParser();
const configCounter = new ConfigCounter();
const renderer = new Renderer();
const configManager = getConfigManager();

program
  .name("cps")
  .description("Coding Plan 额度与用量监控工具")
  .version(packageJson.version);

// ==================== 供应商管理命令 ====================

// 列出所有支持的供应商
program
  .command("providers")
  .description("列出所有支持的供应商")
  .action(() => {
    const providers = listProviders();
    const configured = configManager.listConfiguredProviders();
    const current = configManager.getCurrentProviderId();

    console.log(chalk.bold("\n支持的供应商:\n"));

    for (const p of providers) {
      const isConfigured = configured.includes(p.id);
      const isCurrent = current === p.id;
      const status = isCurrent ? chalk.green(" ● 当前") :
                     isConfigured ? chalk.cyan(" ○ 已配置") : chalk.gray("   未配置");
      console.log(`  ${chalk.cyan(p.id.padEnd(10))} ${p.displayName}${status}`);
    }

    if (configured.length > 0) {
      console.log(chalk.bold("\n使用 \"cps status <provider>\" 查看特定供应商状态"));
    }
    console.log();
  });

// 切换供应商
program
  .command("use <provider>")
  .description("切换当前使用的供应商")
  .action((providerId) => {
    if (!hasProvider(providerId)) {
      console.log(chalk.red(`错误: 未知的供应商 "${providerId}"`));
      console.log(chalk.gray(`运行 "cps providers" 查看支持的供应商`));
      process.exit(1);
    }

    const configured = configManager.listConfiguredProviders();
    if (!configured.includes(providerId)) {
      console.log(chalk.yellow(`供应商 "${providerId}" 尚未配置`));
      console.log(chalk.gray(`运行 "cps auth ${providerId} <token>" 进行配置`));
      process.exit(1);
    }

    configManager.setCurrentProvider(providerId);
    console.log(chalk.green(`✓ 已切换到 ${providerId}`));
  });

// 认证命令 (支持多供应商)
program
  .command("auth [provider]")
  .description("设置供应商认证凭据")
  .argument("[token]", "API Token/Key")
  .argument("[extra...]", "其他配置参数")
  .action((providerId, token, extra) => {
    // 如果没有参数，显示帮助
    if (!providerId) {
      console.log(chalk.bold("\n用法:"));
      console.log(`  cps auth <provider> <token>`);
      console.log(chalk.bold("\n支持的供应商:"));
      const providers = listProviders();
      for (const p of providers) {
        console.log(`  ${chalk.cyan(p.id)} - ${p.displayName}`);
        console.log(chalk.gray(`    字段: ${p.configSchema.map(f => `${f.key}${f.required ? '(必填)' : ''}`).join(", ")}`));
      }
      console.log();
      return;
    }

    // 如果第一个参数不是有效的 provider，提示错误
    if (!hasProvider(providerId)) {
      console.log(chalk.red(`错误: 未知的供应商 "${providerId}"`));
      console.log(chalk.gray(`运行 "cps providers" 查看支持的供应商`));
      process.exit(1);
    }

    if (!token) {
      console.log(chalk.red("错误: 请提供 Token"));
      console.log(chalk.gray(`用法: cps auth ${providerId} <token>`));
      process.exit(1);
    }

    const { getProviderClass } = require("./providers");
    const ProviderClass = getProviderClass(providerId);
    const schema = ProviderClass.getConfigSchema();
    const credentials = {};

    // 第一个字段是 token
    credentials[schema[0].key] = token;

    // 处理额外参数
    if (extra && extra.length > 0 && schema.length > 1) {
      credentials[schema[1].key] = extra[0];
    }

    configManager.setProviderCredentials(providerId, credentials);
    console.log(chalk.green(`✓ ${ProviderClass.displayName} 认证信息已保存`));

    // 如果这是第一个配置的供应商，提示
    const configured = configManager.listConfiguredProviders();
    if (configured.length === 1) {
      console.log(chalk.gray(`已自动设置为当前供应商`));
    }
  });

// 查看当前配置
program
  .command("config")
  .description("查看当前配置")
  .action(() => {
    const current = configManager.getCurrentProviderId();
    const configured = configManager.listConfiguredProviders();

    console.log(chalk.bold("\n当前配置:\n"));
    console.log(`配置文件: ${chalk.gray(configManager.getConfigPath())}`);
    console.log(`当前供应商: ${current ? chalk.cyan(current) : chalk.gray("未设置")}`);
    console.log(`\n已配置的供应商:`);

    if (configured.length === 0) {
      console.log(chalk.gray("  (无)"));
    } else {
      for (const id of configured) {
        const creds = configManager.getProviderCredentials(id);
        const isCurrent = id === current;
        console.log(`  ${isCurrent ? chalk.green("●") : "○"} ${id}: ${Object.keys(creds).join(", ")}`);
      }
    }
    console.log();
  });

// ==================== 状态查询命令 ====================

// 获取当前供应商实例的辅助函数
function getCurrentProvider() {
  const providerId = configManager.getCurrentProviderId();
  if (!providerId) {
    throw new Error("未配置供应商。请先运行 \"cps auth <provider> <token>\"");
  }
  const credentials = configManager.getProviderCredentials(providerId);
  return createProvider(providerId, credentials);
}

// Status command (显示当前额度与用量)
program
  .command("status [provider]")
  .description("显示额度与用量，可指定供应商")
  .option("-c, --compact", "紧凑模式显示")
  .option("-w, --watch", "实时监控模式")
  .action(async (providerId, options) => {
    const spinner = ora("获取额度与用量中...").start();

    try {
      // 如果指定了供应商，使用指定的；否则使用当前供应商
      let provider;
      if (providerId) {
        if (!hasProvider(providerId)) {
          spinner.fail(chalk.red(`未知的供应商 "${providerId}"`));
          console.log(chalk.gray(`运行 "cps providers" 查看支持的供应商`));
          process.exit(1);
        }
        const configured = configManager.listConfiguredProviders();
        if (!configured.includes(providerId)) {
          spinner.fail(chalk.red(`供应商 "${providerId}" 尚未配置`));
          console.log(chalk.gray(`运行 "cps auth ${providerId} <token>" 进行配置`));
          process.exit(1);
        }
        const credentials = configManager.getProviderCredentials(providerId);
        provider = createProvider(providerId, credentials);
      } else {
        provider = getCurrentProvider();
      }

      const apiData = await provider.fetchUsageData();

      // MiniMax 需要额外获取订阅信息
      let usageData;
      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);

        // 获取消耗统计
        try {
          const usageStats = await provider.getUsageStats();
          if (usageStats) {
            usageData.usageStats = usageStats;
          }
        } catch (e) {
          // 忽略统计获取失败
        }
      } else {
        usageData = provider.parseUsageData(apiData);
      }

      const allModels = provider.parseAllModels ? provider.parseAllModels(apiData) : [];

      spinner.succeed("状态获取成功");

      const statusBar = new StatusBar(usageData, usageData.usageStats || null, provider, allModels);

      if (options.compact) {
        console.log(statusBar.renderCompact());
      } else {
        const statusBarWithModels = new StatusBar(usageData, usageData.usageStats || null, provider, allModels);
        console.log("\n" + statusBarWithModels.render() + "\n");
      }

      if (options.watch) {
        console.log(chalk.gray("监控中... 按 Ctrl+C 退出"));
        startWatching(provider, statusBar);
      }
    } catch (error) {
      spinner.fail(chalk.red("获取状态失败"));
      console.error(chalk.red(`错误: ${error.message}`));
      process.exit(1);
    }
  });

// List command (显示所有模型的额度与用量)
program
  .command("list [provider]")
  .description("显示所有模型的额度与用量，可指定供应商")
  .action(async (providerId) => {
    const spinner = ora("获取额度与用量中...").start();

    try {
      // 如果指定了供应商，使用指定的；否则使用当前供应商
      let provider;
      if (providerId) {
        if (!hasProvider(providerId)) {
          spinner.fail(chalk.red(`未知的供应商 "${providerId}"`));
          console.log(chalk.gray(`运行 "cps providers" 查看支持的供应商`));
          process.exit(1);
        }
        const configured = configManager.listConfiguredProviders();
        if (!configured.includes(providerId)) {
          spinner.fail(chalk.red(`供应商 "${providerId}" 尚未配置`));
          console.log(chalk.gray(`运行 "cps auth ${providerId} <token>" 进行配置`));
          process.exit(1);
        }
        const credentials = configManager.getProviderCredentials(providerId);
        provider = createProvider(providerId, credentials);
      } else {
        provider = getCurrentProvider();
      }

      const apiData = await provider.fetchUsageData();

      // MiniMax 需要额外获取订阅信息
      let usageData;
      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);
      } else {
        usageData = provider.parseUsageData(apiData);
      }

      const allModels = provider.parseAllModels ? provider.parseAllModels(apiData) : [];

      spinner.succeed("状态获取成功");
      const statusBarWithModels = new StatusBar(usageData, null, null, allModels);
      console.log("\n" + statusBarWithModels.render() + "\n");
    } catch (error) {
      spinner.fail(chalk.red("获取状态失败"));
      console.error(chalk.red(`错误: ${error.message}`));
      process.exit(1);
    }
  });

// StatusBar command (持续显示在终端底部)
program
  .command("bar")
  .description("在终端底部持续显示状态栏")
  .action(async () => {
    const TerminalStatusBar = require("./statusbar");
    const statusBar = new TerminalStatusBar();
    await statusBar.start();
  });

// Statusline command - 单次输出模式（Claude Code自己控制刷新）
program
  .command("statusline")
  .description("Claude Code状态栏集成（从stdin读取数据，单次输出）")
  .action(async () => {
    let stdinData = null;
    if (!process.stdin.isTTY) {
      const readStdin = async () => {
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString();
      };

      try {
        const stdinString = await Promise.race([
          readStdin(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('stdin timeout')), 1000))
        ]);

        if (stdinString.trim()) {
          try {
            stdinData = JSON.parse(stdinString);
          } catch (e) {
            // 静默忽略解析错误
          }
        }
      } catch (e) {
        // 超时或其他错误，静默继续
      }
    }

    const cliCurrentDir = process.cwd().split(/[/\\]/).pop();

    try {
      const provider = getCurrentProvider();
      const apiData = await provider.fetchUsageData();

      // MiniMax 需要额外获取订阅信息
      let usageData;
      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);
      } else {
        usageData = provider.parseUsageData(apiData);
      }

      const { shortTerm: usage, modelName, remaining, expiry } = usageData;
      const percentage = usage.percentage;

      let displayModel = modelName;
      let currentDir = null;
      let modelId = null;
      let contextSize = 204800;

      if (stdinData) {
        if (stdinData.model && stdinData.model.display_name) {
          displayModel = stdinData.model.display_name;
          modelId = stdinData.model.id;
        } else if (stdinData.model && stdinData.model.id) {
          displayModel = stdinData.model.id;
          modelId = stdinData.model.id;
        }

        if (stdinData.workspace && stdinData.workspace.current_directory) {
          currentDir = stdinData.workspace.current_directory.split("/").pop();
        }
      } else {
        modelId = modelName.toLowerCase().replace(/\s+/g, "-");
      }

      let contextUsageTokens = null;
      if (stdinData && stdinData.transcript_path) {
        contextUsageTokens = await transcriptParser.findLatestUsage(stdinData.transcript_path);
      }

      const displayDir = currentDir || cliCurrentDir || "";

      let configCounts = { claudeMdCount: 0, rulesCount: 0, mcpCount: 0, hooksCount: 0 };
      const workspacePath = stdinData?.workspace?.current_directory || process.cwd();
      if (workspacePath) {
        try {
          configCounts = await Promise.race([
            configCounter.count(workspacePath),
            new Promise((_, reject) => setTimeout(() => reject(new Error('config timeout')), 2000))
          ]);
        } catch (e) {
          // 超时或失败，保持默认值
        }
      }

      // 获取 git 分支信息
      const gitSearchPath = workspacePath || process.cwd();
      let gitBranch = null;
      if (gitSearchPath) {
        try {
          const branch = require('child_process').execSync(
            'git symbolic-ref --short HEAD',
            { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
          ).trim();
          if (branch) {
            gitBranch = { name: branch };

            let hasUpstream = false;
            try {
              const revList = require('child_process').execSync(
                'git rev-list --left-right --count HEAD...@{upstream}',
                { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
              ).trim();
              if (revList) {
                hasUpstream = true;
                const [behind, ahead] = revList.split(/\s+/).map(n => parseInt(n) || 0);
                if (ahead > 0 || behind > 0) {
                  gitBranch.ahead = ahead;
                  gitBranch.behind = behind;
                }
              }
            } catch (e) {}

            if (!hasUpstream) {
              try {
                const localCommits = require('child_process').execSync(
                  'git rev-list --count HEAD',
                  { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
                ).trim();
                const commitCount = parseInt(localCommits) || 0;
                if (commitCount > 1) {
                  gitBranch.ahead = -1;
                }
              } catch (e) {}
            }

            try {
              const status = require('child_process').execSync(
                'git status --porcelain',
                { cwd: gitSearchPath, encoding: 'utf8', timeout: 3000 }
              ).trim();
              if (status) {
                gitBranch.hasChanges = true;
              }
            } catch (e) {}
          }
        } catch (e) {}
      }

      let contextUsageValue = 0;
      let contextSizeValue = contextSize;

      if (stdinData?.context_window) {
        const cw = stdinData.context_window;
        contextSizeValue = cw.context_window_size || contextSize;
        contextUsageValue = cw.tokens_used || contextUsageTokens || 0;
      } else {
        contextUsageValue = contextUsageTokens || 0;
      }

      const context = {
        modelName: displayModel,
        currentDir: displayDir,
        usagePercentage: percentage,
        usage,
        remaining,
        expiry,
        weekly: usageData.weekly,
        monthly: usageData.monthly,
        contextUsage: contextUsageValue,
        contextSize: contextSizeValue,
        configCounts,
        gitBranch,
        tools: [],
        agents: [],
        todos: [],
      };

      if (stdinData && stdinData.transcript_path) {
        const transcript = await transcriptParser.parse(stdinData.transcript_path);
        context.tools = transcript.tools;
        context.agents = transcript.agents;
        context.todos = transcript.todos;
      }

      console.log(renderer.render(context));
    } catch (error) {
      console.log(`❌ 错误: ${error.message}`);
    }
  });

// Droid-statusline command - Droid 状态栏集成
program
  .command("droid-statusline")
  .description("Droid状态栏集成（从 session 文件读取数据，单次输出）")
  .argument("[sessionPath]", "Droid session 目录路径（可选，默认自动查找）")
  .action(async (sessionPath) => {
    const fs = require("fs");
    const path = require("path");

    // 查找 session 目录
    let targetSessionPath = sessionPath;
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

    // 读取 settings.json
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

    // 读取 jsonl 获取 cwd 和模型信息
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

    // 获取 API 使用量
    let usageData = null;
    try {
      const provider = getCurrentProvider();
      const apiData = await provider.fetchUsageData();

      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);
      } else {
        usageData = provider.parseUsageData(apiData);
      }
    } catch (e) {
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

    // 获取 git 分支
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

      // 括号内展示已用/总额，和百分比（已用）保持一致
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
  });

function startWatching(provider, statusBar) {
  let intervalId;

  const update = async () => {
    try {
      const apiData = await provider.fetchUsageData();

      let usageData;
      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);
      } else {
        usageData = provider.parseUsageData(apiData);
      }

      const newStatusBar = new StatusBar(usageData);

      process.stdout.write("\x1Bc");

      console.log("\n" + newStatusBar.render() + "\n");
      console.log(chalk.gray(`最后更新: ${new Date().toLocaleTimeString()}`));
    } catch (error) {
      console.error(chalk.red(`更新失败: ${error.message}`));
    }
  };

  update();

  intervalId = setInterval(update, 10000);

  process.on("SIGINT", () => {
    clearInterval(intervalId);
    console.log(chalk.yellow("\n监控已停止"));
    process.exit(0);
  });
}

// 如果没有命令提供帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(1);
}

program.parse();
