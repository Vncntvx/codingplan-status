/**
 * 内存缓存模块
 */

class MemoryCache {
  constructor(options = {}) {
    this.data = null;
    this.timestamp = 0;
    this.state = 'none';
    this.ttl = options.ttl || 30000;
  }

  /**
   * 获取缓存数据
   * @returns {Object|null}
   */
  get() {
    if (!this.data) return null;

    const age = Date.now() - this.timestamp;
    if (age > this.ttl) return null;

    return this.data;
  }

  /**
   * 设置缓存数据
   * @param {Object} data
   * @param {string} state
   */
  set(data, state = 'ok') {
    this.data = data;
    this.timestamp = Date.now();
    this.state = state;
  }

  /**
   * 清除缓存
   */
  clear() {
    this.data = null;
    this.timestamp = 0;
    this.state = 'none';
  }

  /**
   * 获取缓存状态
   * @returns {Object}
   */
  getStatus() {
    return {
      hasData: !!this.data,
      state: this.state,
      timestamp: this.timestamp,
      age: this.timestamp ? Date.now() - this.timestamp : null,
      ttl: this.ttl,
      isExpired: this.timestamp ? Date.now() - this.timestamp > this.ttl : true,
    };
  }

  /**
   * 更新 TTL
   * @param {number} ttl
   */
  setTTL(ttl) {
    this.ttl = ttl;
  }
}

module.exports = { MemoryCache };
