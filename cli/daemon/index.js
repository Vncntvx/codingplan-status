#!/usr/bin/env node

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfigManager } = require('../config-manager');
const { createProvider } = require('../providers');
const { MemoryCache } = require('./cache');
const { createResponse, createErrorResponse } = require('./protocol');

class Daemon {
  constructor() {
    this.configManager = getConfigManager();
    this.cache = new MemoryCache({
      ttl: this.configManager.getSetting('cacheTTL', 30000),
    });
    this.server = null;
    this.refreshTimer = null;
    this.refreshIntervalMs = null;
    this.isShuttingDown = false;
    this.lastRequestTime = Date.now();
    this.idleCheckInterval = null;
    this.pidFile = path.join(os.homedir(), '.cps-daemon.pid');
    this.socketPath = this.getSocketPath();
    this.inflightFetchPromise = null;
    this.inflightFetchProviderId = null;
  }

  getSocketPath() {
    return process.platform === 'win32'
      ? '\\\\.\\pipe\\cps-daemon'
      : path.join(os.homedir(), '.cps-daemon.sock');
  }

  /**
   * 检测 HUD 是否启用
   */
  isHudEnabled() {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    try {
      if (!fs.existsSync(settingsPath)) return false;
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.enabledPlugins?.['claude-hud@claude-hud'] === true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 HUD 脚本路径
   */
  getHudScriptPath() {
    const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'claude-hud', 'claude-hud');
    if (!fs.existsSync(cacheDir)) return null;
    const versions = fs.readdirSync(cacheDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const latest = versions[versions.length - 1];
    if (!latest) return null;
    return path.join(cacheDir, latest, 'src', 'index.ts');
  }

  /**
   * 执行 HUD 并获取输出
   */
  async executeHud(stdinData) {
    const hudPath = this.getHudScriptPath();
    if (!hudPath) {
      this.log('HUD script not found');
      return '';
    }

    // 检测 bun 路径
    let bunPath = process.env.BUN_PATH || '';
    if (!bunPath) {
      const bunHome = path.join(os.homedir(), '.bun', 'bin', 'bun');
      if (fs.existsSync(bunHome)) {
        bunPath = bunHome;
      }
    }
    if (!bunPath || !fs.existsSync(bunPath)) {
      this.log('bun not found, HUD merge skipped. Install bun: curl -fsSL https://bun.sh/install | bash');
      return '';
    }

    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const proc = spawn(bunPath, [hudPath], {
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      let output = '';
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.on('close', () => resolve(output));
      proc.on('error', () => resolve(''));

      // 写入 stdin 数据
      proc.stdin.write(JSON.stringify(stdinData));
      proc.stdin.end();

      // 超时保护
      setTimeout(() => { proc.kill(); resolve(''); }, 2000);
    });
  }

  async start() {
    if (this.isRunning()) {
      console.log('守护进程已在运行');
      return false;
    }

    fs.writeFileSync(this.pidFile, process.pid.toString(), { mode: 0o600 });
    try {
      this.syncCacheTTL();
      console.log('预热缓存...');
      await this.fetchData();

      this.startBackgroundRefresh();
      this.startIdleCheck();
      await this.startServer();
      this.setupGracefulShutdown();

      console.log(`守护进程已启动 (PID: ${process.pid})`);
      console.log(`Socket: ${this.socketPath}`);
      return true;
    } catch (err) {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
      if (this.idleCheckInterval) {
        clearInterval(this.idleCheckInterval);
        this.idleCheckInterval = null;
      }
      try {
        if (fs.existsSync(this.pidFile)) {
          fs.unlinkSync(this.pidFile);
        }
      } catch {}
      throw err;
    }
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.handleConnection(socket));
      let recoveringAddrInUse = false;

      this.server.on('error', (err) => {
        if (err.code !== 'EADDRINUSE') {
          reject(err);
          return;
        }

        if (recoveringAddrInUse) {
          reject(err);
          return;
        }

        recoveringAddrInUse = true;
        this.tryRecoverSocketInUse()
          .then((recovered) => {
            if (!recovered) {
              reject(new Error('Socket path is in use by an active daemon'));
              return;
            }
            this.server.listen(this.socketPath);
          })
          .catch(reject);
      });

      this.server.listen(this.socketPath, () => {
        if (process.platform !== 'win32') fs.chmodSync(this.socketPath, 0o600);
        resolve();
      });
    });
  }

  handleConnection(socket) {
    this.lastRequestTime = Date.now();
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) this.handleRequest(socket, line);
      }
    });

    socket.on('error', (err) => this.log('Socket error:', err.message));
  }

  async handleRequest(socket, rawData) {
    try {
      const request = JSON.parse(rawData);
      this.log('Request:', request.command);

      let response;

      switch (request.command) {
        case 'status':
          response = await this.handleStatus(request.params);
          break;
        case 'status-json':
          response = await this.handleStatusJson(request.params);
          break;
        case 'combined':
          response = await this.handleCombined(request.params);
          break;
        case 'hud':
          response = await this.handleHud(request.params);
          break;
        case 'health':
          response = createResponse('ok', {
            pid: process.pid,
            uptime: process.uptime(),
            cache: this.cache.getStatus(),
          });
          break;
        case 'stop':
          response = createResponse('ok', { message: 'Stopping daemon' });
          socket.end(JSON.stringify(response) + '\n');
          setTimeout(() => this.shutdown(), 100);
          return;
        default:
          response = createErrorResponse('Unknown command');
      }

      socket.end(JSON.stringify(response) + '\n');
    } catch (err) {
      this.log('Request error:', err.message);
      socket.end(JSON.stringify(createErrorResponse(err.message)) + '\n');
    }
  }

  async handleStatus(params = {}) {
    const { forceRefresh = false, format = 'compact' } = params;
    this.syncCacheTTL();

    // 获取 CPS 数据
    const cachedData = forceRefresh ? null : this.getCurrentProviderCache();
    let data = cachedData;
    if (!data) {
      data = await this.fetchData();
    }

    if (!data) {
      return createErrorResponse('Failed to fetch data');
    }

    // 检查 HUD 是否启用且有 stdin 数据
    if (this.isHudEnabled() && params.input) {
      try {
        const stdinData = JSON.parse(params.input);
        const hudOutput = await this.executeHud(stdinData);
        const cpsLabel = this.renderOutput(data, 'compact');
        const combined = hudOutput.trim() + '\n' + cpsLabel;
        return createResponse('ok', { output: combined });
      } catch (err) {
        this.log('HUD merge error:', err.message);
      }
    }

    // HUD 未启用或无 stdin 数据，只返回 CPS
    return createResponse('ok', {
      output: this.renderOutput(data, format),
      cached: Boolean(!forceRefresh && cachedData),
      age: cachedData ? Date.now() - this.cache.timestamp : 0,
    });
  }

  async handleStatusJson(params = {}) {
    const { forceRefresh = false } = params;
    this.syncCacheTTL();

    const cachedData = forceRefresh ? null : this.getCurrentProviderCache();
    let data = cachedData;
    if (!data) {
      data = await this.fetchData();
    }

    if (!data) {
      return createErrorResponse('Failed to fetch data', 'FETCH_FAILED');
    }

    return createResponse('ok', {
      usage: data,
      cache: this.getCurrentProviderCacheStatus(),
      source: forceRefresh ? 'force-refresh' : (cachedData ? 'cache' : 'upstream'),
    });
  }

  async handleCombined(params = {}) {
    return this.handleStatus(params);
  }

  async handleHud(params = {}) {
    // 此方法保留给外部 HUD 调用（守护进程内合并时不会走到这里）
    let data = this.getCurrentProviderCache();
    if (!data) {
      data = await this.fetchData();
    }
    const label = data ? require('../renderers').renderCompact(data) : '';
    return createResponse('ok', { output: JSON.stringify({ label }) });
  }

  async fetchData(retryCount = 0) {
    const currentProviderId = this.getCurrentProviderId();
    if (
      retryCount === 0 &&
      this.inflightFetchPromise &&
      this.inflightFetchProviderId &&
      this.inflightFetchProviderId === currentProviderId
    ) {
      return this.inflightFetchPromise;
    }

    const runFetch = async (attempt) => {
      try {
        this.configManager.loadConfig();
        this.syncCacheTTL();

        const providerId = this.configManager.getCurrentProviderId();
        if (!providerId) return null;

        const credentials = this.configManager.getProviderCredentials(providerId);
        if (!credentials) return null;

        const provider = createProvider(providerId, credentials);
        const apiData = await provider.fetchUsageData();

        let usageData;
        if (provider.constructor.id === 'minimax') {
          const subscriptionData = await provider.getSubscriptionDetails();
          usageData = provider.parseWithExpiry(apiData, subscriptionData);
        } else {
          usageData = provider.parseUsageData(apiData);
        }

        this.cache.set(usageData);
        return usageData;
      } catch (err) {
        const maxRetries = this.configManager.getSetting('maxRetries', 3);
        if (attempt < maxRetries && this.isNetworkError(err)) {
          const delay = 1000 * Math.pow(2, attempt);
          this.log(`Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          return runFetch(attempt + 1);
        }
        this.log('Fetch error:', err.message);
        return null;
      }
    };

    if (retryCount === 0) {
      const inflightPromise = runFetch(retryCount);
      this.inflightFetchPromise = inflightPromise;
      this.inflightFetchProviderId = currentProviderId;
      inflightPromise.finally(() => {
        if (this.inflightFetchPromise === inflightPromise) {
          this.inflightFetchPromise = null;
          this.inflightFetchProviderId = null;
        }
      });
      return inflightPromise;
    }

    return runFetch(retryCount);
  }

  isNetworkError(err) {
    const networkCodes = ['ECONNABORTED', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
    return networkCodes.includes(err.code) ||
           (err.response && err.response.status >= 500);
  }

  startBackgroundRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.syncCacheTTL();
    const interval = Math.max(1000, Math.floor(this.cache.ttl / 2));
    this.refreshIntervalMs = interval;

    this.refreshTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      this.configManager.loadConfig();
      const ttlChanged = this.syncCacheTTL();
      const expectedInterval = Math.max(1000, Math.floor(this.cache.ttl / 2));
      if (ttlChanged || this.refreshIntervalMs !== expectedInterval) {
        this.startBackgroundRefresh();
        return;
      }

      const cached = this.cache.data;
      const currentProviderId = this.getCurrentProviderId();
      const providerChanged = cached?.providerId && currentProviderId && cached.providerId !== currentProviderId;
      const shouldRefresh = !cached ||
        providerChanged ||
        Date.now() - this.cache.timestamp > this.cache.ttl * 0.8;
      if (shouldRefresh) {
        this.log('Background refresh');
        await this.fetchData();
      }
    }, interval);
  }

  startIdleCheck() {
    this.idleCheckInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      const idleTimeout = this.configManager.getSetting('idleTimeout', 3600000);
      if (idleTimeout <= 0) return;
      const idleTime = Date.now() - this.lastRequestTime;
      if (idleTime > idleTimeout) {
        this.log(`Idle timeout (${Math.floor(idleTime / 60000)} min), shutting down`);
        this.shutdown();
      }
    }, 5 * 60 * 1000);
  }

  renderOutput(data, format) {
    if (format === 'compact') {
      const { renderCompact } = require('../renderers');
      return renderCompact(data);
    }
    return JSON.stringify(data);
  }

  isRunning() {
    try {
      if (!fs.existsSync(this.pidFile)) return false;
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf8'), 10);
      process.kill(pid, 0);
      return fs.existsSync(this.socketPath);
    } catch {
      return false;
    }
  }

  cleanupSocket() {
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch {}
  }

  setupGracefulShutdown() {
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.log('Shutting down...');

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    if (this.server) {
      this.server.close();
    }

    this.cleanupSocket();

    try {
      if (fs.existsSync(this.pidFile)) {
        fs.unlinkSync(this.pidFile);
      }
    } catch {}

    process.exit(0);
  }

  log(...args) {
    if (process.env.CPS_DEBUG || this.configManager.getSetting('debug')) {
      console.error('[Daemon]', ...args);
    }
  }

  getCurrentProviderId() {
    try {
      this.configManager.loadConfig();
      return this.configManager.getCurrentProviderId();
    } catch {
      return null;
    }
  }

  getCurrentProviderCache() {
    const cached = this.cache.get();
    if (!cached) return null;
    const currentProviderId = this.getCurrentProviderId();
    if (!currentProviderId) return null;
    if (cached.providerId !== currentProviderId) return null;
    return cached;
  }

  getCurrentProviderCacheStatus() {
    const rawStatus = this.cache.getStatus();
    const currentProviderCache = this.getCurrentProviderCache();
    return {
      hasData: Boolean(currentProviderCache),
      state: rawStatus.state,
      timestamp: currentProviderCache ? rawStatus.timestamp : 0,
      age: currentProviderCache ? rawStatus.age : null,
      ttl: rawStatus.ttl,
      isExpired: currentProviderCache ? rawStatus.isExpired : true,
      hasMismatchedProviderData: Boolean(rawStatus.hasData && !currentProviderCache),
    };
  }

  syncCacheTTL() {
    const ttlSetting = this.configManager.getSetting('cacheTTL', 30000);
    const ttl = Number(ttlSetting);
    if (!Number.isFinite(ttl)) return false;
    const normalized = Math.max(5000, Math.min(60000, Math.floor(ttl)));
    if (this.cache.ttl === normalized) return false;
    this.cache.setTTL(normalized);
    return true;
  }

  async tryRecoverSocketInUse() {
    const activeSocket = await this.isSocketReachable(500);
    if (activeSocket) {
      return false;
    }

    this.cleanupSocket();
    return true;
  }

  isSocketReachable(timeoutMs = 500) {
    return new Promise((resolve) => {
      const socket = net.createConnection(this.socketPath);
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeoutMs);

      socket.on('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
}

// 启动守护进程
if (require.main === module) {
  const daemon = new Daemon();
  daemon.start().then((started) => {
    if (!started) {
      process.exit(1);
    }
  }).catch((err) => {
    console.error('Failed to start daemon:', err.message);
    process.exit(1);
  });
}

module.exports = { Daemon };
