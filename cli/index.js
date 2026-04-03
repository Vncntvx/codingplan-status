#!/usr/bin/env node

// Force color output even in non-TTY environments
process.env.FORCE_COLOR = "1";

const { Command } = require("commander");
const chalk = require("chalk").default;
const ora = require("ora").default;
const StatusBar = require("./status");
const { getConfigManager } = require("./config-manager");
const { listProviders, createProvider, hasProvider } = require("./providers");
const packageJson = require("../package.json");

const program = new Command();
const configManager = getConfigManager();

program
  .name("cps")
  .description("Coding Plan 额度与用量监控工具")
  .version(packageJson.version);

// 供应商管理命令

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

program
  .command("use <provider>")
  .description("切换当前使用的供应商")
  .action((providerId) => {
    if (!hasProvider(providerId)) {
      console.log(chalk.red(`错误: 未知供应商 "${providerId}"`));
      console.log(chalk.gray("运行 \"cps providers\" 查看支持的供应商"));
      process.exit(1);
    }

    const configured = configManager.listConfiguredProviders();
    if (!configured.includes(providerId)) {
      console.log(chalk.yellow(`供应商 "${providerId}" 未配置`));
      console.log(chalk.gray(`运行 \"cps auth ${providerId} <token>\" 进行配置`));
      process.exit(1);
    }

    configManager.setCurrentProvider(providerId);
    console.log(chalk.green(`✓ 已切换至 ${providerId}`));
  });

program
  .command("auth [provider]")
  .description("设置供应商认证凭据")
  .argument("[token]", "API Token/Key")
  .argument("[extra...]", "其他配置参数")
  .action((providerId, token, extra) => {
    if (!providerId) {
      console.log(chalk.bold("\n用法:"));
      console.log("  cps auth <provider> <token>");
      console.log(chalk.bold("\n支持的供应商:"));
      const providers = listProviders();
      for (const p of providers) {
        console.log(`  ${chalk.cyan(p.id)} - ${p.displayName}`);
        console.log(chalk.gray(`    字段: ${p.configSchema.map(f => `${f.key}${f.required ? '(必填)' : ''}`).join(", ")}`));
      }
      console.log();
      return;
    }

    if (!hasProvider(providerId)) {
      console.log(chalk.red(`错误: 未知供应商 "${providerId}"`));
      console.log(chalk.gray("运行 \"cps providers\" 查看支持的供应商"));
      process.exit(1);
    }

    if (!token) {
      console.log(chalk.red("错误: 缺少 Token"));
      console.log(chalk.gray(`用法: cps auth ${providerId} <token>`));
      process.exit(1);
    }

    const { getProviderClass } = require("./providers");
    const ProviderClass = getProviderClass(providerId);
    const schema = ProviderClass.getConfigSchema();
    const credentials = {};

    credentials[schema[0].key] = token;

    if (extra && extra.length > 0 && schema.length > 1) {
      credentials[schema[1].key] = extra[0];
    }

    configManager.setProviderCredentials(providerId, credentials);
    console.log(chalk.green(`✓ ${ProviderClass.displayName} 认证信息已保存`));

    const configured = configManager.listConfiguredProviders();
    if (configured.length === 1) {
      console.log(chalk.gray("已自动设为当前供应商"));
    }
  });

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

// 状态查询命令

function getCurrentProvider() {
  const providerId = configManager.getCurrentProviderId();
  if (!providerId) {
    throw new Error("未配置供应商，请先运行 \"cps auth <provider> <token>\"");
  }
  const credentials = configManager.getProviderCredentials(providerId);
  return createProvider(providerId, credentials);
}

program
  .command("status [provider]")
  .description("显示额度与用量，可指定供应商")
  .option("-c, --compact", "紧凑模式显示")
  .option("-w, --watch", "实时监控模式")
  .action(async (providerId, options) => {
    const spinner = ora("获取额度与用量中...").start();

    try {
      let provider;
      if (providerId) {
        if (!hasProvider(providerId)) {
          spinner.fail(chalk.red(`未知供应商 "${providerId}"`));
          console.log(chalk.gray("运行 \"cps providers\" 查看支持的供应商"));
          process.exit(1);
        }
        const configured = configManager.listConfiguredProviders();
        if (!configured.includes(providerId)) {
          spinner.fail(chalk.red(`供应商 "${providerId}" 未配置`));
          console.log(chalk.gray(`运行 \"cps auth ${providerId} <token>\" 进行配置`));
          process.exit(1);
        }
        const credentials = configManager.getProviderCredentials(providerId);
        provider = createProvider(providerId, credentials);
      } else {
        provider = getCurrentProvider();
      }

      const apiData = await provider.fetchUsageData();

      let usageData;
      if (provider.constructor.id === 'minimax') {
        const subscriptionData = await provider.getSubscriptionDetails();
        usageData = provider.parseWithExpiry(apiData, subscriptionData);

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
        console.log(chalk.gray("监控中，按 Ctrl+C 退出"));
        startWatching(provider, statusBar);
      }
    } catch (error) {
      spinner.fail(chalk.red("获取状态失败"));
      console.error(chalk.red(`错误: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command("list [provider]")
  .description("显示所有模型的额度与用量，可指定供应商")
  .action(async (providerId) => {
    const spinner = ora("获取额度与用量中...").start();

    try {
      let provider;
      if (providerId) {
        if (!hasProvider(providerId)) {
          spinner.fail(chalk.red(`未知供应商 "${providerId}"`));
          console.log(chalk.gray("运行 \"cps providers\" 查看支持的供应商"));
          process.exit(1);
        }
        const configured = configManager.listConfiguredProviders();
        if (!configured.includes(providerId)) {
          spinner.fail(chalk.red(`供应商 "${providerId}" 未配置`));
          console.log(chalk.gray(`运行 \"cps auth ${providerId} <token>\" 进行配置`));
          process.exit(1);
        }
        const credentials = configManager.getProviderCredentials(providerId);
        provider = createProvider(providerId, credentials);
      } else {
        provider = getCurrentProvider();
      }

      const apiData = await provider.fetchUsageData();

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

program
  .command("bar")
  .description("在终端底部持续显示状态栏")
  .action(async () => {
    const TerminalStatusBar = require("./statusbar");
    const statusBar = new TerminalStatusBar();
    await statusBar.start();
  });

program
  .command("setup <target>")
  .description("配置状态栏集成 (claude | droid)")
  .option("-r, --remove", "移除状态栏集成")
  .action((target, options) => {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    if (target === "droid") {
      const factoryDir = path.join(os.homedir(), ".factory");
      const settingsPath = path.join(factoryDir, "settings.json");

      if (options.remove) {
        if (!fs.existsSync(settingsPath)) {
          console.log(chalk.yellow("Droid 配置文件不存在，无需移除"));
          return;
        }

        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          if (settings.statusLine && settings.statusLine.command === "cps-droid-statusline") {
            delete settings.statusLine;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            console.log(chalk.green("✓ Droid 状态栏集成已移除"));
            console.log(chalk.gray(`  配置文件: ${settingsPath}`));
          } else {
            console.log(chalk.yellow("Droid 状态栏集成未配置或使用其他命令"));
          }
        } catch (e) {
          console.log(chalk.red(`读取配置文件失败: ${e.message}`));
        }
      } else {
        if (!fs.existsSync(factoryDir)) {
          fs.mkdirSync(factoryDir, { recursive: true });
        }

        let settings = {};
        if (fs.existsSync(settingsPath)) {
          try {
            settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          } catch (e) {
            settings = {};
          }
        }

        settings.statusLine = {
          type: "command",
          command: "cps-droid-statusline"
        };

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(chalk.green("✓ Droid 状态栏集成已配置"));
        console.log(chalk.gray(`  配置文件: ${settingsPath}`));
        console.log(chalk.gray("  重启 Droid 后生效"));
      }
    } else if (target === "claude") {
      const claudeDir = path.join(os.homedir(), ".claude");
      const settingsPath = path.join(claudeDir, "settings.json");
      const wrapperPath = path.join(claudeDir, "cps-wrapper.js");
      const originalCmdPath = path.join(claudeDir, "cps-hud-cmd.json");

      if (options.remove) {
        if (!fs.existsSync(settingsPath)) {
          console.log(chalk.yellow("Claude Code 配置文件不存在，无需移除"));
          return;
        }
        try {
          let updated = false;
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

          if (settings.statusLine && (
              settings.statusLine.command === "cps-claudecode-statusline" ||
              settings.statusLine.command.includes("cps-wrapper.js")
          )) {
            delete settings.statusLine;
            updated = true;

            if (fs.existsSync(originalCmdPath)) {
              try {
                const originalCmd = JSON.parse(fs.readFileSync(originalCmdPath, "utf8")).command;
                if (originalCmd) {
                  settings.statusLine = { type: "command", command: originalCmd };
                }
              } catch(e) {}
            }
          }

          if (settings.prompt && settings.prompt.command === "cps-prompt") {
            delete settings.prompt;
            updated = true;
          }

          if (updated) {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            console.log(chalk.green("✓ Claude Code 状态栏集成已移除"));
            console.log(chalk.gray(`  配置文件: ${settingsPath}`));
          } else {
            console.log(chalk.yellow("未检测到 cps 状态栏配置，无需更改"));
          }
        } catch (e) {
          console.log(chalk.red(`读取配置文件失败: ${e.message}`));
        }
      } else {
        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }

        let settings = {};
        if (fs.existsSync(settingsPath)) {
          try {
            settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          } catch (e) {
            settings = {};
          }
        }

        if (settings.prompt && settings.prompt.command === "cps-prompt") {
          delete settings.prompt;
        }

        let currentCmd = settings.statusLine ? settings.statusLine.command : null;
        let isAlreadyWrapped = currentCmd && currentCmd.includes('cps-wrapper.js');

        if (currentCmd && !isAlreadyWrapped && currentCmd !== "cps-claudecode-statusline") {
          fs.writeFileSync(originalCmdPath, JSON.stringify({ command: currentCmd }));
        }

        const wrapperContent = `#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

let input = '';
try {
  input = fs.readFileSync(0, 'utf-8');
} catch(e) {}

// 运行原有 HUD（输出在上方）
const originalCmdPath = path.join(os.homedir(), '.claude', 'cps-hud-cmd.json');
if (fs.existsSync(originalCmdPath)) {
  try {
    const originalCmd = JSON.parse(fs.readFileSync(originalCmdPath, 'utf8')).command;
    if (originalCmd) {
      const hudOut = execSync(originalCmd, { input, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      if (hudOut) {
         process.stdout.write(hudOut);
         if (!hudOut.endsWith('\\n')) process.stdout.write('\\n');
      }
    }
  } catch(e) {}
}

// 追加额度提示
try {
  const cpsOut = execSync('cps-claudecode-statusline', { input, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
  if (cpsOut) process.stdout.write(cpsOut);
} catch(e) {}
`;
        fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });

        settings.statusLine = {
          type: "command",
          command: `node "${wrapperPath}"`
        };

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(chalk.green("✓ Claude Code 状态栏集成已配置"));
        console.log(chalk.gray(`  配置文件: ${settingsPath}`));
        console.log(chalk.gray("  重启 Claude Code 后生效"));
      }
    } else {
      console.log(chalk.red(`错误: 未知集成目标 "${target}"`));
      console.log(chalk.gray("支持: claude, droid"));
      process.exit(1);
    }
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

if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(1);
}

program.parse();
