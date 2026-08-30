# dsh-usage-daily

DSH（DeepSeek Harness）Web 界面右下角的**用量日报**浮窗：统计今天各会话的 token 消耗、消息数、轮数，并给出估算费用。

## 安装

```powershell
dsh plugin --profile web add link:<本仓库绝对路径>
# 重启 dsh web，F5 刷新浏览器即可在右下角看到浮窗
```

数据来自 DSH 自身的会话日志（`sessionQuery.readSession`），无需任何令牌与平台费用。

## 说明

- 只在浏览器打开页面后轮询（60s 刷新），服务端无额外请求压力
- 费用为估算值，按 DeepSeek 默认价（可通过环境变量 `DSH_USAGE_INPUT_PER_M` / `DSH_USAGE_OUTPUT_PER_M` / `DSH_USAGE_CACHE_READ_PER_M` / `DSH_USAGE_CACHE_WRITE_PER_M`，单位 USD/百万 token）覆盖
- 提供 HTTP 接口 `GET /api/dsh-usage-daily/report` 返回当日聚合 JSON

## License

MIT
