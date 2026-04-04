#!/usr/bin/env node

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { isDaemonRunning, isSocketReady, PID_FILE, SOCKET_PATH } = require('../daemon-utils');

const LOCK_FILE = path.join(os.homedir(), '.cps-daemon.lock');
const DAEMON_SCRIPT = path.join(__dirname, '..', 'daemon', 'index.js');
const CONNECT_TIMEOUT = 3000;
const REQUEST_TIMEOUT = 5000;

process.env.FORCE_COLOR = '1';

function readStdin(timeoutMs = 50) {
  if (!process.stdin || process.stdin.isTTY || process.stdin.readableEnded) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    let settled = false;
    let input = '';

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
      process.stdin.pause();
      resolve(input);
    };

    const onData = (chunk) => {
      input += chunk.toString();
    };
    const onEnd = () => finish();
    const onError = () => finish();

    const timer = setTimeout(finish, timeoutMs);
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
  return new Promise((resolve, reject) => {
    // 检查是否有其他进程正在启动守护进程
    if (fs.existsSync(LOCK_FILE)) {
      let waitAttempts = 0;
      const waitInterval = setInterval(() => {
        waitAttempts++;
        if (isDaemonRunning()) {
          clearInterval(waitInterval);
          resolve();
        } else if (waitAttempts >= 50) {
          clearInterval(waitInterval);
          try { fs.unlinkSync(LOCK_FILE); } catch {}
          doSpawn(resolve, reject);
        }
      }, 100);
      return;
    }

    doSpawn(resolve, reject);
  });
}

function doSpawn(resolve, reject) {
  // 创建锁文件
  try {
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
  } catch {
    let waitAttempts = 0;
    const waitInterval = setInterval(() => {
      waitAttempts++;
      if (isDaemonRunning()) {
        clearInterval(waitInterval);
        resolve();
      } else if (waitAttempts >= 50) {
        clearInterval(waitInterval);
        reject(new Error('Daemon failed to start (lock contention)'));
      }
    }, 100);
    return;
  }

  if (isDaemonRunning()) {
    try { fs.unlinkSync(LOCK_FILE); } catch {}
    resolve();
    return;
  }

  const { spawn } = require('child_process');
  const daemon = spawn(process.execPath, [DAEMON_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, CPS_DAEMON: '1' },
  });

  daemon.on('error', (err) => {
    try { fs.unlinkSync(LOCK_FILE); } catch {}
    reject(err);
  });
  daemon.unref();

  let attempts = 0;
  const checkReady = setInterval(() => {
    attempts++;
    if (isDaemonRunning()) {
      clearInterval(checkReady);
      try { fs.unlinkSync(LOCK_FILE); } catch {}
      resolve();
    } else if (attempts >= 30) {
      clearInterval(checkReady);
      try { fs.unlinkSync(LOCK_FILE); } catch {}
      reject(new Error('Daemon failed to start'));
    }
  }, 100);
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
    if (!isDaemonRunning()) await startDaemon();

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
