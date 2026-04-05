const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');

const LOCK_FILE = path.join(os.homedir(), '.cps-daemon.lock');
const PID_FILE = path.join(os.homedir(), '.cps-daemon.pid');
const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\cps-daemon'
  : path.join(os.homedir(), '.cps-daemon.sock');
const DAEMON_SCRIPT = path.resolve(__dirname, '..', '..', '..', 'cli', 'daemon', 'index.js');

const CONNECT_TIMEOUT = 3000;
const REQUEST_TIMEOUT = 5000;
const LOCK_WAIT_INTERVAL = 100;
const LOCK_WAIT_MAX_ATTEMPTS = 50;
const DAEMON_READY_MAX_ATTEMPTS = 30;
const DAEMON_START_MAX_ATTEMPTS = 3;
const COMMAND_START_TIMEOUT = 5000;

let daemonStartPromise = null;

class DaemonClient {
  constructor(logger) {
    this.logger = logger;
  }

  async fetchStatus(options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const response = await this.request('status-json', { forceRefresh });
    if (response.status === 'error') {
      const message = response.error?.message || 'Unknown daemon error';
      throw new Error(message);
    }
    return response.data;
  }

  async request(command, params = {}) {
    let attempts = 0;
    while (attempts < DAEMON_START_MAX_ATTEMPTS) {
      if (!this.isDaemonRunning()) {
        this.logger.info('Daemon not running, attempting to start');
        await this.startDaemon();
      }

      try {
        const socket = await this.connect();
        return this.sendRequest(socket, { command, params });
      } catch (error) {
        attempts += 1;
        if (attempts >= DAEMON_START_MAX_ATTEMPTS) {
          throw error;
        }
        this.logger.warn('Daemon request retry', { attempt: attempts, error: error.message });
        await this.delay(LOCK_WAIT_INTERVAL);
      }
    }

    throw new Error('Daemon request failed');
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(SOCKET_PATH);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      }, CONNECT_TIMEOUT);

      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async sendRequest(socket, request) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let buffer = '';

      const timer = setTimeout(() => {
        finish(new Error('Request timeout'));
      }, REQUEST_TIMEOUT);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };

      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        socket.destroy();
        if (err) {
          reject(err);
          return;
        }
        resolve(value);
      };

      const onData = (chunk) => {
        buffer += chunk.toString();
        const newlineIdx = buffer.indexOf('\n');
        if (newlineIdx === -1) return;
        const raw = buffer.slice(0, newlineIdx);
        try {
          finish(null, JSON.parse(raw));
        } catch {
          finish(new Error('Invalid daemon response'));
        }
      };
      const onError = (err) => finish(err);
      const onClose = () => finish(new Error('Connection closed'));

      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('close', onClose);
      socket.write(JSON.stringify(request) + '\n');
    });
  }

  isDaemonRunning() {
    try {
      if (!fs.existsSync(PID_FILE)) return false;
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
      if (!Number.isInteger(pid)) return false;
      process.kill(pid, 0);
      if (process.platform === 'win32') return true;
      return fs.existsSync(SOCKET_PATH);
    } catch {
      return false;
    }
  }

  async startDaemon() {
    if (daemonStartPromise) {
      return daemonStartPromise;
    }

    daemonStartPromise = this._startDaemon().finally(() => {
      daemonStartPromise = null;
    });
    return daemonStartPromise;
  }

  async _startDaemon() {
    if (fs.existsSync(LOCK_FILE)) {
      await this.waitForDaemonOrLockRelease();
      if (this.isDaemonRunning()) return;
    }

    if (this.tryAcquireLock()) {
      await this.spawnDaemonAndWait();
      this.releaseLock();
      return;
    }

    await this.waitForDaemonOrLockRelease();
    if (this.isDaemonRunning()) return;
    throw new Error('Daemon failed to start (lock contention)');
  }

  tryAcquireLock() {
    try {
      fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  }

  async waitForDaemonOrLockRelease() {
    let attempts = 0;
    while (attempts < LOCK_WAIT_MAX_ATTEMPTS) {
      if (this.isDaemonRunning()) {
        return;
      }
      if (!fs.existsSync(LOCK_FILE)) {
        return;
      }
      await this.delay(LOCK_WAIT_INTERVAL);
      attempts += 1;
    }
    this.releaseLock();
  }

  async spawnDaemonAndWait() {
    if (this.isDaemonRunning()) return;

    if (fs.existsSync(DAEMON_SCRIPT)) {
      const daemon = spawn(process.execPath, [DAEMON_SCRIPT], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, CPS_DAEMON: '1' },
      });

      await new Promise((resolve, reject) => {
        daemon.on('error', reject);
        daemon.unref();
        resolve();
      });

      const ready = await this.waitForDaemonReady();
      if (ready) return;
      throw new Error('Daemon failed to start');
    }

    const commandStarted =
      await this.tryStartWithCommand('cps-daemon', ['start']) ||
      await this.tryStartWithCommand('cps', ['daemon', 'start']);
    if (!commandStarted) {
      throw new Error('Daemon script not found and CLI command unavailable. Install codingplan-status CLI.');
    }

    const ready = await this.waitForDaemonReady();
    if (ready) return;
    throw new Error('Daemon failed to start');
  }

  async tryStartWithCommand(command, args) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        stdio: 'ignore',
        detached: false,
      });

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          proc.kill('SIGTERM');
        } catch {
          // Ignore timeout kill errors.
        }
        resolve(false);
      }, COMMAND_START_TIMEOUT);

      proc.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
  }

  async waitForDaemonReady() {
    let attempts = 0;
    while (attempts < DAEMON_READY_MAX_ATTEMPTS) {
      if (this.isDaemonRunning()) {
        return true;
      }
      await this.delay(LOCK_WAIT_INTERVAL);
      attempts += 1;
    }
    return false;
  }

  releaseLock() {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
      }
    } catch {
      // Ignore lock cleanup errors.
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  DaemonClient,
};
