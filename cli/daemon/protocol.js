/**
 * 通信协议定义
 */

const PROTOCOL_VERSION = '1.0';

/**
 * 创建响应对象
 * @param {string} status - ok, error
 * @param {Object} data
 * @returns {Object}
 */
function createResponse(status, data = {}) {
  return {
    version: PROTOCOL_VERSION,
    status,
    data,
    timestamp: Date.now(),
  };
}

/**
 * 创建错误响应
 * @param {string} message
 * @param {string} code
 * @returns {Object}
 */
function createErrorResponse(message, code = 'ERROR') {
  return {
    version: PROTOCOL_VERSION,
    status: 'error',
    error: {
      code,
      message,
    },
    timestamp: Date.now(),
  };
}

/**
 * 解析请求
 * @param {string} raw
 * @returns {Object}
 */
function parseRequest(raw) {
  try {
    const request = JSON.parse(raw);

    // 验证必要字段
    if (!request.command) {
      throw new Error('Missing command field');
    }

    return {
      command: request.command,
      params: request.params || {},
    };
  } catch (err) {
    throw new Error(`Invalid request format: ${err.message}`);
  }
}

/**
 * 支持的命令
 */
const COMMANDS = {
  STATUS: 'status',
  COMBINED: 'combined',
  HUD: 'hud',
  HEALTH: 'health',
  STOP: 'stop',
};

module.exports = {
  PROTOCOL_VERSION,
  createResponse,
  createErrorResponse,
  parseRequest,
  COMMANDS,
};
