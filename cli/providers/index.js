const MinimaxProvider = require('./minimax-provider');
const InfiniProvider = require('./infini-provider');

// 注册内置供应商
const providers = new Map([
  ['minimax', MinimaxProvider],
  ['infini', InfiniProvider],
]);

/**
 * 获取供应商类
 * @param {string} providerId
 * @returns {typeof import('./base-provider')|undefined}
 */
function getProviderClass(providerId) {
  return providers.get(providerId);
}

/**
 * 获取所有已注册的供应商信息
 * @returns {Array<{id: string, displayName: string, configSchema: Array}>}
 */
function listProviders() {
  const result = [];
  for (const [id, ProviderClass] of providers) {
    result.push({
      id,
      displayName: ProviderClass.displayName,
      configSchema: ProviderClass.getConfigSchema(),
    });
  }
  return result;
}

/**
 * 创建供应商实例
 * @param {string} providerId
 * @param {Object} config
 * @returns {import('./base-provider')}
 */
function createProvider(providerId, config) {
  const ProviderClass = providers.get(providerId);
  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return new ProviderClass(config);
}

/**
 * 检查供应商是否存在
 * @param {string} providerId
 * @returns {boolean}
 */
function hasProvider(providerId) {
  return providers.has(providerId);
}

/**
 * 获取所有供应商 ID
 * @returns {string[]}
 */
function getProviderIds() {
  return Array.from(providers.keys());
}

module.exports = {
  getProviderClass,
  listProviders,
  createProvider,
  hasProvider,
  getProviderIds,
  MinimaxProvider,
  InfiniProvider,
};
