/**
 * Claude Settings Manager
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// CPS 相关命令列表
const CPS_COMMANDS = ['cps-client status', 'cps-hud-wrapper', 'cps-client combined'];

// 自定义错误类型
class SettingsError extends Error {
  constructor(message, recoverable = false) {
    super(message);
    this.name = 'SettingsError';
    this.recoverable = recoverable;
  }
}

/**
 * 深度比较两个对象（处理 key 顺序问题）
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (!deepEqual(a[keysA[i]], b[keysB[i]])) return false;
  }
  return true;
}

class ClaudeSettingsManager {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude');
    this.settingsPath = path.join(this.claudeDir, 'settings.json');
    this.backupPath = path.join(this.claudeDir, 'settings.json.bak');
    this.tempPath = path.join(this.claudeDir, '.settings.json.tmp');
    this.trackingPath = path.join(this.claudeDir, '.cps-statusline-backup.json');
    this.lockPath = path.join(this.claudeDir, '.settings.json.lock');
    this.writeLock = false;
    this.lockFd = null;
    this.lockTimeout = 5000; // 5 seconds
  }

  /**
   * 计算内容校验和
   */
  _computeChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 调试日志
   */
  _logDebug(message, detail) {
    if (process.env.CPS_DEBUG) {
      console.error(`[ClaudeSettingsManager] ${message}`, detail || '');
    }
  }

  /**
   * 确保目录存在
   */
  _ensureDir() {
    if (!fs.existsSync(this.claudeDir)) {
      fs.mkdirSync(this.claudeDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * 清理临时文件
   */
  _cleanupTempFile() {
    try {
      if (fs.existsSync(this.tempPath)) {
        fs.unlinkSync(this.tempPath);
      }
    } catch {
      // 忽略清理错误
    }
  }

  /**
   * 获取跨进程文件锁
   * 使用 lockfile 实现跨进程互斥
   */
  _acquireLock() {
    try {
      this._ensureDir();
      // 尝试创建锁文件，使用排他模式
      const startTime = Date.now();
      while (Date.now() - startTime < this.lockTimeout) {
        try {
          // 使用 'wx' 模式：排他创建，文件存在则失败
          this.lockFd = fs.openSync(this.lockPath, 'wx');
          // 写入 PID 用于调试
          fs.writeSync(this.lockFd, `${process.pid}\n${Date.now()}`);
          return true;
        } catch (err) {
          if (err.code === 'EEXIST') {
            // 锁文件存在，检查是否过期
            try {
              const stat = fs.statSync(this.lockPath);
              const lockAge = Date.now() - stat.mtimeMs;
              // 锁超过 10 秒视为过期（可能是之前的进程崩溃）
              if (lockAge > 10000) {
                this._logDebug('Lock file expired, removing');
                fs.unlinkSync(this.lockPath);
                continue;
              }
            } catch {
              // 忽略 stat 错误
            }
            // 等待 50ms 后重试
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
            continue;
          }
          throw err;
        }
      }
      this._logDebug('Failed to acquire lock: timeout');
      return false;
    } catch (err) {
      this._logDebug('Failed to acquire lock:', err.message);
      return false;
    }
  }

  /**
   * 释放跨进程文件锁
   */
  _releaseLock() {
    try {
      if (this.lockFd !== null) {
        fs.closeSync(this.lockFd);
        this.lockFd = null;
      }
      if (fs.existsSync(this.lockPath)) {
        fs.unlinkSync(this.lockPath);
      }
    } catch {
      // 忽略释放错误
    }
  }

  /**
   * 安全读取配置文件
   * @returns {{ settings: object, rawContent: string, checksum: string, exists: boolean }}
   */
  readSettings() {
    // 文件不存在
    if (!fs.existsSync(this.settingsPath)) {
      return { settings: {}, rawContent: '{}', checksum: null, exists: false };
    }

    let rawContent;
    try {
      rawContent = fs.readFileSync(this.settingsPath, 'utf8');
    } catch (error) {
      this._logDebug('Failed to read settings file:', error.message);
      // 尝试从备份恢复
      return this._recoverFromBackup() || { settings: {}, rawContent: '{}', checksum: null, exists: false };
    }

    const checksum = this._computeChecksum(rawContent);

    try {
      const settings = JSON.parse(rawContent);
      if (typeof settings !== 'object' || settings === null) {
        throw new Error('Settings must be a JSON object');
      }
      return { settings, rawContent, checksum, exists: true };
    } catch (parseError) {
      this._logDebug('Failed to parse settings:', parseError.message);
      // 尝试从备份恢复
      const recovered = this._recoverFromBackup();
      if (recovered) {
        return recovered;
      }
      throw new SettingsError(`配置文件损坏且无有效备份: ${parseError.message}`, false);
    }
  }

  /**
   * 从备份文件恢复
   * 同时修复损坏的主文件
   */
  _recoverFromBackup() {
    if (!fs.existsSync(this.backupPath)) {
      return null;
    }

    try {
      const rawContent = fs.readFileSync(this.backupPath, 'utf8');
      const settings = JSON.parse(rawContent);
      const checksum = this._computeChecksum(rawContent);

      // 同时修复损坏的主文件
      this._ensureDir();
      const tempPath = this.settingsPath + '.restore';
      fs.writeFileSync(tempPath, rawContent, { mode: 0o600 });
      fs.renameSync(tempPath, this.settingsPath);

      this._logDebug('Recovered from backup and restored main file');
      return { settings, rawContent, checksum, exists: true, recovered: true };
    } catch {
      this._logDebug('Backup file also corrupted');
      return null;
    }
  }

  /**
   * 创建独立备份文件
   */
  createBackup(rawContent) {
    try {
      this._ensureDir();

      // 原子写入备份
      const tempBackup = this.backupPath + '.tmp';
      fs.writeFileSync(tempBackup, rawContent, { mode: 0o600 });
      fs.renameSync(tempBackup, this.backupPath);

      this._logDebug('Backup created:', this.backupPath);
      return true;
    } catch (error) {
      this._logDebug('Failed to create backup:', error.message);
      return false;
    }
  }

  /**
   * 原子写入配置文件
   * @param {object} settings - 配置对象
   * @param {string} originalChecksum - 原始文件校验和（可选，用于检测并发修改）
   * @returns {{ success: boolean, error?: string }}
   */
  writeSettings(settings, originalChecksum = null) {
    // 获取进程内写锁
    if (this.writeLock) {
      return { success: false, error: '另一个写入操作正在进行中' };
    }
    this.writeLock = true;

    // 获取跨进程文件锁
    if (!this._acquireLock()) {
      this.writeLock = false;
      return { success: false, error: '无法获取文件锁，请稍后重试' };
    }

    try {
      // Step 1: 校验文件未被其他进程修改
      if (originalChecksum && fs.existsSync(this.settingsPath)) {
        const currentContent = fs.readFileSync(this.settingsPath, 'utf8');
        const currentChecksum = this._computeChecksum(currentContent);
        if (currentChecksum !== originalChecksum) {
          return { success: false, error: '配置文件已被其他进程修改，请重试' };
        }
      }

      // Step 2: 创建独立备份
      if (fs.existsSync(this.settingsPath)) {
        const currentContent = fs.readFileSync(this.settingsPath, 'utf8');
        if (!this.createBackup(currentContent)) {
          this._logDebug('Warning: Failed to create backup before write');
          // 继续写入，但记录警告
        }
      }

      // Step 3: 确保目录存在
      this._ensureDir();

      // Step 4: 序列化配置
      const content = JSON.stringify(settings, null, 2);

      // Step 5: 写入临时文件
      fs.writeFileSync(this.tempPath, content, { mode: 0o600 });

      // Step 6: 验证临时文件
      const verifyContent = fs.readFileSync(this.tempPath, 'utf8');
      const verifyParsed = JSON.parse(verifyContent);

      // 深度比较（使用正确的递归比较函数）
      if (!deepEqual(verifyParsed, settings)) {
        throw new SettingsError('写入验证失败：内容不匹配', false);
      }

      // Step 7: 原子重命名
      fs.renameSync(this.tempPath, this.settingsPath);

      // Step 8: 最终验证
      const finalContent = fs.readFileSync(this.settingsPath, 'utf8');
      JSON.parse(finalContent); // 验证可解析

      this._logDebug('Settings written successfully');
      return { success: true };

    } catch (error) {
      // 清理临时文件
      this._cleanupTempFile();

      // 尝试恢复
      if (fs.existsSync(this.settingsPath)) {
        try {
          JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        } catch {
          // 主文件损坏，尝试恢复
          this._attemptRecovery();
        }
      }

      this._logDebug('Write failed:', error.message);
      return { success: false, error: error.message };

    } finally {
      // 释放跨进程文件锁
      this._releaseLock();
      this.writeLock = false;
    }
  }

  /**
   * 尝试从备份恢复主文件
   */
  _attemptRecovery() {
    if (!fs.existsSync(this.backupPath)) {
      return false;
    }

    try {
      const backupContent = fs.readFileSync(this.backupPath, 'utf8');
      JSON.parse(backupContent); // 验证备份有效

      const tempPath = this.settingsPath + '.restore';
      fs.writeFileSync(tempPath, backupContent, { mode: 0o600 });
      fs.renameSync(tempPath, this.settingsPath);

      this._logDebug('Settings restored from backup');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 判断是否为 CPS 命令
   */
  _isCpsCommand(command) {
    if (!command || typeof command !== 'string') return false;
    return CPS_COMMANDS.includes(command.trim());
  }

  /**
   * 存储原始 statusLine 到跟踪文件
   */
  _storeOriginalStatusLine(statusLine) {
    try {
      this._ensureDir();
      const content = JSON.stringify({
        originalStatusLine: statusLine,
        backupTime: new Date().toISOString()
      }, null, 2);

      // 原子写入
      const tempPath = this.trackingPath + '.tmp';
      fs.writeFileSync(tempPath, content, { mode: 0o600 });
      fs.renameSync(tempPath, this.trackingPath);

      this._logDebug('Original statusLine stored');
    } catch (error) {
      this._logDebug('Failed to store original statusLine:', error.message);
    }
  }

  /**
   * 获取原始 statusLine
   */
  _getOriginalStatusLine() {
    try {
      if (fs.existsSync(this.trackingPath)) {
        const data = JSON.parse(fs.readFileSync(this.trackingPath, 'utf8'));
        return data.originalStatusLine || null;
      }
    } catch {
      // 忽略
    }
    return null;
  }

  /**
   * 清理跟踪文件和备份文件
   */
  _cleanupTrackingFiles() {
    try {
      if (fs.existsSync(this.trackingPath)) {
        fs.unlinkSync(this.trackingPath);
      }
      if (fs.existsSync(this.backupPath)) {
        fs.unlinkSync(this.backupPath);
      }
      this._logDebug('Tracking and backup files cleaned up');
    } catch {
      // 忽略
    }
  }

  /**
   * 迁移旧版本内嵌备份
   */
  _migrateFromInlineBackup(settings) {
    if (settings._statusLineBackup) {
      this._storeOriginalStatusLine(settings._statusLineBackup);
      const cleaned = { ...settings };
      delete cleaned._statusLineBackup;
      this._logDebug('Migrated inline backup to tracking file');
      return cleaned;
    }
    return settings;
  }

  /**
   * 配置 statusLine
   * @param {string} command - 要设置的命令
   * @returns {{ success: boolean, error?: string, wasModified: boolean, message?: string }}
   */
  configureStatusLine(command) {
    try {
      // 读取当前配置
      const { settings, rawContent, checksum, exists } = this.readSettings();

      // 迁移旧版本备份
      const migratedSettings = this._migrateFromInlineBackup(settings);

      // 检查是否已配置
      const currentCommand = migratedSettings.statusLine?.command;
      if (currentCommand === command) {
        return { success: true, wasModified: false, message: '已配置，无需更改' };
      }

      // 备份原始 statusLine
      if (exists && migratedSettings.statusLine && !this._isCpsCommand(currentCommand)) {
        this._storeOriginalStatusLine(migratedSettings.statusLine);
      }

      // 应用修改
      const newSettings = { ...migratedSettings };
      newSettings.statusLine = {
        type: 'command',
        command: command
      };

      // 写入
      const result = this.writeSettings(newSettings, checksum);

      return {
        success: result.success,
        error: result.error,
        wasModified: true
      };

    } catch (error) {
      return { success: false, error: error.message, wasModified: false };
    }
  }

  /**
   * 移除 statusLine 配置并恢复原始
   * @returns {{ success: boolean, error?: string, wasModified: boolean, message?: string, restoredOriginal: boolean }}
   */
  removeStatusLine() {
    try {
      const { settings, checksum } = this.readSettings();

      // 检查是否为 CPS 配置
      const currentCommand = settings.statusLine?.command;
      if (!this._isCpsCommand(currentCommand)) {
        return { success: true, wasModified: false, message: '未检测到 CPS 状态栏配置' };
      }

      // 获取原始 statusLine
      const originalStatusLine = this._getOriginalStatusLine();

      // 构建新配置
      const newSettings = { ...settings };
      if (originalStatusLine) {
        newSettings.statusLine = originalStatusLine;
      } else {
        delete newSettings.statusLine;
      }

      // 写入
      const result = this.writeSettings(newSettings, checksum);

      // 成功后清理跟踪文件和备份
      if (result.success) {
        this._cleanupTrackingFiles();
      }

      return {
        success: result.success,
        error: result.error,
        wasModified: true,
        restoredOriginal: !!originalStatusLine
      };

    } catch (error) {
      return { success: false, error: error.message, wasModified: false };
    }
  }

  /**
   * 手动从备份恢复
   */
  restoreFromBackup() {
    if (!fs.existsSync(this.backupPath)) {
      return { success: false, error: '备份文件不存在' };
    }

    try {
      const backupContent = fs.readFileSync(this.backupPath, 'utf8');
      const backupSettings = JSON.parse(backupContent);

      const tempPath = this.settingsPath + '.restore';
      fs.writeFileSync(tempPath, backupContent, { mode: 0o600 });
      fs.renameSync(tempPath, this.settingsPath);

      return { success: true, settings: backupSettings };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取配置文件路径（用于日志输出）
   */
  getSettingsPath() {
    return this.settingsPath;
  }

  /**
   * 获取备份文件路径
   */
  getBackupPath() {
    return this.backupPath;
  }
}

// 单例模式
let instance = null;

function getClaudeSettingsManager() {
  if (!instance) {
    instance = new ClaudeSettingsManager();
  }
  return instance;
}

function resetInstance() {
  instance = null;
}

module.exports = {
  ClaudeSettingsManager,
  getClaudeSettingsManager,
  resetInstance,
  SettingsError,
  CPS_COMMANDS
};
