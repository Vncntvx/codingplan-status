const fs = require('fs');
const path = require('path');
const os = require('os');

// 默认 TTL 配置（毫秒）
const DEFAULT_TTL = 30000;
const MIN_TTL = 5000;
const MAX_TTL = 60000;

class CacheManager {
  constructor(options = {}) {
    this.cachePath = path.join(os.homedir(), '.codingplan-cache.json');
    // 支持 TTL 配置，优先使用环境变量
    const envTTL = process.env.CPS_CACHE_TTL ? parseInt(process.env.CPS_CACHE_TTL, 10) : null;
    this.ttl = envTTL || Math.max(MIN_TTL, Math.min(MAX_TTL, options.ttl || DEFAULT_TTL));
    this.writeLock = false;
    this.pendingWrites = [];
  }

  read() {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return { data: null, state: 'none', timestamp: 0 };
      }
      const content = fs.readFileSync(this.cachePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      this._logDebug('Cache read error:', error.message);
      return { data: null, state: 'none', timestamp: 0 };
    }
  }

  write(data, state = 'ok') {
    return new Promise((resolve, reject) => {
      const doWrite = () => {
        this.writeLock = true;
        try {
          fs.writeFileSync(this.cachePath, JSON.stringify({
            data,
            state,
            timestamp: Date.now()
          }), { mode: 0o600 });
          resolve();
        } catch (error) {
          this._logDebug('Cache write error:', error.message);
          reject(error);
        } finally {
          this.writeLock = false;
          // 处理等待的写入
          const next = this.pendingWrites.shift();
          if (next) {
            doWrite();
          }
        }
      };

      if (this.writeLock) {
        this.pendingWrites.push({ data, state, resolve, reject });
      } else {
        doWrite();
      }
    });
  }

  // 同步写入
  writeSync(data, state = 'ok') {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify({
        data,
        state,
        timestamp: Date.now()
      }), { mode: 0o600 });
    } catch (error) {
      this._logDebug('Cache write error:', error.message);
    }
  }

  isValid(cacheEntry) {
    if (!cacheEntry || !cacheEntry.data || cacheEntry.state === 'none') return false;
    return Date.now() - cacheEntry.timestamp < this.ttl;
  }

  get() {
    const cache = this.read();
    return this.isValid(cache) ? cache : null;
  }

  // 获取缓存状态
  getStatus() {
    const cache = this.read();
    return {
      hasData: !!cache.data,
      state: cache.state,
      age: cache.timestamp ? Date.now() - cache.timestamp : null,
      isValid: this.isValid(cache),
      ttl: this.ttl
    };
  }

  // 清除缓存
  clear() {
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
    } catch (error) {
      this._logDebug('Cache clear error:', error.message);
    }
  }

  _logDebug(message, detail) {
    if (process.env.CPS_DEBUG) {
      console.error(`[CacheManager] ${message}`, detail || '');
    }
  }
}

let instance = null;

function getCacheManager(options) {
  if (!instance) {
    instance = new CacheManager(options);
  }
  return instance;
}

// 重置实例
function resetInstance() {
  instance = null;
}

module.exports = {
  CacheManager,
  getCacheManager,
  resetInstance,
  DEFAULT_TTL,
  MIN_TTL,
  MAX_TTL
};
