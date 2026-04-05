# CodingPlan Status

在 VS Code 状态栏实时显示 Coding Plan 额度与用量，支持 MiniMax、Infini AI 等多供应商。

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.codingplan-status-vscode)
[![Version](https://img.shields.io/badge/version-1.0.0-green?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=JochenYang.codingplan-status-vscode)

---

## 支持的供应商

| 供应商 | 说明 |
|--------|------|
| **Infini AI** | GenStudio Infini 编码套餐 |
| **MiniMax** | MiniMax Token-Plan 编程套餐 |

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **多供应商支持** | 支持 Infini AI、MiniMax 等多个 Coding Plan 供应商 |
| **实时状态栏** | 显示剩余时间、当前用量百分比、周用量 |
| **智能颜色提示** | 使用率 60%/85% 分界变色（绿/黄/红） |
| **悬停详情** | 查看模型、用量、剩余时间、时间窗口 |
| **侧边栏入口** | 点击图标快速进入设置或查看帮助 |
| **双语支持** | 中文/英文界面 |

---

## 快速开始

### 1. 安装扩展

```bash
cd vscode-extension

# 安装依赖
bun install

# 编译并打包
bun run package

# 在 VS Code 中安装生成的 .vsix 文件
# code --install-extension codingplan-status-vscode-1.0.0.vsix
```

**开发模式**：

```bash
# 监听文件变化自动重新编译
bun run watch
```

### 2. 配置认证

1. 点击左侧边栏的 CodingPlan 图标
2. 点击「插件设置」
3. 选择供应商并填写 **API Key**

### 3. 获取认证信息

**Infini AI:**

1. 访问 [Infini Coding Plan 页面](https://cloud.infini-ai.com/genstudio/code)
2. 登录并获取 API Key (以 `sk-cp-` 开头)

**MiniMax:**

1. 访问 [MiniMax 开放平台](https://platform.minimaxi.com/user-center/payment/coding-plan)
2. 套餐管理 → Token-Plan 中创建或获取 API Key

### 4. 查看状态

配置完成后，状态栏显示：

```
Infini AI: 30% · 2h30m
```

- `Infini AI` - 当前供应商名称
- `30%` - 当前用量百分比
- `2h30m` - 距离重置的剩余时间

---

## 界面预览

### 状态栏

```
MiniMax: 45% · 1h20m
```

### Tooltip 详情

```
**MiniMax**

5h: ██████░░░░ 45% (2250/5000)

Week: ███░░░░░░░ 30%

Reset: 1 小时 20 分钟后重置
```

---

## 颜色编码

| 颜色 | 用量范围 | 状态 |
|------|----------|------|
| 🟢 绿色 | 0-59% | 正常使用 |
| 🟡 黄色 | 60-84% | 注意使用 |
| 🔴 红色 | 85%+ | 接近限额 |

---

## 配置共享

本扩展与 CLI 工具共享配置文件 `~/.codingplan-config.json`。

安装 CLI 工具：

```bash
bun add -g github:Vncntvx/codingplan-status
# 或
npm install -g github:Vncntvx/codingplan-status
```

配置后，CLI 和 VS Code 扩展将使用相同的凭据。

---

## 常见问题

**Q: 状态栏不显示？**

请检查：

- 是否已正确配置 API Key
- 扩展是否已激活（重启 VS Code）
- 网络连接是否正常

**Q: 显示 "点击配置"？**

1. 点击状态栏上的提示
2. 或点击左侧边栏 CodingPlan 图标 → 「插件设置」

**Q: 如何切换供应商？**

点击左侧边栏中的供应商名称，或使用命令面板执行 "CodingPlan Status: 切换供应商"。

---

## 相关链接

- [Infini AI](https://cloud.infini-ai.com/)
- [MiniMax 开放平台](https://platform.minimaxi.com/)
- [GitHub 仓库](https://github.com/Vncntvx/codingplan-status)

---

> **隐私说明**：本扩展仅用于显示 Coding Plan 额度与用量，不存储或传输用户数据。认证信息保存在本地配置文件中。
