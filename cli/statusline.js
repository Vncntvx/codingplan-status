#!/usr/bin/env node
/**
 * CPS 守护进程控制命令
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { isDaemonRunning, getDaemonPid, PID_FILE, SOCKET_PATH } = require('./daemon-utils');
const { sendDaemonCommand } = require('./daemon-command-client');

const DAEMON_SCRIPT = path.join(__dirname, 'daemon', 'index.js');

async function start() {
  if (isDaemonRunning()) {
    const pid = getDaemonPid();
    console.log(`守护进程已在运行 (PID: ${pid})`);
    return;
  }

  // 清理残留文件
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  } catch {}

  // 启动守护进程
  const { spawn } = require('child_process');
  const daemon = spawn(process.execPath, [DAEMON_SCRIPT], {
    detached: true,
    stdio: 'ignore',
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
        console.log(`守护进程已启动 (PID: ${newPid})`);
        resolve();
      } else if (attempts > 30) {
        clearInterval(check);
        reject(new Error('启动超时'));
      }
    }, 100);
  });
}

async function stop() {
  const pid = getDaemonPid();

  if (!pid) {
    console.log('守护进程未运行');
    return;
  }

  if (!isDaemonRunning()) {
    console.log('守护进程已停止（清理 PID 文件）');
    try { fs.unlinkSync(PID_FILE); } catch {}
    return;
  }

  try {
    await sendDaemonCommand('stop');
    console.log('守护进程已停止');
  } catch {
    // 强制终止
    try {
      process.kill(pid, 'SIGTERM');
      console.log('守护进程已强制停止');
    } catch {
      console.log('守护进程停止失败');
    }
  }

  // 清理文件
  try { fs.unlinkSync(PID_FILE); } catch {}
  try { fs.unlinkSync(SOCKET_PATH); } catch {}
}

async function status() {
  const pid = getDaemonPid();

  if (!pid) {
    console.log('守护进程未运行');
    return;
  }

  if (!isDaemonRunning()) {
    console.log('守护进程未运行（PID 文件残留）');
    return;
  }

  try {
    const response = await sendDaemonCommand('health');
    console.log(`守护进程运行中 (PID: ${pid})`);
    console.log(`运行时间: ${Math.floor(response.data.uptime)} 秒`);
    console.log(`缓存状态: ${response.data.cache.hasData ? '有数据' : '无数据'}`);
    if (response.data.cache.age) {
      console.log(`数据年龄: ${Math.floor(response.data.cache.age / 1000)} 秒`);
    }
  } catch {
    console.log('守护进程响应异常');
  }
}

async function restart() {
  await stop();
  await new Promise(r => setTimeout(r, 500));
  await start();
}

// 命令入口
const command = process.argv[2];

switch (command) {
  case 'start':
    start().catch(err => {
      console.error('启动失败:', err.message);
      process.exit(1);
    });
    break;
  case 'stop':
    stop();
    break;
  case 'status':
    status().catch(err => {
      console.error('状态检查失败:', err.message);
    });
    break;
  case 'restart':
    restart().catch(err => {
      console.error('重启失败:', err.message);
      process.exit(1);
    });
    break;
  default:
    console.log('用法: cps daemon <start|stop|status|restart>');
}
