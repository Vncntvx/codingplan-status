/**
 * 守护进程共享工具函数
 * 统一守护进程检测逻辑，避免不一致问题
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const PID_FILE = path.join(os.homedir(), '.cps-daemon.pid');
const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\cps-daemon'
  : path.join(os.homedir(), '.cps-daemon.sock');

/**
 * 快速检测守护进程是否运行（PID + 进程存活 + Socket 文件存在）
 * 用于启动命令等非关键场景
 */
function isDaemonRunning() {
  try {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
    process.kill(pid, 0);
    // Windows 使用命名管道，无法通过文件检查
    if (process.platform === 'win32') return true;
    return fs.existsSync(SOCKET_PATH);
  } catch {
    return false;
  }
}

/**
 * 通过实际连接验证 Socket 是否真正就绪
 * 用于关键路径（client 请求前）
 */
function isSocketReady(timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection(SOCKET_PATH);
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

/**
 * 获取守护进程 PID
 */
function getDaemonPid() {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    return parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
  } catch {
    return null;
  }
}

module.exports = {
  isDaemonRunning,
  isSocketReady,
  getDaemonPid,
  PID_FILE,
  SOCKET_PATH,
};
