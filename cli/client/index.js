#!/usr/bin/env node

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { isSocketReady, SOCKET_PATH } = require('../daemon-utils');

const LOCK_FILE = path.join(os.homedir(), '.cps-daemon.lock');
const DAEMON_SCRIPT = path.join(__dirname, '..', 'daemon', 'index.js');
const CONNECT_TIMEOUT = 3000;
const REQUEST_TIMEOUT = 5000;
const CHECK_INTERVAL = 100;
const DAEMON_READY_TIMEOUT = 45000;
const LOCK_STALE_TIMEOUT = 60000;
const STDIN_IDLE_TIMEOUT = 50;
const STDIN_TOTAL_TIMEOUT = 1500;
const STDIN_MAX_BYTES = 1024 * 1024;

process.env.FORCE_COLOR = '1';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeLockFile() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {}
}

function isLockStale() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return false;
    const stat = fs.statSync(LOCK_FILE);
    return Date.now() - stat.mtimeMs > LOCK_STALE_TIMEOUT;
  } catch {
    return false;
  }
}

async function waitForDaemonReady(timeoutMs = DAEMON_READY_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isSocketReady(300)) {
      return true;
    }
    await delay(CHECK_INTERVAL);
  }
  return false;
}

async function waitForLockReleaseOrReady(timeoutMs = DAEMON_READY_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isSocketReady(300)) return 'ready';
    if (!fs.existsSync(LOCK_FILE)) return 'lock_released';
    await delay(CHECK_INTERVAL);
  }
  return 'timeout';
}

function readStdin(timeoutMs = STDIN_IDLE_TIMEOUT) {
  if (!process.stdin || process.stdin.isTTY || process.stdin.readableEnded) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    let settled = false;
    let input = '';
    let totalBytes = 0;
    let idleTimer = null;
    const totalTimer = setTimeout(() => finish(), STDIN_TOTAL_TIMEOUT);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
      process.stdin.pause();
      resolve(input);
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, timeoutMs);
    };

    const onData = (chunk) => {
      const text = chunk.toString();
      input += text;
      totalBytes += Buffer.byteLength(text, 'utf8');
      if (totalBytes >= STDIN_MAX_BYTES) {
        finish();
        return;
      }
      resetIdleTimer();
    };
    const onEnd = () => finish();
    const onError = () => finish();

    resetIdleTimer();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
    process.stdin.resume();
  });
}

function connect() {
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

function tryParseJsonResponse(buffer) {
  const newlineIdx = buffer.indexOf('\n');
  if (newlineIdx === -1) return { json: null, remaining: buffer };

  const candidate = buffer.slice(0, newlineIdx);
  try {
    return { json: JSON.parse(candidate), remaining: buffer.slice(newlineIdx + 1) };
  } catch {
    // JSON 不完整，继续等待
    return { json: null, remaining: buffer };
  }
}

function sendRequest(socket, request) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
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
      } else {
        resolve(value);
      }
    };

    const onData = (data) => {
      buffer += data.toString();
      const { json, remaining } = tryParseJsonResponse(buffer);
      if (json) {
        finish(null, json);
      } else {
        buffer = remaining;
      }
    };

    const onError = (err) => finish(err);
    const onClose = () => {
      if (!settled) finish(new Error('Connection closed'));
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);

    socket.write(JSON.stringify(request) + '\n');
  });
}


function startDaemon() {
  return doSpawn(0);
}

async function doSpawn(attempt) {
  let lockAcquired = false;

  try {
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
    lockAcquired = true;
  } catch {
    const waitState = await waitForLockReleaseOrReady();
    if (waitState === 'ready') return;
    if (waitState === 'lock_released') {
      if (attempt === 0) {
        return doSpawn(attempt + 1);
      }
      throw new Error('Daemon failed to start');
    }
    if (waitState === 'timeout' && attempt === 0 && isLockStale()) {
      removeLockFile();
      return doSpawn(attempt + 1);
    }
    throw new Error('Daemon failed to start (lock contention)');
  }

  try {
    if (await isSocketReady(300)) {
      return;
    }

    const { spawn } = require('child_process');
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

    const ready = await waitForDaemonReady();
    if (!ready) {
      if (attempt === 0 && isLockStale()) {
        removeLockFile();
        return doSpawn(attempt + 1);
      }
      throw new Error('Daemon failed to start');
    }
  } finally {
    if (lockAcquired) {
      removeLockFile();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const forceRefresh = args.includes('--force') || args.includes('-f');
  const input = await readStdin();

  const request = {
    command: command === 'hud' ? 'hud' : (command === 'combined' ? 'combined' : 'status'),
    params: { forceRefresh, input },
  };

  try {
    const daemonReady = await isSocketReady(300);
    if (!daemonReady) {
      await startDaemon();
    }

    const socket = await connect();
    const response = await sendRequest(socket, request);

    if (response.status === 'error') {
      console.error(response.error?.message || 'Unknown error');
      process.exit(1);
    }

    if (response.data?.output) console.log(response.data.output);
  } catch (err) {
    console.error('[CPS] 守护进程不可用:', err.message);
    process.exit(1);
  }
}

main();
