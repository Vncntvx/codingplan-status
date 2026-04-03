# CodingPlan StatusBar

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Coding Plan 额度与用量监控工具，支持多供应商（无问芯穹(Infini AI)、MiniMax）。

## 支持的供应商

| 供应商 | 说明 |
|--------|------|
| **Infini AI** | GenStudio Infini 编码套餐 |
| **MiniMax** | MiniMax Token-Plan 编程套餐 |

## 特性

- ✅ **多供应商支持**: 支持 Infini AI、MiniMax 等多个 Coding Plan 供应商
- ✅ **实时状态监控**: 显示使用额度、剩余次数、重置时间
- ✅ **多种显示模式**: 详细模式、紧凑模式、持续状态栏
- ✅ **Claude Code 集成**: 可在 Claude Code 底部状态栏显示
- ✅ **智能颜色编码**: 根据使用率自动切换颜色和图标
- ✅ **简洁命令**: `cps status` 查看状态

## 安装

### 方式一：从 Git 仓库安装（推荐）

```bash
# 使用 bun（推荐）
bun add -g github:Vncntvx/codingplan-status

# 或使用 npm
npm install -g github:Vncntvx/codingplan-status

# 指定分支/标签
bun add -g github:Vncntvx/codingplan-status#main
```

### 方式二：本地克隆安装

```bash
# 克隆项目
git clone <repository>
cd codingplan-status

# 安装依赖
bun install
# 或 npm install

# 全局链接
bun link
# 或 npm link
```

安装完成后，`cps` 命令将全局可用。

## 快速开始

### 1. 配置认证

```bash
# 配置 Infini AI
cps auth infini sk-cp-xxxxx

# 或配置 MiniMax
cps auth minimax <token>
```

获取令牌:

**Infini AI:**

1. 访问 [Infini Coding Plan 页面](https://cloud.infini-ai.com/genstudio/code)
2. 登录并获取 API Key (以 `sk-cp-` 开头)

**MiniMax:**

1. 访问 [MiniMax 开放平台](https://platform.minimaxi.com/user-center/payment/coding-plan)
2. 登录并进入控制台
3. Coding Plan 中创建或获取 API Key

### 2. 查看状态

```bash
# 详细模式
cps status

# 紧凑模式
cps status --compact

# 持续监控模式
cps status --watch
```

## 命令说明

### 供应商管理

| 命令 | 描述 |
|------|------|
| `cps providers` | 列出所有支持的供应商（标记已配置状态） |
| `cps use <provider>` | 切换当前供应商 |
| `cps auth <provider> <token>` | 设置供应商认证凭据 |
| `cps config` | 查看当前配置 |

### 配置管理

| 命令 | 描述 |
|------|------|
| `cps config` | 查看当前配置和设置 |
| `cps config-set <key> <value>` | 设置配置项 |
| `cps config-get [key]` | 获取配置项值 |

**支持的配置项：**

| 配置项 | 说明 | 默认值 | 范围 |
|--------|------|--------|------|
| `cacheTTL` | 缓存有效期（毫秒） | 30000 | 5000-60000 |
| `debug` | 调试模式 | false | true/false |

**示例：**

```bash
# 设置缓存有效期为 20 秒
cps config-set cacheTTL 20000

# 开启调试模式
cps config-set debug true

# 查看缓存配置
cps config-get cacheTTL
```

### 状态查询

| 命令 | 描述 |
|------|------|
| `cps status` | 显示当前供应商额度与用量 |
| `cps status <provider>` | 显示指定供应商额度与用量 |
| `cps status --compact` | 紧凑模式显示 |
| `cps status --watch` | 实时监控模式 |
| `cps status --force` | 强制刷新缓存 |
| `cps list` | 显示当前供应商所有模型的额度与用量 |
| `cps list <provider>` | 显示指定供应商所有模型的额度与用量 |
| `cps bar` | 终端底部持续状态栏 |

### 状态栏集成

| 命令 | 描述 |
|------|------|
| `cps setup claude` | 配置 Claude Code 状态栏集成 |
| `cps setup claude --remove` | 移除 Claude Code 状态栏集成 |

## VS Code 扩展

提供 VS Code 状态栏实时显示 Coding Plan 额度与用量。

### 安装方式

```bash
# 进入扩展目录
cd vscode-extension

# 安装依赖
bun install
# 或 npm install

# 编译打包
npx vsce package

# 生成的 .vsix 文件可在 VS Code 中安装
# VS Code -> 扩展 -> ... -> 从 VSIX 安装
```

### 配置使用

1. 点击左侧边栏的 CodingPlan 图标
2. 点击「插件设置」
3. 选择供应商并填写 API Key

配置与 CLI 工具共享 `~/.codingplan-config.json`，配置一次即可同时用于 CLI 和 VS Code。

### 功能特性

- 状态栏显示供应商名称、用量百分比
- 悬浮显示详细信息（5小时/周限额/月限额）、点击显示信息提示
- 多供应商切换

## Claude Code 集成

将额度与用量显示在 Claude Code 底部状态栏。

### 配置步骤

1. **安装工具**:

   ```bash
   bun add -g github:Vncntvx/codingplan-status
   # 或 npm install -g github:Vncntvx/codingplan-status
   ```

2. **配置认证**:

   ```bash
   cps auth infini sk-cp-xxxxx
   # 或
   cps auth minimax <token>
   ```

3. **自动配置**:

   ```bash
   cps setup claude
   ```

4. **重启 Claude Code**

集成成功后，底部状态栏将显示:

```text
 5h   60% ██████░░░░      7d   30% ███░░░░░░░
```

## 显示示例

### 详细模式

**Infini AI:**

```text
┌────────────────────────────────────────────────────────┐
│ Infini AI 额度与用量                                   │
│                                                        │
│ 5小时 : ████░░░░░░░░░░░░░░░░░░░░░░░░░░ 16% (158/1000)  │
│                                                        │
│ 周限额: █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 6% (357/6000)   │
│                                                        │
│ 月限额: ███░░░░░░░░░░░░░░░░░░░░░░░░░░░ 12% (1449/12000)│
│                                                        │
│ 状态  : ✓ 正常使用                                    │
└────────────────────────────────────────────────────────┘
```

**MiniMax:**

```text
┌──────────────────────────────────────────────────────┐
│ MiniMax 额度与用量                                   │
│                                                      │
│ 模型  : MiniMax-M2                                   │
│ 时间窗: 20:00-00:00 (UTC+8)                          │
│ 重置  : 1 小时 42 分钟后重置                         │
│                                                      │
│ 5小时 : █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 6% (266/4500) │
│ 剩余  : 4234/4500 次                                 │
│                                                      │
│ 周限额: █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 6% (357/6000) │
│                                                      │
│ 到期  : 02/26/2026 (还剩 6 天)                       │
│                                                      │
│ 状态  : ✓ 正常使用                                   │
└──────────────────────────────────────────────────────┘
```

### 紧凑模式

```text
● MiniMax-M2 27% • 1 小时 26 分钟后重置 • ✓ 正常使用
```

## 颜色规则

### 使用百分比

| 场景 | 颜色 | 说明 |
|------|------|------|
| ≥85% | 红色 | 危险状态 |
| 60-85% | 黄色 | 注意使用 |
| <60% | 绿色 | 正常使用 |

## 配置文件

配置存储在 `~/.codingplan-config.json`:

```json
{
  "version": 1,
  "currentProvider": "infini",
  "providers": {
    "infini": {
      "token": "sk-cp-xxx..."
    },
    "minimax": {
      "token": "xxx..."
    }
  },
  "settings": {
    "cacheTTL": 30000,
    "debug": false
  }
}
```

缓存数据存储在 `~/.codingplan-cache.json`。

### 环境变量

| 变量 | 说明 |
|------|------|
| `CPS_DEBUG` | 开启调试日志（`true`） |
| `CPS_CACHE_TTL` | 覆盖缓存 TTL（毫秒） |

**示例：**

```bash
# 开启调试模式
export CPS_DEBUG=true

# 覆盖缓存 TTL 为 20 秒
export CPS_CACHE_TTL=20000
```

### 安全说明

凭据仅存储在本地，不会上传到任何服务器。配置文件权限自动设为 `0600`（仅所有者可读写）。

## 故障排除

### 命令未找到

```bash
# 方式一：重新从 Git 安装
bun add -g github:Vncntvx/codingplan-status
# 或 npm install -g github:Vncntvx/codingplan-status

# 方式二：本地安装时确保执行了 link
cd codingplan-status
bun link
# 或 npm link
```

### 认证失败

```bash
# 检查令牌
cps status

# 重新设置认证
cps auth infini <new_token>
```

### 状态栏不显示

1. 运行 `cps setup claude` 重新配置
2. 重启 Claude Code
3. 手动测试: `cps-claudecode-statusline`

### 调试模式

开启调试模式查看详细日志：

```bash
# 方式一：环境变量
CPS_DEBUG=true cps status

# 方式二：配置设置
cps config-set debug true
cps status
```

调试模式会输出：
- 缓存命中/未命中
- API 请求详情
- 错误详细信息

### 清除缓存

```bash
# 删除缓存文件
rm ~/.codingplan-cache.json

# 或使用 --force 强制刷新
cps status --force
```

## 卸载

```bash
# 从 Git 安装的卸载
bun remove -g codingplan-status
# 或 npm uninstall -g codingplan-status

# 本地安装的卸载
bun unlink
# 或 npm unlink -g codingplan-status
rm -rf codingplan-status
rm ~/.codingplan-config.json
```

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## 相关链接

- [Infini AI](https://cloud.infini-ai.com/)
- [MiniMax 开放平台](https://platform.minimaxi.com/)

---

**注意**: 本工具仅用于监控 Coding Plan 用量额度与用量，不存储或传输任何用户数据。
