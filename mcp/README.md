# 知一刻只读 MCP

正式服务地址：`https://zhiyike.cn/mcp`，连接方式为 Streamable HTTP。

公开六个只读工具：

- `list_news`
- `get_news_detail`
- `search_library`
- `list_reports`
- `get_report`
- `github_trending`

源码只负责安全读取已经发布的数据。本仓库不包含正式新闻数据库。`sample-data/` 仅用于本地检查。

## 本地检查

需要 Node.js 22.18 或更高版本。

```bash
npm install
npm test
MCP_DATA_DIR=./sample-data npm start
```

本地服务默认监听 `127.0.0.1:3100`。正式部署仍需要 HTTPS、反向代理、独立只读账号和公开数据目录，不能直接把示例命令当作生产部署。
