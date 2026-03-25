---
name: minimax-usage
version: 1.0.0
author: Jochen
description: 查询 MiniMax Token Plan 使用量和历史消耗统计
triggers:
  - 使用量
  - 消耗
  - 剩余
  - 额度
  - 账单
  - 历史
  - minimax
  - MiniMax
capabilities:
  - id: get-usage
    description: 获取当前使用量和剩余额度
  - id: get-history
    description: 获取历史消耗统计
---

# MiniMax 使用量查询

查询 MiniMax Token Plan 的使用量和历史消耗记录。

## 功能

1. **当前使用量**：查看剩余额度、已用次数、使用百分比、重置时间
2. **周用量**：查看本周使用量、百分比、重置时间（每周日重置）
3. **历史消耗**：查看昨日消耗、近7天消耗、套餐总消耗

## 使用方式

```bash
node /path/to/openclaw/minimax-usage/scripts/get-usage.js
```

## 脚本输出格式

JSON 格式返回以下字段：

- `model`: 当前模型名称
- `timeWindow`: 时间窗口（开始时间、结束时间、时区）
- `remaining`: 剩余时间（小时、分钟、文本描述）
- `usage`: 使用量（已用、剩余、总数、百分比）
- `weekly`: 周用量（已用、总数、百分比、天数、小时、重置时间）
- `contextWindow`: 上下文窗口信息
- `expiry`: 到期信息（日期、剩余天数、文本）
- `allModels`: 所有模型的详细额度数组
- `stats`: 历史统计（昨日、近7天、套餐总消耗）

### allModels 数组字段

每个模型对象包含：

- `name`: 模型名称
- `used`: 已使用次数
- `remaining`: 剩余次数
- `total`: 总限额
- `percentage`: 使用百分比
- `unlimited`: 是否无限额
- `weeklyPercentage`: 周使用百分比
- `weeklyTotal`: 周总限额
- `weeklyRemainingCount`: 周剩余次数

## ⚠️ API 字段说明

MiniMax API 字段命名有误导性：

| 字段名 | 实际含义 |
|--------|----------|
| `current_interval_usage_count` | 实际存的是**剩余配额**，不是已用 |
| `current_weekly_usage_count` | 实际存的是**每周剩余配额** |

**正确计算公式**：
- 已用 = `total_count - usage_count`
- 剩余 = `usage_count`（字段本身就是剩余）

## 输出说明

- **使用量格式**：`已用 / 总量`，如 `50 / 4,500`
- **重置时间**：当前周期重置的倒计时
- **周用量**：本周已用次数、百分比、重置倒计时（每周日重置）
- **昨日消耗**：昨日 0 点到现在的 token 消耗
- **近7天**：最近 7 天的 token 消耗总量
- **套餐总消耗**：当前订阅周期的 token 消耗总量

## 认证配置

如果 OpenClaw 运行在远程服务器上，需要通过环境变量传递认证信息：

```bash
# 在运行 OpenClaw 的服务器上设置环境变量
export MINIMAX_TOKEN="your_token_here"
```

或者在启动 OpenClaw 时传入：

```bash
MINIMAX_TOKEN=xxx openclaw
```

获取凭据方法：查看本地 `~/.minimax-config.json` 文件
