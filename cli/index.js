#!/usr/bin/env node

// Force color output even in non-TTY environments
process.env.FORCE_COLOR = "1";

const { Command } = require("commander");
const chalk = require("chalk").default;
const ora = require("ora").default;
const StatusBar = require("./status");
const { getConfigManager } = require("./config-manager");
const { getUsageFetcher } = require("./usage-fetcher");
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
    const settings = configManager.config.settings || {};

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

    console.log(chalk.bold("\n设置:"));
    console.log(`  缓存 TTL: ${settings.cacheTTL || 30000} ms`);
    console.log(`  调试模式: ${settings.debug ? chalk.green("开启") : chalk.gray("关闭")}`);
    console.log();
  });

// 配置管理子命令
program
  .command("config-set <key> <value>")
  .description("设置配置项")
  .action((key, value) => {
    const validKeys = ['cacheTTL', 'debug', 'idleTimeout', 'maxRetries'];
    if (!validKeys.includes(key)) {
      console.log(chalk.red(`错误: 未知的配置项 "${key}"`));
      console.log(chalk.gray(`支持的配置项: ${validKeys.join(', ')}`));
      process.exit(1);
    }

    let parsedValue;
    if (key === 'cacheTTL') {
      parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue) || parsedValue < 5000 || parsedValue > 60000) {
        console.log(chalk.red("错误: cacheTTL 必须是 5000-60000 之间的整数（毫秒）"));
        process.exit(1);
      }
    } else if (key === 'idleTimeout') {
      parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue) || parsedValue < 0) {
        console.log(chalk.red("错误: idleTimeout 必须是 >= 0 的整数（毫秒），0 表示禁用"));
        process.exit(1);
      }
    } else if (key === 'maxRetries') {
      parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 10) {
        console.log(chalk.red("错误: maxRetries 必须是 0-10 之间的整数"));
        process.exit(1);
      }
    } else if (key === 'debug') {
      parsedValue = value === 'true' || value === '1';
    }

    configManager.updateSetting(key, parsedValue);
    console.log(chalk.green(`✓ 已设置 ${key} = ${parsedValue}`));
  });

program
  .command("config-get [key]")
  .description("获取配置项")
  .action((key) => {
    const settings = configManager.config.settings || {};

    if (key) {
      const value = settings[key];
      console.log(value !== undefined ? value : chalk.gray("(未设置)"));
    } else {
      console.log(chalk.bold("\n配置项:"));
      console.log(`  cacheTTL: ${settings.cacheTTL || 30000} ms`);
      console.log(`  debug: ${settings.debug || false}`);
      console.log(`  idleTimeout: ${settings.idleTimeout || 3600000} ms (${settings.idleTimeout === 0 ? '禁用' : Math.floor((settings.idleTimeout || 3600000) / 60000) + ' 分钟'})`);
      console.log(`  maxRetries: ${settings.maxRetries || 3}`);
      console.log();
    }
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
  .option("-f, --force", "强制刷新缓存")
  .action(async (providerId, options) => {
    const spinner = ora("获取额度与用量中...").start();

    try {
      const usageFetcher = getUsageFetcher();

      // 验证供应商
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
      }

      const usageData = await usageFetcher.fetch({
        forceRefresh: options.force,
        providerId: providerId
      });

      if (!usageData) {
        spinner.fail(chalk.red("获取状态失败"));
        console.log(chalk.gray("请检查网络连接或 API 凭据"));
        process.exit(1);
      }

      spinner.succeed("状态获取成功");

      const statusBar = new StatusBar(usageData, usageData.usageStats || null, null, []);

      if (options.compact) {
        console.log(statusBar.renderCompact());
      } else {
        console.log("\n" + statusBar.render() + "\n");
      }

      if (options.watch) {
        console.log(chalk.gray("监控中，按 Ctrl+C 退出"));
        startWatching(providerId);
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
      const usageFetcher = getUsageFetcher();

      // 验证供应商
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
      }

      const usageData = await usageFetcher.fetch({ providerId });

      if (!usageData) {
        spinner.fail(chalk.red("获取状态失败"));
        process.exit(1);
      }

      spinner.succeed("状态获取成功");
      const statusBar = new StatusBar(usageData, null, null, usageData.allModels || []);
      console.log("\n" + statusBar.render() + "\n");
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
  .description("配置状态栏集成 (claude)")
  .option("-r, --remove", "移除状态栏集成")
  .action((target, options) => {
    const { getClaudeSettingsManager } = require("./claude-settings-manager");

    if (target === "claude") {
      const manager = getClaudeSettingsManager();
      const CPS_STATUS_COMMAND = "cps-client status";

      if (options.remove) {
        const result = manager.removeStatusLine();

        if (!result.success) {
          console.log(chalk.red(`错误: ${result.error}`));
          console.log(chalk.yellow("提示: 可尝试从备份恢复:"));
          console.log(chalk.gray(`  备份文件: ${manager.getBackupPath()}`));
          process.exit(1);
        }

        if (!result.wasModified) {
          console.log(chalk.yellow(result.message));
          return;
        }

        if (result.restoredOriginal) {
          console.log(chalk.green("✓ Claude Code 状态栏集成已移除，原配置已恢复"));
        } else {
          console.log(chalk.green("✓ Claude Code 状态栏集成已移除"));
        }
        console.log(chalk.gray(`  配置文件: ${manager.getSettingsPath()}`));

      } else {
        const result = manager.configureStatusLine(CPS_STATUS_COMMAND);

        if (!result.success) {
          console.log(chalk.red(`错误: ${result.error}`));
          console.log(chalk.yellow("提示: 可尝试从备份恢复:"));
          console.log(chalk.gray(`  备份文件: ${manager.getBackupPath()}`));
          process.exit(1);
        }

        if (!result.wasModified) {
          console.log(chalk.green("✓ 状态栏集成已配置，无需更改"));
        } else {
          console.log(chalk.green("✓ Claude Code 状态栏集成已配置"));
        }
        console.log(chalk.gray(`  配置文件: ${manager.getSettingsPath()}`));
        console.log(chalk.gray("  使用 \"cps setup claude --remove\" 可恢复原配置"));
      }
    } else {
      console.log(chalk.red(`错误: 未知集成目标 "${target}"`));
      console.log(chalk.gray("支持: claude"));
      process.exit(1);
    }
  });

// 守护进程管理命令
program
  .command("daemon <action>")
  .description("管理守护进程 (start|stop|status|restart)")
  .action(async (action) => {
    const fs = require("fs");
    const path = require("path");
    const { sendDaemonCommand } = require("./daemon-command-client");
    const { isDaemonRunning, getDaemonPid, PID_FILE, SOCKET_PATH } = require("./daemon-utils");

    const DAEMON_SCRIPT = path.join(__dirname, "daemon", "index.js");

    const startDaemon = async () => {
      if (isDaemonRunning()) {
        const pid = getDaemonPid();
        console.log(chalk.green(`守护进程已在运行 (PID: ${pid})`));
        return;
      }

      // 清理残留文件
      try {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
      } catch {}

      // 启动守护进程
      const { spawn } = require("child_process");
      const daemon = spawn(process.execPath, [DAEMON_SCRIPT], {
        detached: true,
        stdio: "ignore",
      });
      daemon.unref();

      // 等待启动
      await new Promise((resolve, reject) => {
        let attempts = 0;
        const check = setInterval(() => {
          attempts++;
          if (isDaemonRunning()) {
            clearInterval(check);
            const newPid = getDaemonPid();
            console.log(chalk.green(`守护进程已启动 (PID: ${newPid})`));
            resolve();
          } else if (attempts > 30) {
            clearInterval(check);
            reject(new Error("启动超时"));
          }
        }, 100);
      });
    };

    const stopDaemon = async () => {
      const pid = getDaemonPid();
      if (!pid) {
        console.log(chalk.yellow("守护进程未运行"));
        return;
      }

      if (!isDaemonRunning()) {
        console.log(chalk.yellow("守护进程已停止（清理 PID 文件）"));
        try { fs.unlinkSync(PID_FILE); } catch {}
        return;
      }

      try {
        await sendDaemonCommand("stop");
        console.log(chalk.green("守护进程已停止"));
      } catch {
        try {
          process.kill(pid, "SIGTERM");
          console.log(chalk.green("守护进程已强制停止"));
        } catch {
          console.log(chalk.red("守护进程停止失败"));
        }
      }

      try { fs.unlinkSync(PID_FILE); } catch {}
      try { fs.unlinkSync(SOCKET_PATH); } catch {}
    };

    const statusDaemon = async () => {
      const pid = getDaemonPid();
      if (!pid) {
        console.log(chalk.yellow("守护进程未运行"));
        return;
      }

      if (!isDaemonRunning()) {
        console.log(chalk.yellow("守护进程未运行（PID 文件残留）"));
        return;
      }

      try {
        const response = await sendDaemonCommand("health");
        console.log(chalk.green(`守护进程运行中 (PID: ${pid})`));
        console.log(`运行时间: ${Math.floor(response.data.uptime)} 秒`);
        console.log(`缓存状态: ${response.data.cache.hasData ? "有数据" : "无数据"}`);
        if (response.data.cache.age) {
          console.log(`数据年龄: ${Math.floor(response.data.cache.age / 1000)} 秒`);
        }
      } catch {
        console.log(chalk.yellow("守护进程响应异常"));
      }
    };

    try {
      switch (action) {
        case "start":
          await startDaemon();
          break;
        case "stop":
          await stopDaemon();
          break;
        case "status":
          await statusDaemon();
          break;
        case "restart":
          await stopDaemon();
          await new Promise(r => setTimeout(r, 500));
          await startDaemon();
          break;
        default:
          console.log(chalk.red(`未知操作: ${action}`));
          console.log(chalk.gray("支持: start, stop, status, restart"));
      }
    } catch (err) {
      console.log(chalk.red(`操作失败: ${err.message}`));
      process.exit(1);
    }
  });

function startWatching(providerId) {
  let intervalId;

  const update = async () => {
    try {
      const usageFetcher = getUsageFetcher();
      const usageData = await usageFetcher.fetch({ forceRefresh: true, providerId });

      if (!usageData) {
        console.error(chalk.red("更新失败: 无法获取数据"));
        return;
      }

      const statusBar = new StatusBar(usageData);

      process.stdout.write("\x1Bc");

      console.log("\n" + statusBar.render() + "\n");
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
