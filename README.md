# dsh-usage-daily

> DeepSeek Harness 用量日报插件 · 右下角浮窗，一眼看清 AI 每天烧掉多少 token 和钱 🐋

一个给 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) Web 界面用的**用量日报**小挂件。常驻右下角，自动统计当天各会话的 token 消耗、消息数、轮数，并用 DeepSeek 价格估算费用。

## ✨ 特性

- 📊 **今日用量汇总**：输入/输出/缓存 token、消息数、轮数、估算费用
- 🔄 **60s 自动刷新** + 服务端缓存，不刷屏、不额外压榨 API
- 💰 **费用估算**：按 DeepSeek 默认价计算，可用环境变量覆盖
- 🐳 **浮窗 UI**：右下角半透明卡片，NaN 安全，刷新即用
- 🔌 **HTTP 接口**：`GET /api/dsh-usage-daily/report` 返回当日聚合 JSON，方便二次开发

## 📦 安装

```powershell
# 推荐：本地链接安装
dsh plugin --profile web add link:<本仓库绝对路径>

# 重启 dsh web，然后 F5 刷新浏览器
# 右下角即可看到用量日报浮窗
```

> 数据来自 DSH 自身的会话日志（`sessionQuery.readSession`），**无需任何令牌与平台费用**。

## ⚙️ 配置

费用估算可通过环境变量覆盖（单位：USD / 百万 token）：

| 变量 | 默认值 |
|---|---|
| `DSH_USAGE_INPUT_PER_M` | `0.27` |
| `DSH_USAGE_OUTPUT_PER_M` | `1.10` |
| `DSH_USAGE_CACHE_READ_PER_M` | `0.07` |
| `DSH_USAGE_CACHE_WRITE_PER_M` | `0.27` |

## 🌐 接口

```
GET /api/dsh-usage-daily/report
```

```json
{
  "ok": true,
  "date": "2026-01-01",
  "sessions": 3,
  "messages": 41,
  "turns": 12,
  "totals": { "input": 12345, "output": 6789, "cacheRead": 0, "cacheWrite": 0 },
  "totalTokens": 19134,
  "costUsd": 0.0087,
  "perSession": [
    { "id": "session-1", "messages": 20, "turns": 8, "tokens": 12345 }
  ]
}
```

## 🔧 技术说明

- 插件使用 DSH 的**会话查询服务**（`sessionQuery.listSessions` / `readSession`）聚合当日事件
- 通过 `webServer` 注册接口 + 用 `tapIndex` 注入右下角浮窗脚本
- 纯 Node ESM，无外部依赖

## 🧾 License

[MIT](LICENSE)

---

喜欢的话点个 ⭐ / 在 b站关注 [YOUTOGER](https://space.bilibili.com/504189519) 支持一下～
